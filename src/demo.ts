import type { Config } from "./config.js";
import type { VoiceState, VoiceStateStore } from "./state.js";

const GUEST_NAMES = ["Zuschauer_42", "Gast mit langem Namen", "xX_Bierkönig_Xx"];

/**
 * Demo-Modus: stellt ohne Discord einen Kanal mit `count` Personen nach und
 * lässt sie abwechselnd sprechen. Passt dafür die Nutzer-IDs in cfg an.
 */
export function startDemo(cfg: Config, store: VoiceStateStore, count: number): void {
  const n = Math.max(1, Math.min(count, cfg.layout.max));
  const guests = n >= 8 ? 2 : n >= 4 ? 1 : 0;
  const known = Math.min(n - guests, cfg.people.length);

  const states: VoiceState[] = [];
  cfg.people.forEach((p, i) => {
    p.discordId = `demo-${i}`;
    if (i < known) states.push({ nick: p.name, user: { id: p.discordId, username: p.name } });
  });
  for (let i = 0; states.length < n; i++) {
    states.push({ nick: GUEST_NAMES[i % GUEST_NAMES.length]!, user: { id: `gast-${i}`, username: `gast${i}` } });
  }
  store.setChannel("demo", states);

  const talk = (vs: VoiceState) => {
    const id = vs.user.id;
    setTimeout(() => {
      store.speakingStart(id);
      setTimeout(() => {
        store.speakingStop(id);
        talk(vs);
      }, 500 + Math.random() * 2500);
    }, 1000 + Math.random() * 3000 * n);
  };
  states.forEach(talk);

  // Der letzte Gast geht und kommt wieder, damit Ein- und Ausblenden zu sehen sind.
  const last = states[states.length - 1]!;
  if (guests > 0) {
    setInterval(() => {
      store.voiceStateDelete(last);
      setTimeout(() => store.voiceStateCreate(last), 4000);
    }, 20_000);
  }
}
