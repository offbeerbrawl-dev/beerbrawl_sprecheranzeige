/**
 * Prüft Rahmung, Anmeldung mit gespeichertem Token, Abos, Kanalwechsel und
 * Neuverbindung gegen eine nachgestellte Discord-App auf einer eigenen Pipe.
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { FrameDecoder, encodeFrame } from "../src/discord/ipc.js";
import { DiscordSession, type ChannelInfo } from "../src/discord/session.js";

test("Rahmen werden auch zerstückelt richtig gelesen", () => {
  const dec = new FrameDecoder();
  const bytes = Buffer.concat([encodeFrame(1, { a: "ä€" }), encodeFrame(3, { b: 2 })]);
  const got = [...dec.push(bytes.subarray(0, 5)), ...dec.push(bytes.subarray(5, 20)), ...dec.push(bytes.subarray(20))];
  assert.deepEqual(got, [
    { op: 1, data: { a: "ä€" } },
    { op: 3, data: { b: 2 } },
  ]);
});

const member = (id: string, name: string) => ({ nick: name, user: { id, username: name } });

class FakeDiscord {
  server: net.Server;
  sock: net.Socket | null = null;
  subs = new Set<string>();
  selected: string | null = "c1";
  channels: Record<string, any> = {
    c1: { id: "c1", name: "Eins", voice_states: [member("1", "Andy"), member("2", "Jan")] },
    c2: { id: "c2", name: "Zwei", voice_states: [member("3", "Marek")] },
  };
  log: string[] = [];

  constructor(public path: string) {
    this.server = net.createServer((sock) => {
      this.sock = sock;
      this.subs.clear();
      const dec = new FrameDecoder();
      sock.on("error", () => {});
      sock.on("data", (chunk) => {
        for (const { op, data } of dec.push(chunk)) {
          if (op === 0) this.send({ cmd: "DISPATCH", evt: "READY", data: { v: 1 } });
          else if (op === 1) this.onCommand(data);
        }
      });
    });
  }

  listen = () => new Promise<void>((r) => this.server.listen(this.path, () => r()));

  send(msg: object): void {
    this.sock?.write(encodeFrame(1, msg));
  }

  dispatch(evt: string, data: object, channelId?: string): void {
    const key = channelId ? `${evt}:${channelId}` : evt;
    if (this.subs.has(key)) this.send({ cmd: "DISPATCH", evt, data });
  }

  private onCommand(m: any): void {
    this.log.push(m.evt ? `${m.cmd} ${m.evt}` : m.cmd);
    const reply = (data: unknown) => this.send({ cmd: m.cmd, data, nonce: m.nonce });
    const key = m.args?.channel_id ? `${m.evt}:${m.args.channel_id}` : m.evt;
    switch (m.cmd) {
      case "AUTHENTICATE":
        if (m.args.access_token === "gut") reply({ user: { username: "tester" }, scopes: ["rpc"] });
        else this.send({ cmd: m.cmd, evt: "ERROR", data: { code: 4009, message: "Invalid token" }, nonce: m.nonce });
        break;
      case "SUBSCRIBE":
        this.subs.add(key);
        reply({ evt: m.evt });
        break;
      case "UNSUBSCRIBE":
        this.subs.delete(key);
        reply({ evt: m.evt });
        break;
      case "GET_SELECTED_VOICE_CHANNEL":
        reply(this.selected ? this.channels[this.selected] : null);
        break;
      case "GET_CHANNEL":
        reply(this.channels[m.args.channel_id]);
        break;
    }
  }
}

function harness(channel: string) {
  const dir = mkdtempSync(join(tmpdir(), "sprecher-"));
  const pipe =
    process.platform === "win32"
      ? `\\\\?\\pipe\\sprecheranzeige-test-${process.pid}-${Math.random().toString(36).slice(2)}`
      : join(dir, "ipc.sock");
  const tokenFile = join(dir, "token.json");
  const creds = { clientId: "app", clientSecret: "geheim", redirectUri: "http://localhost", scopes: ["rpc"] };
  writeFileSync(
    tokenFile,
    JSON.stringify({ access_token: "gut", expires_at: Date.now() + 6 * 86_400_000, scopes: ["rpc"], client_id: "app" }),
  );
  const fake = new FakeDiscord(pipe);
  const session = new DiscordSession({ creds, channel, tokenFile, retryMs: 50, pipePaths: [pipe] });
  const events: string[] = [];
  const waiters: { want: string; resolve: () => void }[] = [];
  const push = (e: string) => {
    events.push(e);
    for (const w of [...waiters]) {
      if (w.want === e) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve();
      }
    }
  };
  session.on("channel", (ch: ChannelInfo | null) =>
    push(ch ? `channel ${ch.id} ${ch.voiceStates.map((v) => v.user.id).join(",")}` : "channel -"),
  );
  session.on("voice", (kind: string, vs: any) => push(`${kind} ${vs.user.id}`));
  session.on("speaking", (on: boolean, id: string) => push(`${on ? "start" : "stop"} ${id}`));
  /** Wartet auf das nächste Ereignis mit genau diesem Text. */
  const next = (want: string) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`Warte vergeblich auf "${want}". Bisher: ${events.join(" | ")}`)), 3000);
      waiters.push({ want, resolve: () => (clearTimeout(t), resolve()) });
    });
  const stop = async () => {
    session.stop();
    fake.sock?.destroy();
    await new Promise((r) => fake.server.close(r));
  };
  return { fake, session, events, next, stop };
}

test("auto: Anmeldung ohne Freigabe, Events, Kanalwechsel, Neuverbindung", async () => {
  const { fake, session, events, next, stop } = harness("auto");
  await fake.listen();
  try {
    let wait = next("channel c1 1,2");
    void session.start();
    await wait;
    assert.ok(!fake.log.includes("AUTHORIZE"), "gespeicherter Token reicht, keine Freigabe-Abfrage");

    wait = next("stop 2");
    fake.dispatch("SPEAKING_START", { user_id: "2" }, "c1");
    fake.dispatch("VOICE_STATE_CREATE", member("9", "Gast"), "c1");
    fake.dispatch("VOICE_STATE_DELETE", member("1", "Andy"), "c1");
    fake.dispatch("SPEAKING_STOP", { user_id: "2" }, "c1");
    await wait;
    assert.deepEqual(events.slice(-4), ["start 2", "create 9", "delete 1", "stop 2"]);

    // Kanalwechsel: alte Abos weg, neue da
    wait = next("channel c2 3");
    fake.dispatch("VOICE_CHANNEL_SELECT", { channel_id: "c2", guild_id: "g" });
    await wait;
    assert.ok(fake.subs.has("SPEAKING_START:c2") && !fake.subs.has("SPEAKING_START:c1"));

    // Kanal verlassen
    wait = next("channel -");
    fake.dispatch("VOICE_CHANNEL_SELECT", { channel_id: null, guild_id: null });
    await wait;
    assert.ok(!fake.subs.has("SPEAKING_START:c2"));

    // Discord "startet neu": Verbindung weg, Brücke kommt von selbst zurück
    fake.selected = "c2";
    wait = next("channel c2 3");
    fake.sock?.destroy();
    await wait;
  } finally {
    await stop();
  }
});

test("feste Kanal-ID: beobachtet den Kanal und ignoriert Kanalwechsel", async () => {
  const { fake, session, next, stop } = harness("c2");
  await fake.listen();
  try {
    let wait = next("channel c2 3");
    void session.start();
    await wait;
    assert.ok(!fake.log.includes("GET_SELECTED_VOICE_CHANNEL"));
    wait = next("start 3");
    fake.dispatch("SPEAKING_START", { user_id: "3" }, "c2");
    await wait;
  } finally {
    await stop();
  }
});
