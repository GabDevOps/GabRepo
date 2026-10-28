import { Card, rankValue } from './cards';

export enum HandCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
}

export const CATEGORY_NAME: Record<HandCategory, string> = {
  [HandCategory.HighCard]: 'High card',
  [HandCategory.Pair]: 'Pair',
  [HandCategory.TwoPair]: 'Two pair',
  [HandCategory.Trips]: 'Three of a kind',
  [HandCategory.Straight]: 'Straight',
  [HandCategory.Flush]: 'Flush',
  [HandCategory.FullHouse]: 'Full house',
  [HandCategory.Quads]: 'Four of a kind',
  [HandCategory.StraightFlush]: 'Straight flush',
};

export type HandValue = { category: HandCategory; score: number; name: string };

function encode(cat: HandCategory, kickers: number[]): number {
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 15 + (kickers[i] ?? 0);
  return s;
}

/** Highest straight top card in a set of rank values (wheel = 5), or 0. */
function straightHigh(values: Set<number>): number {
  for (let top = 14; top >= 5; top--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      const v = top - k === 1 ? 14 : top - k;
      if (!values.has(v)) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  return 0;
}

/** Best 5-card hand out of 5–7 cards. Higher score wins. */
export function evaluate(cards: Card[]): HandValue {
  const bySuit: Record<string, number[]> = { s: [], h: [], d: [], c: [] };
  const counts = new Map<number, number>();
  for (const c of cards) {
    const v = rankValue(c.rank);
    bySuit[c.suit].push(v);
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }

  for (const s of Object.keys(bySuit)) {
    if (bySuit[s].length >= 5) {
      const sf = straightHigh(new Set(bySuit[s]));
      if (sf) return mk(HandCategory.StraightFlush, [sf]);
    }
  }

  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const desc = [...counts.keys()].sort((a, b) => b - a);

  if (groups[0][1] === 4) {
    const q = groups[0][0];
    return mk(HandCategory.Quads, [q, desc.find((v) => v !== q)!]);
  }
  const trips = groups.filter((g) => g[1] === 3).map((g) => g[0]);
  const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]);
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const t = trips[0];
    const p = Math.max(...trips.slice(1), ...pairs);
    return mk(HandCategory.FullHouse, [t, p]);
  }
  for (const s of Object.keys(bySuit)) {
    if (bySuit[s].length >= 5) {
      return mk(HandCategory.Flush, [...bySuit[s]].sort((a, b) => b - a).slice(0, 5));
    }
  }
  const st = straightHigh(new Set(desc));
  if (st) return mk(HandCategory.Straight, [st]);
  if (trips.length) {
    const t = trips[0];
    return mk(HandCategory.Trips, [t, ...desc.filter((v) => v !== t).slice(0, 2)]);
  }
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    return mk(HandCategory.TwoPair, [a, b, desc.find((v) => v !== a && v !== b)!]);
  }
  if (pairs.length === 1) {
    const p = pairs[0];
    return mk(HandCategory.Pair, [p, ...desc.filter((v) => v !== p).slice(0, 3)]);
  }
  return mk(HandCategory.HighCard, desc.slice(0, 5));
}

function mk(category: HandCategory, kickers: number[]): HandValue {
  return { category, score: encode(category, kickers), name: CATEGORY_NAME[category] };
}
