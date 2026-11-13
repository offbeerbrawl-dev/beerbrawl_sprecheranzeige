/**
 * Erzeugt die Korken-PNGs aus den SVG-Quellen und färbt sie auf die
 * Personenfarben aus der Konfiguration um.
 *
 *   npm run korken
 *
 * Liest config.json (sonst config.example.json), schreibt nach overlay/korken
 * und kopiert die Bilder zusätzlich nach korken.copyTo, falls gesetzt.
 * Die SVG-Quellen werden nur gelesen.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHADOW_FACTOR = 0.77;

const cfgFile = existsSync(join(ROOT, "config.json")) ? "config.json" : "config.example.json";
const cfg = JSON.parse(readFileSync(join(ROOT, cfgFile), "utf8"));
const sources = JSON.parse(readFileSync(join(ROOT, "scripts", "korken-quellen.json"), "utf8"));
const { sourceDir, copyTo, width = 400 } = cfg.korken ?? {};
if (!sourceDir || !existsSync(sourceDir)) {
  console.error(`SVG-Ordner nicht gefunden: ${sourceDir} (korken.sourceDir in ${cfgFile})`);
  process.exit(1);
}

const outDir = join(ROOT, "overlay", "korken");
mkdirSync(outDir, { recursive: true });
if (copyTo) mkdirSync(copyTo, { recursive: true });

const jobs = [...cfg.people, { name: "Gast", ...cfg.guest }];
let failed = 0;
for (const job of jobs) {
  try {
    if (!job.source) throw new Error('"source" fehlt in der Konfiguration');
    const palette = sources[job.source];
    if (!palette) throw new Error(`${job.source} steht nicht in scripts/korken-quellen.json`);
    let svg = readFileSync(join(sourceDir, job.source), "utf8");
    if (job.hideGroup) {
      const marker = `id="${job.hideGroup}"`;
      if (!svg.includes(marker)) throw new Error(`Gruppe ${job.hideGroup} nicht gefunden`);
      svg = svg.replace(marker, `${marker} display="none"`);
    }
    const map = colorMap(palette, job.color);
    svg = svg.replace(/#[0-9a-fA-F]{6}\b/g, (hex) => map.get(hex.toLowerCase()) ?? hex);
    const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();
    writeFileSync(join(outDir, job.image), png);
    if (copyTo) copyFileSync(join(outDir, job.image), join(copyTo, job.image));
    const changes = [...map].map(([from, to]) => (from === to ? from : `${from}→${to}`)).join(" ");
    console.log(`${job.image.padEnd(13)} ${changes}`);
  } catch (err) {
    failed++;
    console.error(`${job.name}: ${err.message}`);
  }
}
console.log(`\n${jobs.length - failed} Bilder in ${outDir}${copyTo ? ` und ${copyTo}` : ""}`);
process.exit(failed ? 1 : 0);

/** Alte Farbe → neue Farbe für Grundton, Schatten und Randtöne. */
function colorMap(palette, targetHex) {
  const oldBase = rgb(palette.base);
  const target = rgb(targetHex);
  const map = new Map();
  map.set(palette.base, hex(target));
  // Praktisch gleiche Farbe: Schatten und Randtöne der Vorlage behalten.
  if (oldBase.every((c, i) => Math.abs(c - target[i]) <= 4)) return map;
  map.set(palette.shadow, hex(target.map((c) => c * SHADOW_FACTOR)));
  for (const edge of palette.edges ?? []) {
    map.set(edge, hex(shiftEdge(rgb(edge), oldBase, target)));
  }
  return map;
}

/**
 * Ein Randton ist eine Mischung aus Grundton und einem Grau:
 * rand = a * grundton + b. a und b per kleinste Quadrate bestimmen und mit dem
 * neuen Grundton wieder zusammensetzen.
 */
function shiftEdge(edge, oldBase, newBase) {
  const mean = (v) => (v[0] + v[1] + v[2]) / 3;
  const mb = mean(oldBase);
  const me = mean(edge);
  const varB = oldBase.reduce((s, c) => s + (c - mb) ** 2, 0);
  const cov = oldBase.reduce((s, c, i) => s + (c - mb) * (edge[i] - me), 0);
  const a = varB > 0 ? Math.min(1, Math.max(0, cov / varB)) : 0;
  const b = me - a * mb;
  return newBase.map((c) => a * c + b);
}

function rgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function hex(v) {
  return "#" + v.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("");
}
