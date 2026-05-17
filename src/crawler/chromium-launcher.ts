import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type ChromiumLaunchOptions = {
  executablePath?: string;
  launchTimeoutMs?: number;
  extraArgs?: string[];
};

async function resolveExecutablePath(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const pw = await import("playwright");
  return pw.chromium.executablePath();
}

export type ChromiumProcess = {
  wsEndpoint: string;
  close: () => Promise<void>;
};

const DEFAULT_LAUNCH_TIMEOUT = 60_000;

const DEFAULT_ARGS = [
  "--headless=new",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--disable-background-networking",
  "--disable-default-apps",
  "--disable-extensions",
  "--disable-sync",
  "--disable-translate",
  "--metrics-recording-only",
  "--mute-audio",
  "--no-first-run",
  "--no-default-browser-check",
  "--password-store=basic",
];

export async function launchChromium(opts: ChromiumLaunchOptions = {}): Promise<ChromiumProcess> {
  const launchTimeoutMs = opts.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT;
  const executablePath = await resolveExecutablePath(opts.executablePath);
  const userDataDir = mkdtempSync(join(tmpdir(), "docs-mcp-chromium-"));

  const args = [
    ...DEFAULT_ARGS,
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    ...(opts.extraArgs ?? []),
    "about:blank",
  ];

  const child: ChildProcess = spawn(executablePath, args, {
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });

  let exited = false;
  child.once("exit", () => {
    exited = true;
  });

  const wsEndpoint = await waitForWsEndpoint(child, launchTimeoutMs).catch(async (err) => {
    await killChild(child);
    cleanupUserDataDir(userDataDir);
    throw err;
  });

  return {
    wsEndpoint,
    async close() {
      if (!exited) await killChild(child);
      cleanupUserDataDir(userDataDir);
    },
  };
}

function waitForWsEndpoint(child: ChildProcess, launchTimeoutMs: number): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const stderr = child.stderr;
    if (!stderr) {
      reject(new Error("chromium-launcher: stderr pipe unavailable"));
      return;
    }
    let buffer = "";
    let settled = false;

    const onData = (chunk: Buffer | string) => {
      const text = typeof chunk === "string" ? chunk : chunk.toString("utf-8");
      buffer += text;
      const m = buffer.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m && !settled) {
        settled = true;
        cleanup();
        resolve(m[1] as string);
      }
      // Cap the buffer; chromium may emit many log lines while we wait.
      if (buffer.length > 65_536) buffer = buffer.slice(-65_536);
    };

    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        new Error(
          `chromium exited before DevTools URL appeared (code=${code}, signal=${signal})\n${buffer}`,
        ),
      );
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(`chromium did not advertise DevTools URL within ${launchTimeoutMs}ms`));
    }, launchTimeoutMs);
    timer.unref?.();

    const cleanup = () => {
      stderr.off("data", onData);
      child.off("exit", onExit);
      clearTimeout(timer);
    };

    stderr.on("data", onData);
    child.once("exit", onExit);
  });
}

function killChild(child: ChildProcess): Promise<void> {
  return new Promise<void>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve();
      return;
    }
    const onExit = () => resolve();
    child.once("exit", onExit);
    try {
      child.kill("SIGTERM");
    } catch {}
    setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {}
      resolve();
    }, 3_000).unref?.();
  });
}

function cleanupUserDataDir(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
