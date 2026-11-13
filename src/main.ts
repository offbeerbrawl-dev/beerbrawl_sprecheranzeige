import { join } from "node:path";
import { ROOT, loadConfig, loadCredentials } from "./config.js";
import { startDemo } from "./demo.js";
import { DiscordSession, type ChannelInfo } from "./discord/session.js";
import { OverlayServer } from "./server.js";
import { VoiceStateStore, type VoiceState } from "./state.js";

const log = (msg: string) => console.log(`[${new Date().toLocaleTimeString("de-DE")}] ${msg}`);

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const demoAt = args.indexOf("--demo");
  const cfg = loadConfig();
  const server = new OverlayServer(cfg);
  const store = new VoiceStateStore(cfg, (snap) => server.broadcast(snap));

  await server.listen();
  log(`Overlay: http://127.0.0.1:${cfg.port}/  (als Browserquelle 1920 x 1080 in OBS)`);

  if (demoAt >= 0) {
    const count = Number(args[demoAt + 1]) || 5;
    startDemo(cfg, store, count);
    log(`Demo-Modus mit ${count} Korken, ohne Discord. Beenden mit Strg+C.`);
    return;
  }

  const session = new DiscordSession({
    creds: loadCredentials(),
    channel: cfg.channel,
    tokenFile: join(ROOT, ".token-cache.json"),
    log,
  });
  session.on("channel", (ch: ChannelInfo | null) => store.setChannel(ch?.id ?? null, ch?.voiceStates));
  session.on("voice", (kind: "create" | "update" | "delete", vs: VoiceState) => {
    if (kind === "create") store.voiceStateCreate(vs);
    else if (kind === "update") store.voiceStateUpdate(vs);
    else store.voiceStateDelete(vs);
  });
  session.on("speaking", (on: boolean, id: string) =>
    on ? store.speakingStart(id) : store.speakingStop(id),
  );
  session.on("fatal", (err: Error) => {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  });
  if (!cfg.people.some((p) => p.discordId)) {
    log('Hinweis: In der Konfiguration steht noch keine Nutzer-ID, alle erscheinen als Gäste. IDs zeigt "npm run who".');
  }
  await session.start();
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
