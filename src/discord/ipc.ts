import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import net from "node:net";

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;
const OP_PING = 3;
const OP_PONG = 4;

export class RpcError extends Error {
  constructor(
    public cmd: string,
    public code: number,
    message: string,
  ) {
    super(`${cmd}: ${code} ${message}`);
  }
}

/** Rahmen: 8 Byte Kopf (Opcode, Länge; je int32 LE), danach JSON in UTF-8. */
export function encodeFrame(op: number, payload: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const head = Buffer.alloc(8);
  head.writeInt32LE(op, 0);
  head.writeInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
}

/** Zerlegt einen Bytestrom in Rahmen, auch wenn sie zerstückelt ankommen. */
export class FrameDecoder {
  private buf = Buffer.alloc(0);

  push(chunk: Buffer): { op: number; data: any }[] {
    this.buf = Buffer.concat([this.buf, chunk]);
    const out: { op: number; data: any }[] = [];
    while (this.buf.length >= 8) {
      const op = this.buf.readInt32LE(0);
      const len = this.buf.readInt32LE(4);
      if (this.buf.length < 8 + len) break;
      const body = this.buf.subarray(8, 8 + len).toString("utf8");
      this.buf = this.buf.subarray(8 + len);
      out.push({ op, data: body ? JSON.parse(body) : null });
    }
    return out;
  }
}

export function defaultPipePaths(): string[] {
  const base =
    process.platform === "win32"
      ? "\\\\?\\pipe\\"
      : `${process.env.XDG_RUNTIME_DIR ?? process.env.TMPDIR ?? process.env.TMP ?? process.env.TEMP ?? "/tmp"}/`;
  return Array.from({ length: 10 }, (_, i) => `${base}discord-ipc-${i}`);
}

interface Pending {
  cmd: string;
  resolve: (data: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Verbindung zur lokalen RPC-Schnittstelle der Discord-App.
 * Ereignisse: "dispatch" (evt, data) und "close".
 */
export class IpcClient extends EventEmitter {
  private sock: net.Socket | null = null;
  private pending = new Map<string, Pending>();
  private decoder = new FrameDecoder();

  /** Verbindet sich mit der ersten erreichbaren Pipe und wartet auf READY. */
  async connect(clientId: string, paths = defaultPipePaths()): Promise<any> {
    let lastErr: unknown;
    for (const path of paths) {
      try {
        this.sock = await open(path);
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!this.sock) {
      throw new Error(`Discord nicht erreichbar (läuft die Desktop-App?): ${String(lastErr)}`);
    }
    const sock = this.sock;
    const ready = new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Keine READY-Antwort von Discord")), 15_000);
      const done = (fn: () => void) => {
        clearTimeout(timer);
        this.off("dispatch", onDispatch);
        this.off("close", onClose);
        fn();
      };
      const onDispatch = (evt: string, data: any) => {
        if (evt === "READY") done(() => resolve(data));
      };
      const onClose = (info: unknown) =>
        done(() => reject(new Error(`Discord hat die Verbindung abgelehnt: ${JSON.stringify(info)}`)));
      this.on("dispatch", onDispatch);
      this.on("close", onClose);
    });
    ready.catch(() => {});

    let closeInfo: unknown = null;
    sock.on("data", (chunk) => {
      let frames;
      try {
        frames = this.decoder.push(chunk);
      } catch {
        sock.destroy();
        return;
      }
      for (const { op, data } of frames) {
        if (op === OP_PING) sock.write(encodeFrame(OP_PONG, data));
        else if (op === OP_CLOSE) {
          closeInfo = data;
          sock.destroy();
        } else if (op === OP_FRAME) this.onMessage(data);
      }
    });
    sock.on("error", () => {});
    sock.on("close", () => {
      this.sock = null;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error(`Verbindung zu Discord getrennt (${p.cmd})`));
      }
      this.pending.clear();
      this.emit("close", closeInfo);
    });

    sock.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: clientId }));
    return ready;
  }

  request(cmd: string, args: object = {}, evt?: string, timeoutMs = 15_000): Promise<any> {
    const sock = this.sock;
    if (!sock) return Promise.reject(new Error(`Nicht mit Discord verbunden (${cmd})`));
    const nonce = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(nonce);
        reject(new Error(`Zeitüberschreitung bei ${cmd}${evt ? ` ${evt}` : ""}`));
      }, timeoutMs);
      this.pending.set(nonce, { cmd: evt ? `${cmd} ${evt}` : cmd, resolve, reject, timer });
      sock.write(encodeFrame(OP_FRAME, { cmd, args, evt, nonce }));
    });
  }

  subscribe(evt: string, args: object = {}): Promise<any> {
    return this.request("SUBSCRIBE", args, evt);
  }

  unsubscribe(evt: string, args: object = {}): Promise<any> {
    return this.request("UNSUBSCRIBE", args, evt);
  }

  get connected(): boolean {
    return this.sock !== null;
  }

  close(): void {
    this.sock?.destroy();
  }

  private onMessage(msg: any): void {
    if (!msg || typeof msg !== "object") return;
    const p = msg.nonce ? this.pending.get(msg.nonce) : undefined;
    if (p) {
      this.pending.delete(msg.nonce);
      clearTimeout(p.timer);
      if (msg.evt === "ERROR") {
        p.reject(new RpcError(p.cmd, msg.data?.code ?? 0, msg.data?.message ?? "Unbekannter Fehler"));
      } else p.resolve(msg.data);
      return;
    }
    if (msg.cmd === "DISPATCH" && typeof msg.evt === "string") {
      this.emit("dispatch", msg.evt, msg.data);
    }
  }
}

function open(path: string): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection(path);
    sock.once("connect", () => {
      sock.removeAllListeners("error");
      resolve(sock);
    });
    sock.once("error", reject);
  });
}
