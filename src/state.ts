import type { Config } from "./config.js";

/** Ein Eintrag aus voice_states bzw. ein VOICE_STATE_*-Event von Discord. */
export interface VoiceState {
  nick?: string | null;
  user: {
    id: string;
    username?: string;
    global_name?: string | null;
    bot?: boolean;
  };
}

export interface Cork {
  id: string;
  /** Anzeigename aus Discord. */
  name: string;
  known: boolean;
  image: string;
  speaking: boolean;
  /** Name unter dem Korken zeigen (nur Gäste, abschaltbar). */
  showName: boolean;
}

export interface Snapshot {
  channelId: string | null;
  corks: Cork[];
}

type Cancel = () => void;
/** Zeitgeber, in Tests austauschbar. */
export type Schedule = (fn: () => void, ms: number) => Cancel;

const realSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  return () => clearTimeout(t);
};

interface Member {
  state: VoiceState;
  joined: number;
}

type StateConfig = Pick<Config, "people" | "ignore" | "guest" | "lingerMs" | "showGuestNames"> & {
  layout: Pick<Config["layout"], "max">;
};

/**
 * Hält fest, wer im Kanal ist und wer spricht. Kennt weder Discord noch HTTP:
 * Events rein, Momentaufnahmen raus.
 */
export class VoiceStateStore {
  private members = new Map<string, Member>();
  private speaking = new Set<string>();
  private lingering = new Map<string, Cancel>();
  private channelId: string | null = null;
  private seq = 0;
  private last = "";

  constructor(
    private cfg: StateConfig,
    private onChange: (snap: Snapshot) => void = () => {},
    private schedule: Schedule = realSchedule,
  ) {}

  /** Neuer Kanal (oder null = kein Kanal / keine Verbindung). Ersetzt alles. */
  setChannel(channelId: string | null, voiceStates: VoiceState[] = []): void {
    for (const cancel of this.lingering.values()) cancel();
    this.lingering.clear();
    this.speaking.clear();
    this.members.clear();
    this.channelId = channelId;
    if (channelId) for (const vs of voiceStates) this.put(vs);
    this.emit();
  }

  reset(): void {
    this.setChannel(null);
  }

  voiceStateCreate(vs: VoiceState): void {
    this.put(vs);
    this.emit();
  }

  voiceStateUpdate(vs: VoiceState): void {
    this.put(vs);
    this.emit();
  }

  voiceStateDelete(vs: VoiceState): void {
    const id = vs?.user?.id;
    if (!id) return;
    this.members.delete(id);
    this.clearSpeaking(id);
    this.emit();
  }

  speakingStart(userId: string): void {
    this.lingering.get(userId)?.();
    this.lingering.delete(userId);
    this.speaking.add(userId);
    this.emit();
  }

  speakingStop(userId: string): void {
    if (!this.speaking.has(userId)) return;
    this.lingering.get(userId)?.();
    const done = () => {
      this.lingering.delete(userId);
      this.speaking.delete(userId);
      this.emit();
    };
    if (this.cfg.lingerMs <= 0) done();
    else this.lingering.set(userId, this.schedule(done, this.cfg.lingerMs));
  }

  snapshot(): Snapshot {
    const ignore = new Set(this.cfg.ignore);
    const order = new Map<string, number>();
    this.cfg.people.forEach((p, i) => {
      if (p.discordId && !order.has(p.discordId)) order.set(p.discordId, i);
    });

    const visible = [...this.members.entries()].filter(
      ([id, m]) => !m.state.user.bot && !ignore.has(id),
    );
    const known = visible
      .filter(([id]) => order.has(id))
      .sort((a, b) => order.get(a[0])! - order.get(b[0])!);
    const guests = visible.filter(([id]) => !order.has(id)).sort((a, b) => a[1].joined - b[1].joined);

    const corks = [...known, ...guests].slice(0, this.cfg.layout.max).map(([id, m]): Cork => {
      const person = order.has(id) ? this.cfg.people[order.get(id)!] : undefined;
      return {
        id,
        name: displayName(m.state),
        known: !!person,
        image: person ? person.image : this.cfg.guest.image,
        speaking: this.speaking.has(id),
        showName: !person && this.cfg.showGuestNames,
      };
    });
    return { channelId: this.channelId, corks };
  }

  private put(vs: VoiceState): void {
    const id = vs?.user?.id;
    if (!id || !this.channelId) return;
    const old = this.members.get(id);
    this.members.set(id, { state: vs, joined: old ? old.joined : this.seq++ });
  }

  private clearSpeaking(id: string): void {
    this.lingering.get(id)?.();
    this.lingering.delete(id);
    this.speaking.delete(id);
  }

  /** Meldet nur weiter, wenn sich die Anzeige wirklich ändert. */
  private emit(): void {
    const snap = this.snapshot();
    const key = JSON.stringify(snap);
    if (key === this.last) return;
    this.last = key;
    this.onChange(snap);
  }
}

export function displayName(vs: VoiceState): string {
  return vs.nick || vs.user.global_name || vs.user.username || vs.user.id;
}
