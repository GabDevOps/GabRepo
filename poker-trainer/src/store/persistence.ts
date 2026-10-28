import { HandRecord, Settings, Stats, defaultSettings, emptyStats } from '../types';

/**
 * Hand history and stats live in the Artifact's `db` capability, in the viewer's private
 * folder (data/users/<id>), so they survive reloads and devices. Outside claude.ai, or if
 * db is unavailable, they fall back to localStorage. Settings are always localStorage.
 */
const LS = { settings: 'pt-settings', hands: 'pt-hands', stats: 'pt-stats' };
const MAX_LOCAL_HANDS = 300;

function lsGet<T>(key: string, dflt: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : dflt;
  } catch {
    return dflt;
  }
}
function lsSet(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* storage full or blocked */
  }
}
function lsDel(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadSettings(): Settings {
  return { ...defaultSettings, ...lsGet<Partial<Settings>>(LS.settings, {}) };
}
export function saveSettings(s: Settings) {
  lsSet(LS.settings, s);
}

export interface HistoryStore {
  kind: 'cloud' | 'local';
  load(): Promise<{ hands: HandRecord[]; stats: Stats }>;
  saveHand(h: HandRecord): Promise<void>;
  saveStats(s: Stats): Promise<void>;
  clear(hands: HandRecord[]): Promise<void>;
}

export const localStore: HistoryStore = {
  kind: 'local',
  async load() {
    return { hands: lsGet<HandRecord[]>(LS.hands, []), stats: { ...emptyStats(), ...lsGet<Partial<Stats>>(LS.stats, {}) } };
  },
  async saveHand(h) {
    const hands = lsGet<HandRecord[]>(LS.hands, []).filter((x) => x.id !== h.id);
    hands.push(h);
    lsSet(LS.hands, hands.slice(-MAX_LOCAL_HANDS));
  },
  async saveStats(s) {
    lsSet(LS.stats, s);
  },
  async clear() {
    lsDel(LS.hands);
    lsDel(LS.stats);
  },
};

function cloudStore(db: ClaudeDb, uid: string): HistoryStore {
  const col = db.collection(`data/users/${uid}`);
  return {
    kind: 'cloud',
    async load() {
      const snap = await col.get();
      const hands: HandRecord[] = [];
      let stats = emptyStats();
      for (const d of snap.docs) {
        const data = d.data();
        if (!data) continue;
        if (d.id === 'stats') stats = { ...emptyStats(), ...(data as Partial<Stats>) };
        else if (d.id.startsWith('hand_')) hands.push(data as unknown as HandRecord);
      }
      hands.sort((a, b) => a.number - b.number || a.id - b.id);
      return { hands, stats };
    },
    async saveHand(h) {
      await col.doc(`hand_${h.id}`).set(h as unknown as Record<string, unknown>);
    },
    async saveStats(s) {
      await col.doc('stats').set(s as unknown as Record<string, unknown>);
    },
    async clear(hands) {
      for (const h of hands) await col.doc(`hand_${h.id}`).delete().catch(() => undefined);
      await col.doc('stats').delete().catch(() => undefined);
    },
  };
}

export async function openStore(): Promise<HistoryStore> {
  try {
    if (!window.claude?.use) return localStore;
    const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
    const uid = user ? await user.id() : null;
    if (!db || !uid) return localStore;
    const store = cloudStore(db, uid);
    await store.load(); // probe access
    return store;
  } catch {
    return localStore;
  }
}

/** Offer a file to the viewer through the `downloads` capability. Returns false when unavailable. */
export async function saveFile(filename: string, data: string): Promise<'saved' | 'unavailable' | 'declined'> {
  try {
    const dl = window.claude?.use ? await window.claude.use('downloads') : null;
    if (!dl) return 'unavailable';
    await dl.save({ filename, data });
    return 'saved';
  } catch (e) {
    const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
    return code === 'declined' ? 'declined' : 'unavailable';
  }
}
