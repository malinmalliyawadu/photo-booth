import { createServer, type Server } from "node:http";

/**
 * The worker's own small HTTP port. Today it answers /health, which is
 * how Playwright and the night-of checklist know the worker is up;
 * phase 3 adds /preview/stream, the MJPEG liveview the kiosk shows.
 */
export function startHttp(port: number, health: () => Record<string, unknown>): Server {
  const server = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, ...health() }));
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
  server.listen(port, "127.0.0.1");
  return server;
}
