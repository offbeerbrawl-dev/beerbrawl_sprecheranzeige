import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Projektordner (zwei Ebenen über dist/src). */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export interface Person {
  /** Name auf dem Korken, nur zur Orientierung. */
  name: string;
  /** Discord-Nutzer-ID. Leer lassen, solange sie nicht bekannt ist. */
  discordId: string;
  /** PNG-Datei in overlay/korken. */
  image: string;
  /** Personenfarbe, wird vom Korken-Skript verwendet. */
  color: string;
  /** SVG-Quelle für das Korken-Skript. */
  source?: string;
}

export interface Layout {
  /** Linke Kante des ersten Korkens auf der 1920x1080-Leinwand. */
  x: number;
  /** Oberkante der Korken. */
  y: number;
  /** Breite eines Korkens in px. */
  size: number;
  /** Abstand von Korken zu Korken in px (kleiner als size = überlappend). */
  step: number;
  /** Höchstzahl gezeigter Korken. */
  max: number;
  /** Schriftgröße der Gastnamen in px. */
  nameSize: number;
  /** Abstand der Namens-Unterkante zur Korken-Unterkante in px (positiv = höher). */
  nameLift: number;
}

export interface Config {
  port: number;
  /** "auto" = Kanal, in dem die Discord-App gerade sitzt, sonst feste Kanal-ID. */
  channel: string;
  /** Nachleuchten nach SPEAKING_STOP in ms. */
  lingerMs: number;
  /** Vergrößerungsfaktor beim Sprechen. */
  scale: number;
  showGuestNames: boolean;
  /** Nutzer-IDs, die nie angezeigt werden. */
  ignore: string[];
  guest: { image: string; color: string; source?: string; hideGroup?: string };
  people: Person[];
  layout: Layout;
  korken?: { sourceDir: string; copyTo?: string; width?: number };
}

const DEFAULTS: Config = {
  port: 4747,
  channel: "auto",
  lingerMs: 500,
  scale: 1.15,
  showGuestNames: true,
  ignore: [],
  guest: { image: "gast.png", color: "#FFFFFF" },
  people: [],
  layout: { x: 8, y: 943, size: 145, step: 95, max: 10, nameSize: 26, nameLift: 6 },
};

export function loadConfig(root = ROOT): Config {
  const own = join(root, "config.json");
  const file = existsSync(own) ? own : join(root, "config.example.json");
  if (file !== own) {
    console.warn("Hinweis: config.json fehlt, es gilt config.example.json (ohne Nutzer-IDs).");
  }
  const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<Config>;
  const cfg: Config = {
    ...DEFAULTS,
    ...raw,
    guest: { ...DEFAULTS.guest, ...raw.guest },
    layout: { ...DEFAULTS.layout, ...raw.layout },
  };
  cfg.channel = String(cfg.channel || "auto");
  cfg.ignore = cfg.ignore.map(String);
  cfg.people = cfg.people.map((p) => ({ ...p, discordId: String(p.discordId ?? "").trim() }));
  return cfg;
}

/** Liest KEY=VALUE-Zeilen aus .env, ohne process.env zu überschreiben. */
export function loadEnv(root = ROOT): Record<string, string> {
  const out: Record<string, string> = {};
  const file = join(root, ".env");
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) continue;
      out[m[1]!] = m[2]!.replace(/^(['"])(.*)\1$/, "$2");
    }
  }
  for (const [k, v] of Object.entries(process.env)) {
    if (k.startsWith("DISCORD_") && v) out[k] = v;
  }
  return out;
}

export interface DiscordCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export function loadCredentials(root = ROOT): DiscordCredentials {
  const env = loadEnv(root);
  const clientId = env.DISCORD_CLIENT_ID ?? "";
  const clientSecret = env.DISCORD_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) {
    throw new Error(
      "DISCORD_CLIENT_ID oder DISCORD_CLIENT_SECRET fehlt. Lege eine .env nach dem Muster .env.example an.",
    );
  }
  return {
    clientId,
    clientSecret,
    redirectUri: env.DISCORD_REDIRECT_URI ?? "http://localhost",
    scopes: (env.DISCORD_SCOPES ?? "rpc rpc.voice.read identify").split(/[\s,]+/).filter(Boolean),
  };
}
