import assert from "node:assert/strict";
import { test } from "node:test";
import { VoiceStateStore, type Schedule, type Snapshot, type VoiceState } from "../src/state.js";

const cfg = {
  people: [
    { name: "Andy", discordId: "1", image: "andy.png", color: "#6D9DEB" },
    { name: "Jan", discordId: "2", image: "jan.png", color: "#F6B511" },
    { name: "Marek", discordId: "3", image: "marek.png", color: "#8F5BCB" },
    { name: "Ohne ID", discordId: "", image: "x.png", color: "#000000" },
  ],
  ignore: ["99"],
  guest: { image: "gast.png", color: "#FFFFFF" },
  lingerMs: 500,
  showGuestNames: true,
  layout: { max: 10 },
};

const vs = (id: string, name: string, extra: Partial<VoiceState["user"]> = {}): VoiceState => ({
  nick: name,
  user: { id, username: name.toLowerCase(), ...extra },
});

/** Zeitgeber von Hand: Zeit läuft nur, wenn der Test sie vorstellt. */
function fakeClock() {
  let now = 0;
  let jobs: { at: number; fn: () => void }[] = [];
  const schedule: Schedule = (fn, ms) => {
    const job = { at: now + ms, fn };
    jobs.push(job);
    return () => {
      jobs = jobs.filter((j) => j !== job);
    };
  };
  const advance = (ms: number) => {
    now += ms;
    const due = jobs.filter((j) => j.at <= now);
    jobs = jobs.filter((j) => j.at > now);
    due.forEach((j) => j.fn());
  };
  return { schedule, advance };
}

function setup(overrides: Partial<typeof cfg> = {}) {
  const clock = fakeClock();
  const snaps: Snapshot[] = [];
  const store = new VoiceStateStore({ ...cfg, ...overrides }, (s) => snaps.push(s), clock.schedule);
  const ids = () => store.snapshot().corks.map((c) => c.id);
  const speaking = () => store.snapshot().corks.filter((c) => c.speaking).map((c) => c.id);
  return { store, snaps, clock, ids, speaking };
}

test("Bekannte in Konfigurationsreihenfolge, Gäste dahinter nach Beitritt", () => {
  const { store, ids } = setup();
  store.setChannel("c", [vs("50", "GastA"), vs("3", "Marek"), vs("1", "Andy")]);
  store.voiceStateCreate(vs("40", "GastB"));
  store.voiceStateCreate(vs("2", "Jan"));
  assert.deepEqual(ids(), ["1", "2", "3", "50", "40"]);
});

test("Bots und Ignorierliste erscheinen nicht", () => {
  const { store, ids } = setup();
  store.setChannel("c", [vs("1", "Andy"), vs("99", "BeerBrawl"), vs("7", "Musikbot", { bot: true })]);
  assert.deepEqual(ids(), ["1"]);
});

test("Bekannte bekommen ihren Korken, Gäste den Gast-Korken mit Namen", () => {
  const { store } = setup();
  store.setChannel("c", [vs("2", "Jan"), vs("50", "Zuschauer")]);
  const [jan, gast] = store.snapshot().corks;
  assert.deepEqual(
    { image: jan!.image, known: jan!.known, showName: jan!.showName },
    { image: "jan.png", known: true, showName: false },
  );
  assert.deepEqual(
    { image: gast!.image, known: gast!.known, showName: gast!.showName, name: gast!.name },
    { image: "gast.png", known: false, showName: true, name: "Zuschauer" },
  );
});

test("Gastname lässt sich abschalten", () => {
  const { store } = setup({ showGuestNames: false });
  store.setChannel("c", [vs("50", "Zuschauer")]);
  assert.equal(store.snapshot().corks[0]!.showName, false);
});

test("Anzeigename: Spitzname, sonst globaler Name, sonst Kontoname", () => {
  const { store } = setup();
  store.setChannel("c", [
    { nick: null, user: { id: "60", username: "konto", global_name: "Global" } },
    { user: { id: "61", username: "nurkonto" } },
  ]);
  assert.deepEqual(
    store.snapshot().corks.map((c) => c.name),
    ["Global", "nurkonto"],
  );
});

test("Nachleuchten: Korken bleibt 500 ms nach SPEAKING_STOP aktiv", () => {
  const { store, clock, speaking } = setup();
  store.setChannel("c", [vs("1", "Andy")]);
  store.speakingStart("1");
  assert.deepEqual(speaking(), ["1"]);
  store.speakingStop("1");
  clock.advance(499);
  assert.deepEqual(speaking(), ["1"]);
  clock.advance(1);
  assert.deepEqual(speaking(), []);
});

test("Sprechpause kürzer als das Nachleuchten flackert nicht", () => {
  const { store, clock, snaps, speaking } = setup();
  store.setChannel("c", [vs("1", "Andy")]);
  store.speakingStart("1");
  const before = snaps.length;
  store.speakingStop("1");
  clock.advance(300);
  store.speakingStart("1");
  clock.advance(1000);
  assert.deepEqual(speaking(), ["1"]);
  assert.equal(snaps.length, before, "keine Zwischenmeldung ans Overlay");
  store.speakingStop("1");
  clock.advance(500);
  assert.deepEqual(speaking(), []);
});

test("Wer geht, verschwindet sofort und leuchtet nicht nach", () => {
  const { store, clock, ids, speaking } = setup();
  store.setChannel("c", [vs("1", "Andy"), vs("2", "Jan")]);
  store.speakingStart("2");
  store.speakingStop("2");
  store.voiceStateDelete(vs("2", "Jan"));
  assert.deepEqual(ids(), ["1"]);
  store.voiceStateCreate(vs("2", "Jan"));
  clock.advance(1000);
  assert.deepEqual(speaking(), []);
});

test("Sprechen ändert die Reihenfolge nicht", () => {
  const { store, ids } = setup();
  store.setChannel("c", [vs("1", "Andy"), vs("50", "Gast"), vs("3", "Marek")]);
  const before = ids();
  store.speakingStart("50");
  store.speakingStart("3");
  assert.deepEqual(ids(), before);
});

test("Update behält den Platz eines Gastes", () => {
  const { store, ids } = setup();
  store.setChannel("c", [vs("50", "A"), vs("51", "B")]);
  store.voiceStateUpdate(vs("50", "A umbenannt"));
  assert.deepEqual(ids(), ["50", "51"]);
  assert.equal(store.snapshot().corks[0]!.name, "A umbenannt");
});

test("Kanalwechsel ersetzt Mitglieder und Sprechzustand", () => {
  const { store, clock, ids, speaking } = setup();
  store.setChannel("c1", [vs("1", "Andy")]);
  store.speakingStart("1");
  store.setChannel("c2", [vs("1", "Andy"), vs("2", "Jan")]);
  assert.deepEqual(ids(), ["1", "2"]);
  assert.deepEqual(speaking(), []);
  clock.advance(1000);
  assert.equal(store.snapshot().channelId, "c2");
});

test("Kein Kanal oder Verbindung weg: leer", () => {
  const { store, snaps } = setup();
  store.setChannel("c", [vs("1", "Andy")]);
  store.reset();
  assert.deepEqual(snaps.at(-1), { channelId: null, corks: [] });
  store.voiceStateCreate(vs("2", "Jan"));
  store.speakingStart("2");
  assert.deepEqual(store.snapshot().corks, []);
});

test("Höchstens layout.max Korken", () => {
  const { store, ids } = setup();
  store.setChannel(
    "c",
    Array.from({ length: 14 }, (_, i) => vs(String(100 + i), `Gast${i}`)),
  );
  assert.equal(ids().length, 10);
});

test("Gleicher Zustand wird nicht doppelt gemeldet", () => {
  const { store, snaps } = setup();
  store.setChannel("c", [vs("1", "Andy")]);
  const n = snaps.length;
  store.voiceStateUpdate(vs("1", "Andy"));
  store.speakingStop("1");
  assert.equal(snaps.length, n);
});
