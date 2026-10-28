import { Card, rankValue } from '../engine/cards';
import { evaluate, HandCategory } from '../engine/evaluator';

export type Bucket = 'nothing' | 'weak_draw' | 'strong_draw' | 'weak_pair' | 'medium_pair' | 'top_pair' | 'overpair' | 'two_pair_plus';

export const BUCKET_ORDER: Bucket[] = [
  'nothing',
  'weak_draw',
  'strong_draw',
  'weak_pair',
  'medium_pair',
  'top_pair',
  'overpair',
  'two_pair_plus',
];

export type Strength = { bucket: Bucket; outs: number; flushDraw: boolean; straightDraw: 'oesd' | 'gutshot' | null };

/** Bucket a bot's hand on the current board (spec 5.2). Board must have 3–5 cards. */
export function classify(hole: Card[], board: Card[]): Strength {
  const all = [...hole, ...board];
  const v = evaluate(all);
  const boardVals = board.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const boardCat = boardOnlyCategory(board);
  const draws = drawInfo(hole, board);
  const h = hole.map((c) => rankValue(c.rank));
  const pocketPair = h[0] === h[1];

  let bucket: Bucket = 'nothing';
  if (v.category >= HandCategory.Straight) {
    // Straights/flushes made only by the board don't count.
    const boardBest = board.length === 5 ? evaluate(board).score : -1;
    bucket = v.score > boardBest ? 'two_pair_plus' : 'nothing';
  } else if (v.category > boardCat && v.category >= HandCategory.TwoPair) {
    const pairedBoard = boardCat >= HandCategory.Pair;
    if (v.category === HandCategory.TwoPair && pairedBoard) {
      // Board pair + one pair of ours: grade our pair.
      bucket = pairBucket(h, pocketPair, boardVals);
    } else bucket = 'two_pair_plus';
  } else if (v.category === HandCategory.Pair && v.category > boardCat) {
    bucket = pairBucket(h, pocketPair, boardVals);
  } else if (v.category === HandCategory.TwoPair && boardCat === HandCategory.TwoPair) {
    bucket = pocketPair ? pairBucket(h, true, boardVals) : 'nothing';
  } else if (v.category === HandCategory.Trips && boardCat === HandCategory.Trips) {
    bucket = 'nothing';
  }

  if (board.length < 5 && (bucket === 'nothing' || bucket === 'weak_pair')) {
    if (draws.outs >= 8) bucket = bucket === 'nothing' ? 'strong_draw' : bucket;
    else if (draws.outs >= 4 && bucket === 'nothing') bucket = 'weak_draw';
  }
  return { bucket, ...draws };
}

function pairBucket(h: number[], pocketPair: boolean, boardVals: number[]): Bucket {
  const top = boardVals[0];
  const distinct = [...new Set(boardVals)];
  if (pocketPair) {
    if (h[0] > top) return 'overpair';
    if (h[0] > (distinct[1] ?? 0)) return 'medium_pair';
    return 'weak_pair';
  }
  const paired = h.find((x) => boardVals.includes(x));
  if (paired === undefined) return 'weak_pair';
  if (paired === top) return 'top_pair';
  if (paired === distinct[1]) return 'medium_pair';
  return 'weak_pair';
}

function boardOnlyCategory(board: Card[]): HandCategory {
  const counts = new Map<string, number>();
  for (const c of board) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const g = [...counts.values()].sort((a, b) => b - a);
  if (g[0] === 4) return HandCategory.Quads;
  if (g[0] === 3 && g[1] === 2) return HandCategory.FullHouse;
  if (g[0] === 3) return HandCategory.Trips;
  if (g[0] === 2 && g[1] === 2) return HandCategory.TwoPair;
  if (g[0] === 2) return HandCategory.Pair;
  return HandCategory.HighCard;
}

/** Flush and straight draws that use at least one hole card. */
export function drawInfo(hole: Card[], board: Card[]): { outs: number; flushDraw: boolean; straightDraw: 'oesd' | 'gutshot' | null } {
  const all = [...hole, ...board];
  let flushDraw = false;
  for (const s of ['s', 'h', 'd', 'c']) {
    const n = all.filter((c) => c.suit === s).length;
    if (n === 4 && hole.some((c) => c.suit === s)) flushDraw = true;
  }
  const vals = new Set(all.map((c) => rankValue(c.rank)));
  if (vals.has(14)) vals.add(1);
  const holeVals = new Set(hole.map((c) => rankValue(c.rank)).flatMap((x) => (x === 14 ? [14, 1] : [x])));
  const made = (set: Set<number>) => {
    for (let lo = 1; lo <= 10; lo++) {
      let ok = true;
      for (let k = 0; k < 5; k++) if (!set.has(lo + k)) ok = false;
      if (ok) return true;
    }
    return false;
  };
  // Count ranks that would complete a straight using a hole card.
  let outsRanks = 0;
  if (!made(vals)) {
    for (let r = 2; r <= 14; r++) {
      if (vals.has(r)) continue;
      const t = new Set(vals);
      t.add(r);
      if (r === 14) t.add(1);
      if (!made(t)) continue;
      // Require the straight to use one of our hole cards.
      for (let lo = 1; lo <= 10; lo++) {
        let ok = true;
        let usesHole = false;
        for (let k = 0; k < 5; k++) {
          if (!t.has(lo + k)) ok = false;
          if (holeVals.has(lo + k)) usesHole = true;
        }
        if (ok && usesHole) {
          outsRanks++;
          break;
        }
      }
    }
  }
  const straightDraw = outsRanks >= 2 ? 'oesd' : outsRanks === 1 ? 'gutshot' : null;
  let outs = (flushDraw ? 9 : 0) + outsRanks * 4;
  if (flushDraw && outsRanks) outs -= outsRanks; // straight cards of the flush suit are already counted
  return { outs, flushDraw, straightDraw };
}

export type Texture = { wet: boolean; high: boolean; paired: boolean; monotone: boolean };

export function boardTexture(board: Card[]): Texture {
  const flop = board.slice(0, Math.max(3, board.length));
  const suitCounts = new Map<string, number>();
  for (const c of flop) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  const maxSuit = Math.max(...suitCounts.values());
  const vals = [...new Set(flop.map((c) => rankValue(c.rank)))].sort((a, b) => a - b);
  let connected = 0;
  for (let i = 0; i + 1 < vals.length; i++) if (vals[i + 1] - vals[i] <= 2) connected++;
  const paired = vals.length < flop.length;
  return {
    wet: maxSuit >= 3 || (maxSuit === 2 && connected >= 1) || connected >= 2,
    high: vals[vals.length - 1] >= 10,
    paired,
    monotone: maxSuit >= 3,
  };
}
