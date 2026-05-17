// Minimal Chrome DevTools Protocol client. Speaks raw WebSocket so it works
// under Bun on Windows, where playwright's bundled `ws` package can't
// complete the upgrade handshake.
//
// Scope is intentionally narrow: spin up a page, navigate, capture the
// main-frame response status/headers, and read the rendered HTML.

import type { FetchOptions, FetchResult } from "./fetcher.ts";

export type CdpClientOptions = {
  userAgent?: string;
  defaultTimeoutMs?: number;
  defaultMaxBodyBytes?: number;
  connectTimeoutMs?: number;
};

export type CdpClient = {
  fetch: (url: string, opts?: FetchOptions) => Promise<FetchResult>;
  close: () => Promise<void>;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BODY = 5 * 1024 * 1024;
const DEFAULT_CONNECT_TIMEOUT = 30_000;
const NETWORK_IDLE_MS = 500;

type CdpRequest = {
  id: number;
  method: string;
  params?: unknown;
  sessionId?: string;
};

type CdpResponse = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  sessionId?: string;
};

type Pending = {
  resolve: (value: Record<string, unknown>) => void;
  reject: (err: Error) => void;
};

export async function createCdpClient(
  wsEndpoint: string,
  opts: CdpClientOptions = {},
): Promise<CdpClient> {
  const userAgent = opts.userAgent;
  const defaultTimeoutMs = opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT;
  const defaultMaxBodyBytes = opts.defaultMaxBodyBytes ?? DEFAULT_MAX_BODY;
  const connectTimeoutMs = opts.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT;

  const ws = new WebSocket(wsEndpoint);
  let nextId = 0;
  const pending = new Map<number, Pending>();
  const sessionListeners = new Map<string, Set<(event: CdpEvent) => void>>();
  let closed = false;
  let closeError: Error | null = null;

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try {
        ws.close();
      } catch {}
      reject(new Error(`cdp: WebSocket connect timed out after ${connectTimeoutMs}ms`));
    }, connectTimeoutMs);
    timer.unref?.();
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("cdp: WebSocket failed to open"));
    });
  });

  ws.addEventListener("message", (event: MessageEvent) => {
    let msg: CdpResponse;
    try {
      msg = JSON.parse(typeof event.data === "string" ? event.data : String(event.data));
    } catch {
      return;
    }
    if (typeof msg.id === "number") {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
      else p.resolve(msg.result ?? {});
      return;
    }
    if (msg.method && msg.sessionId) {
      const set = sessionListeners.get(msg.sessionId);
      if (!set) return;
      const ev: CdpEvent = { method: msg.method, params: msg.params ?? {} };
      for (const fn of set) fn(ev);
    }
  });

  ws.addEventListener("close", () => {
    closed = true;
    closeError = closeError ?? new Error("cdp: WebSocket closed");
    for (const [, p] of pending) p.reject(closeError);
    pending.clear();
  });
  ws.addEventListener("error", () => {
    closeError = closeError ?? new Error("cdp: WebSocket error");
  });

  function send<T = Record<string, unknown>>(req: Omit<CdpRequest, "id">): Promise<T> {
    if (closed) return Promise.reject(closeError ?? new Error("cdp: connection closed"));
    const id = ++nextId;
    const payload: CdpRequest = { id, ...req };
    return new Promise<T>((resolve, reject) => {
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
      });
      try {
        ws.send(JSON.stringify(payload));
      } catch (err) {
        pending.delete(id);
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  function onSessionEvent(sessionId: string, fn: (event: CdpEvent) => void): () => void {
    let set = sessionListeners.get(sessionId);
    if (!set) {
      set = new Set();
      sessionListeners.set(sessionId, set);
    }
    set.add(fn);
    return () => {
      set?.delete(fn);
      if (set && set.size === 0) sessionListeners.delete(sessionId);
    };
  }

  async function fetchOne(url: string, fetchOpts: FetchOptions = {}): Promise<FetchResult> {
    const timeoutMs = fetchOpts.timeoutMs ?? defaultTimeoutMs;
    const maxBodyBytes = fetchOpts.maxBodyBytes ?? defaultMaxBodyBytes;
    const perFetchUA = fetchOpts.userAgent ?? userAgent;

    const { targetId } = await send<{ targetId: string }>({
      method: "Target.createTarget",
      params: { url: "about:blank" },
    });

    const { sessionId } = await send<{ sessionId: string }>({
      method: "Target.attachToTarget",
      params: { targetId, flatten: true },
    });

    const navState = {
      mainFrameId: null as string | null,
      response: null as { status: number; headers: Record<string, string>; url: string } | null,
      domContentLoaded: false,
      loadFired: false,
      inFlight: new Set<string>(),
      lastIdleAt: Date.now(),
    };

    const off = onSessionEvent(sessionId, (event) => {
      switch (event.method) {
        case "Page.frameStartedLoading": {
          const fid = (event.params as { frameId?: string }).frameId;
          if (fid && !navState.mainFrameId) navState.mainFrameId = fid;
          break;
        }
        case "Page.frameNavigated": {
          const frame = (event.params as { frame?: { id?: string; parentId?: string } }).frame;
          if (frame && !frame.parentId && frame.id) navState.mainFrameId = frame.id;
          break;
        }
        case "Network.requestWillBeSent": {
          const p = event.params as { requestId?: string };
          if (p.requestId) navState.inFlight.add(p.requestId);
          break;
        }
        case "Network.loadingFinished":
        case "Network.loadingFailed": {
          const p = event.params as { requestId?: string };
          if (p.requestId) navState.inFlight.delete(p.requestId);
          navState.lastIdleAt = Date.now();
          break;
        }
        case "Network.responseReceived": {
          const p = event.params as {
            frameId?: string;
            type?: string;
            response?: { status?: number; headers?: Record<string, string>; url?: string };
          };
          if (
            p.type === "Document" &&
            p.frameId &&
            (navState.mainFrameId === null || p.frameId === navState.mainFrameId) &&
            p.response
          ) {
            navState.response = {
              status: p.response.status ?? 0,
              headers: p.response.headers ?? {},
              url: p.response.url ?? url,
            };
            if (!navState.mainFrameId) navState.mainFrameId = p.frameId;
          }
          break;
        }
        case "Page.domContentEventFired": {
          navState.domContentLoaded = true;
          break;
        }
        case "Page.loadEventFired": {
          navState.loadFired = true;
          break;
        }
      }
    });

    try {
      await send({ method: "Page.enable", sessionId });
      await send({ method: "Network.enable", sessionId });
      if (perFetchUA) {
        await send({
          method: "Network.setUserAgentOverride",
          params: { userAgent: perFetchUA },
          sessionId,
        });
      }
      await send({
        method: "Page.setLifecycleEventsEnabled",
        params: { enabled: true },
        sessionId,
      }).catch(() => undefined);

      const deadline = Date.now() + timeoutMs;
      const navResult = await Promise.race([
        send<{ frameId: string; errorText?: string }>({
          method: "Page.navigate",
          params: { url },
          sessionId,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`cdp: navigate timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ).unref?.(),
        ),
      ]);
      if (navResult.errorText) throw new Error(`cdp: navigation failed: ${navResult.errorText}`);
      if (!navState.mainFrameId) navState.mainFrameId = navResult.frameId;

      await waitFor(() => navState.domContentLoaded || navState.loadFired, deadline);
      // Best-effort network-idle: bounded by the smaller of the remaining
      // budget and 8s, mirroring the previous playwright behavior.
      const idleDeadline = Math.min(deadline, Date.now() + 8_000);
      await waitForNetworkIdle(navState, idleDeadline).catch(() => undefined);

      const evalResult = await send<{ result?: { value?: string } }>({
        method: "Runtime.evaluate",
        params: {
          expression: "document.documentElement ? document.documentElement.outerHTML : ''",
          returnByValue: true,
        },
        sessionId,
      });
      const rawBody = String(evalResult.result?.value ?? "");
      const { body, truncated } = truncateUtf8(rawBody, maxBodyBytes);

      const headers = new Headers();
      if (navState.response) {
        for (const [k, v] of Object.entries(navState.response.headers)) {
          try {
            headers.set(k, v);
          } catch {
            // Some servers emit malformed headers (e.g. permissions-policy
            // with embedded newlines). Drop those rather than failing.
          }
        }
      }

      return {
        status: navState.response?.status ?? 0,
        headers,
        body,
        url: navState.response?.url || url,
        bodyTruncated: truncated,
      };
    } finally {
      off();
      await send({ method: "Target.closeTarget", params: { targetId } }).catch(() => undefined);
    }
  }

  return {
    fetch(url, fetchOpts) {
      return fetchOne(url, fetchOpts);
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        ws.close();
      } catch {}
    },
  };
}

type CdpEvent = { method: string; params: Record<string, unknown> };

async function waitFor(predicate: () => boolean, deadline: number): Promise<void> {
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("cdp: timed out waiting for page lifecycle");
    await sleep(25);
  }
}

async function waitForNetworkIdle(
  state: { inFlight: Set<string>; lastIdleAt: number },
  deadline: number,
): Promise<void> {
  while (Date.now() < deadline) {
    if (state.inFlight.size === 0 && Date.now() - state.lastIdleAt >= NETWORK_IDLE_MS) return;
    await sleep(50);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms).unref?.());
}

function truncateUtf8(s: string, maxBytes: number): { body: string; truncated: boolean } {
  const enc = new TextEncoder();
  const bytes = enc.encode(s);
  if (bytes.byteLength <= maxBytes) return { body: s, truncated: false };
  const dec = new TextDecoder("utf-8");
  const body = dec.decode(bytes.subarray(0, maxBytes));
  return { body, truncated: true };
}
