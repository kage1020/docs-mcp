import { type ChildProcess, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DEFAULT_USER_AGENT, type FetchOptions, type FetchResult } from "./fetcher.ts";

export type PlaywrightFetcherOptions = {
  userAgent?: string;
  defaultTimeoutMs?: number;
  defaultMaxBodyBytes?: number;
  launchTimeoutMs?: number;
  nodePath?: string;
};

export type PlaywrightFetcherHandle = {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
const DEFAULT_LAUNCH_TIMEOUT = 60_000;

type FetchResponse = {
  id: number;
  ok: true;
  status: number;
  headers: Record<string, string>;
  body: string;
  url: string;
  bodyTruncated: boolean;
};
type FetchErrorResponse = {
  id: number;
  ok: false;
  error: string;
};
type WorkerMessage =
  | { type: "ready" }
  | { type: "launch_error"; message: string }
  | FetchResponse
  | FetchErrorResponse;

type Pending = {
  resolve: (value: FetchResponse) => void;
  reject: (err: Error) => void;
};

function workerScriptPath(): string {
  return fileURLToPath(new URL("./playwright-worker.mjs", import.meta.url));
}

export async function createPlaywrightFetcher(
  opts: PlaywrightFetcherOptions = {},
): Promise<PlaywrightFetcherHandle> {
  const userAgent = opts.userAgent ?? DEFAULT_USER_AGENT;
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT;
  const defaultMaxBodyBytes = opts.defaultMaxBodyBytes ?? DEFAULT_MAX_BODY;
  const launchTimeoutMs = opts.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT;
  const nodePath = opts.nodePath ?? "node";

  const scriptPath = workerScriptPath();
  const child: ChildProcess = spawn(nodePath, [scriptPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      DOCS_MCP_PLAYWRIGHT_LAUNCH_TIMEOUT: String(launchTimeoutMs),
      DOCS_MCP_USER_AGENT: userAgent,
    },
    windowsHide: true,
  });

  const stdin = child.stdin;
  const stdout = child.stdout;
  const stderr = child.stderr;
  if (!stdin || !stdout || !stderr) {
    child.kill("SIGTERM");
    throw new Error("playwright-fetcher: failed to obtain child stdio pipes");
  }

  // Forward worker stderr to parent stderr (logs, warnings).
  stderr.setEncoding("utf-8");
  stderr.on("data", (chunk: string) => {
    process.stderr.write(chunk);
  });

  let nextId = 0;
  const pending = new Map<number, Pending>();

  const onWorkerExit = (code: number | null, signal: NodeJS.Signals | null) => {
    const reason = `playwright worker exited (code=${code}, signal=${signal})`;
    for (const [, p] of pending) p.reject(new Error(reason));
    pending.clear();
  };
  child.once("exit", onWorkerExit);

  // Wait for "ready" (or launch_error) before returning the handle.
  await new Promise<void>((resolve, reject) => {
    const onReadyData = (chunk: string) => {
      buffer += chunk;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line) {
          nl = buffer.indexOf("\n");
          continue;
        }
        try {
          const msg = JSON.parse(line) as WorkerMessage;
          if (msg && "type" in msg && msg.type === "ready") {
            stdout.off("data", onReadyData);
            child.off("exit", onReadyExit);
            // Hand stdout off to the steady-state dispatcher.
            stdout.on("data", onSteadyData);
            // Replay anything still in the buffer.
            if (buffer.length > 0) {
              const replay = buffer;
              buffer = "";
              onSteadyData(replay);
            }
            resolve();
            return;
          }
          if (msg && "type" in msg && msg.type === "launch_error") {
            stdout.off("data", onReadyData);
            child.off("exit", onReadyExit);
            reject(new Error(`playwright launch failed: ${msg.message}`));
            return;
          }
        } catch {
          // ignore malformed pre-ready output
        }
        nl = buffer.indexOf("\n");
      }
    };
    const onReadyExit = (code: number | null, signal: NodeJS.Signals | null) => {
      stdout.off("data", onReadyData);
      reject(new Error(`playwright worker died before ready (code=${code}, signal=${signal})`));
    };
    let buffer = "";
    stdout.setEncoding("utf-8");
    stdout.on("data", onReadyData);
    child.once("exit", onReadyExit);
    // Hard deadline: launch timeout + 5s grace.
    setTimeout(() => {
      stdout.off("data", onReadyData);
      child.off("exit", onReadyExit);
      reject(new Error(`playwright worker did not become ready in ${launchTimeoutMs}ms`));
    }, launchTimeoutMs + 5_000).unref?.();
  });

  let steadyBuffer = "";
  function onSteadyData(chunk: string): void {
    steadyBuffer += chunk;
    for (;;) {
      const nl = steadyBuffer.indexOf("\n");
      if (nl < 0) break;
      const line = steadyBuffer.slice(0, nl).trim();
      steadyBuffer = steadyBuffer.slice(nl + 1);
      if (!line) continue;
      let msg: WorkerMessage;
      try {
        msg = JSON.parse(line) as WorkerMessage;
      } catch {
        continue;
      }
      if ("type" in msg) continue;
      const p = pending.get(msg.id);
      if (!p) continue;
      pending.delete(msg.id);
      if (msg.ok) p.resolve(msg);
      else p.reject(new Error(msg.error));
    }
  }

  return {
    async fetch(url, fetchOpts = {}): Promise<FetchResult> {
      const id = ++nextId;
      const timeoutMs = fetchOpts.timeoutMs ?? defaultTimeoutMs;
      const maxBodyBytes = fetchOpts.maxBodyBytes ?? defaultMaxBodyBytes;
      const signal = fetchOpts.signal;
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

      const promise = new Promise<FetchResponse>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        stdin.write(`${JSON.stringify({ id, op: "fetch", url, timeoutMs, maxBodyBytes })}\n`);
        if (signal) {
          const onAbort = () => {
            if (pending.delete(id)) reject(new DOMException("Aborted", "AbortError"));
          };
          signal.addEventListener("abort", onAbort, { once: true });
        }
        // Hard parent-side ceiling: if the worker never replies (page.goto
        // wedged inside chromium, for example), give up at 2× the page
        // timeout instead of dangling forever.
        const ceiling = timeoutMs * 2 + 5_000;
        setTimeout(() => {
          if (pending.delete(id))
            reject(new Error(`playwright fetch ${url} timed out after ${ceiling}ms`));
        }, ceiling).unref?.();
      });
      const res = await promise;
      const headers = new Headers();
      for (const [k, v] of Object.entries(res.headers)) {
        // Some upstream servers emit malformed header values (e.g. multi-line
        // permissions-policy with embedded newlines). The HTTP spec forbids
        // these but they reach us anyway; Headers.set() throws. Skip them
        // rather than failing the entire fetch.
        try {
          headers.set(k, v);
        } catch {}
      }
      return {
        status: res.status,
        headers,
        body: res.body,
        url: res.url || url,
        bodyTruncated: res.bodyTruncated,
      };
    },
    async close(): Promise<void> {
      child.off("exit", onWorkerExit);
      try {
        stdin.write(`${JSON.stringify({ op: "close" })}\n`);
        stdin.end();
      } catch {
        // pipe may already be closed
      }
      await new Promise<void>((resolve) => {
        if (child.exitCode !== null) {
          resolve();
          return;
        }
        child.once("exit", () => resolve());
        setTimeout(() => {
          child.kill("SIGKILL");
          resolve();
        }, 5_000).unref?.();
      });
    },
  };
}
