/**
 * Machbarkeitstest (AP1) und Hilfsbefehl.
 *
 *   npm run probe                      Mitglieder und Sprech-Events mitschreiben
 *   npm run probe -- --channel <id>    dasselbe für eine feste Kanal-ID
 *   npm run who                        Personen im aktuellen Kanal mit Nutzer-ID, dann Ende
 */
import { join } from "node:path";
import { ROOT, loadConfig, loadCredentials } from "./config.js";
import { DiscordSession, type ChannelInfo } from "./discord/session.js";
import { displayName, type VoiceState } from "./state.js";

const args = process.argv.slice(2);
const who = args.includes("--who");
const chAt = args.indexOf("--channel");
const stamp = () => new Date().toLocaleTimeString("de-DE", { hour12: false }) + "." + String(Date.now() % 1000).padStart(3, "0");
const log = (msg: string) => console.log(`[${stamp()}] ${msg}`);

const names = new Map<string, string>();
const label = (id: string) => `${names.get(id) ?? "(unbekannt)"} [${id}]`;

function main(): void {
  const cfg = loadConfig();
  const channel = chAt >= 0 ? String(args[chAt + 1]) : who ? "auto" : cfg.channel;
  const session = new DiscordSession({
    creds: loadCredentials(),
    channel,
    tokenFile: join(ROOT, ".token-cache.json"),
    log,
  });

  session.on("channel", (ch: ChannelInfo | null) => {
    names.clear();
    if (!ch) {
      if (who) log("Die Discord-App sitzt in keinem Sprachkanal.");
      return;
    }
    console.log(`\nKanal „${ch.name}“ (ID ${ch.id})`);
    console.log("Nutzer-ID            | Anzeigename          | Kontoname            | Bot");
    for (const vs of ch.voiceStates) {
      names.set(vs.user.id, displayName(vs));
      console.log(
        `${vs.user.id.padEnd(20)} | ${displayName(vs).padEnd(20)} | ${(vs.user.username ?? "").padEnd(20)} | ${vs.user.bot ? "ja" : "nein"}`,
      );
    }
    console.log("");
    if (who) {
      session.stop();
      setTimeout(() => process.exit(0), 100);
    }
  });
  session.on("voice", (kind: string, vs: VoiceState) => {
    if (kind !== "delete") names.set(vs.user.id, displayName(vs));
    if (kind !== "update") log(`${kind === "create" ? "BEITRITT" : "ABGANG  "} ${label(vs.user.id)}`);
  });
  session.on("speaking", (on: boolean, id: string) => log(`${on ? "SPRICHT " : "STILL   "} ${label(id)}`));
  session.on("fatal", (err: Error) => {
    console.error(`\n${err.message}\n`);
    process.exit(1);
  });
  void session.start();
}

try {
  main();
} catch (err) {
  console.error(`\n${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
