import { EventEmitter } from "node:events";
import type { DiscordCredentials } from "../config.js";
import type { VoiceState } from "../state.js";
import { AuthError, authenticate } from "./auth.js";
import { IpcClient } from "./ipc.js";

const CHANNEL_EVENTS = [
  "VOICE_STATE_CREATE",
  "VOICE_STATE_UPDATE",
  "VOICE_STATE_DELETE",
  "SPEAKING_START",
  "SPEAKING_STOP",
] as const;

export interface SessionOptions {
  creds: DiscordCredentials;
  /** "auto" oder feste Kanal-ID. */
  channel: string;
  tokenFile: string;
  retryMs?: number;
  log?: (msg: string) => void;
  /** Nur für Tests: andere Pipe-Pfade. */
  pipePaths?: string[];
}

export interface ChannelInfo {
  id: string;
  name: string;
  voiceStates: VoiceState[];
}

/**
 * Hält die Verbindung zu Discord und meldet, was im beobachteten Sprachkanal
 * passiert. Verbindet sich nach einem Abbruch von selbst neu.
 *
 * Ereignisse:
 *  - "channel" (ChannelInfo | null)   neuer Kanal samt Mitgliedern, null = keiner
 *  - "voice" ("create" | "update" | "delete", VoiceState)
 *  - "speaking" (boolean, userId)
 *  - "fatal" (Error)                  Anmeldung gescheitert, kein neuer Versuch
 */
export class DiscordSession extends EventEmitter {
  private ipc: IpcClient | null = null;
  private stopped = false;
  private watching: string | null = null;
  private switching = false;
  private queue: Promise<void> = Promise.resolve();
  private wake: (() => void) | null = null;
  private log: (msg: string) => void;

  constructor(private opts: SessionOptions) {
    super();
    this.log = opts.log ?? (() => {});
  }

  async start(): Promise<void> {
    let announced = false;
    while (!this.stopped) {
      try {
        await this.runOnce();
        announced = false;
        this.log("Verbindung zu Discord getrennt.");
      } catch (err) {
        if (err instanceof AuthError) {
          this.emit("channel", null);
          this.emit("fatal", err);
          return;
        }
        if (!announced) this.log(`${err instanceof Error ? err.message : String(err)}`);
        announced = true;
      } finally {
        this.ipc?.close();
        this.ipc = null;
        this.watching = null;
      }
      this.emit("channel", null);
      if (this.stopped) break;
      if (!announced) this.log("Neuer Verbindungsversuch alle paar Sekunden.");
      announced = true;
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.opts.retryMs ?? 5000);
        this.wake = () => {
          clearTimeout(t);
          resolve();
        };
      });
    }
  }

  stop(): void {
    this.stopped = true;
    this.ipc?.close();
    this.wake?.();
  }

  private async runOnce(): Promise<void> {
    const ipc = new IpcClient();
    this.ipc = ipc;
    this.queue = Promise.resolve();
    await ipc.connect(this.opts.creds.clientId, this.opts.pipePaths);
    const closed = new Promise<void>((resolve) => ipc.once("close", () => resolve()));

    const auth = await authenticate(ipc, this.opts.creds, this.opts.tokenFile, this.log);
    this.log(`Mit Discord verbunden als ${auth?.user?.username ?? "?"}.`);

    ipc.on("dispatch", (evt: string, data: any) => this.onDispatch(evt, data));

    if (this.opts.channel === "auto") {
      await ipc.subscribe("VOICE_CHANNEL_SELECT");
      const current = await ipc.request("GET_SELECTED_VOICE_CHANNEL");
      await this.enqueue(() => this.watch(current?.id ?? null));
    } else {
      await this.enqueue(() => this.watch(this.opts.channel));
    }
    await closed;
  }

  private onDispatch(evt: string, data: any): void {
    if (evt === "VOICE_CHANNEL_SELECT") {
      if (this.opts.channel !== "auto") return;
      void this.enqueue(() => this.watch(data?.channel_id ?? null)).catch((err) => {
        this.log(`Kanalwechsel gescheitert: ${err instanceof Error ? err.message : String(err)}`);
        this.ipc?.close();
      });
      return;
    }
    if (this.switching || !this.watching) return;
    switch (evt) {
      case "VOICE_STATE_CREATE":
        this.emit("voice", "create", data);
        break;
      case "VOICE_STATE_UPDATE":
        this.emit("voice", "update", data);
        break;
      case "VOICE_STATE_DELETE":
        this.emit("voice", "delete", data);
        break;
      case "SPEAKING_START":
        if (data?.user_id) this.emit("speaking", true, String(data.user_id));
        break;
      case "SPEAKING_STOP":
        if (data?.user_id) this.emit("speaking", false, String(data.user_id));
        break;
    }
  }

  /** Kanalwechsel laufen nacheinander, damit sich Abos nicht überholen. */
  private enqueue(job: () => Promise<void>): Promise<void> {
    const next = this.queue.then(job);
    this.queue = next.catch(() => {});
    return next;
  }

  private async watch(channelId: string | null): Promise<void> {
    const ipc = this.ipc;
    if (!ipc || channelId === this.watching) return;
    this.switching = true;
    try {
      if (this.watching) {
        const old = { channel_id: this.watching };
        await Promise.all(CHANNEL_EVENTS.map((e) => ipc.unsubscribe(e, old).catch(() => {})));
      }
      this.watching = null;
      if (!channelId) {
        this.log("Kein Sprachkanal.");
        this.emit("channel", null);
        return;
      }
      const args = { channel_id: channelId };
      for (const e of CHANNEL_EVENTS) await ipc.subscribe(e, args);
      const ch = await ipc.request("GET_CHANNEL", args);
      this.watching = channelId;
      const info: ChannelInfo = {
        id: channelId,
        name: ch?.name ?? "",
        voiceStates: Array.isArray(ch?.voice_states) ? ch.voice_states : [],
      };
      this.log(`Kanal „${info.name}“ mit ${info.voiceStates.length} Personen.`);
      this.emit("channel", info);
    } finally {
      this.switching = false;
    }
  }
}
