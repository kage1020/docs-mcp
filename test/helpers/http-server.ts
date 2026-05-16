export type Handler = (req: Request, info: { count: number }) => Promise<Response> | Response;

export type TestServer = {
  url: string;
  origin: string;
  port: number;
  hits: () => number;
  reset: () => void;
  capturedRequests: Request[];
  stop: () => Promise<void>;
};

export function startServer(handler: Handler): TestServer {
  let count = 0;
  const captured: Request[] = [];
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      count++;
      captured.push(req.clone());
      return handler(req, { count });
    },
  });
  const port = server.port ?? 0;
  const origin = `http://127.0.0.1:${port}`;
  return {
    url: origin,
    origin,
    port,
    hits: () => count,
    reset: () => {
      count = 0;
      captured.length = 0;
    },
    capturedRequests: captured,
    stop: async () => {
      await server.stop(true);
    },
  };
}
