import { createReadStream, existsSync } from "node:fs";
import http from "node:http";
import { basename, join } from "node:path";
import { ROOT, type Config } from "./config.js";
import type { Snapshot } from "./state.js";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  png: "image/png",
  woff2: "font/woff2",
};

/** Liefert das Overlay aus und schickt ihm den Zustand per Server-Sent Events. */
export class OverlayServer {
  private clients = new Set<http.ServerResponse>();
  private snapshot: Snapshot = { channelId: null, corks: [] };
  private server: http.Server;

  constructor(private cfg: Config) {
    this.server = http.createServer((req, res) => this.handle(req, res));
    setInterval(() => {
      for (const c of this.clients) c.write(": ping\n\n");
    }, 15_000).unref();
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "EADDRINUSE"
            ? new Error(
                `Port ${this.cfg.port} ist belegt. Läuft die Sprecheranzeige schon? Sonst "port" in config.json ändern.`,
              )
            : err,
        );
      });
      this.server.listen(this.cfg.port, "127.0.0.1", () => resolve());
    });
  }

  close(): void {
    for (const c of this.clients) c.end();
    this.server.close();
  }

  broadcast(snapshot: Snapshot): void {
    this.snapshot = snapshot;
    const msg = sse("state", snapshot);
    for (const c of this.clients) c.write(msg);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const path = decodeURIComponent((req.url ?? "/").split("?")[0]!);
    if (path === "/events") return this.events(req, res);
    if (path === "/state") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(this.snapshot));
      return;
    }
    if (path === "/" || path === "/index.html") return send(res, join(ROOT, "overlay", "index.html"));
    if (path.startsWith("/korken/")) {
      return send(res, join(ROOT, "overlay", "korken", basename(path)));
    }
    if (path === "/fonts/bangers.woff2") {
      return send(
        res,
        join(ROOT, "node_modules", "@fontsource", "bangers", "files", "bangers-latin-400-normal.woff2"),
      );
    }
    res.writeHead(404).end("Nicht gefunden");
  }

  private events(req: http.IncomingMessage, res: http.ServerResponse): void {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const { layout, scale } = this.cfg;
    res.write(sse("config", { layout, scale }));
    res.write(sse("state", this.snapshot));
    this.clients.add(res);
    req.on("close", () => this.clients.delete(res));
  }
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function send(res: http.ServerResponse, file: string): void {
  if (!existsSync(file)) {
    res.writeHead(404).end("Nicht gefunden");
    return;
  }
  const ext = file.split(".").pop() ?? "";
  res.writeHead(200, {
    "Content-Type": TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  createReadStream(file).pipe(res);
}
