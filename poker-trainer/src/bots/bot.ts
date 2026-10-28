import { rankValue, Card, randomInt } from '../engine/cards';
import { GameState, PlayerInput, BotStyle, legalActions, potTotal, livePlayers, streetActions } from '../engine/table';
import { recommend, situationFromState, Recommendation } from '../strategy/preflopAdvisor';
import { handLabel, THREE_BET } from '../strategy/ranges';
import { classify, boardTexture, BUCKET_ORDER, Bucket } from './handStrength';

export type Rng = () => number;

/** Zoom-style: a fresh style per bot per hand (35% limper, 40% TAG, 25% LAG). */
export function randomStyle(rng: Rng = Math.random): BotStyle {
  const r = rng();
  return r < 0.35 ? 'limper' : r < 0.75 ? 'tag' : 'lag';
}

export function randomStyles(n: number, rng: Rng = Math.random): BotStyle[] {
  return Array.from({ length: n }, () => randomStyle(rng));
}

/** ±10% jitter on a threshold. */
const jitter = (x: number, rng: Rng) => x * (0.9 + 0.2 * rng());

/** Chen formula score for a starting hand (used for widening and LAG ranges). */
export function chen(cards: Card[]): number {
  const [a, b] = cards.map((c) => rankValue(c.rank)).sort((x, y) => y - x);
  const pts = (v: number) => (v === 14 ? 10 : v === 13 ? 8 : v === 12 ? 7 : v === 11 ? 6 : v / 2);
  if (a === b) return Math.max(5, pts(a) * 2);
  let s = pts(a);
  if (cards[0].suit === cards[1].suit) s += 2;
  const gap = a - b - 1;
  s -= gap === 0 ? 0 : gap === 1 ? 1 : gap === 2 ? 2 : gap === 3 ? 4 : 5;
  if (gap <= 1 && a < 12) s += 1;
  return Math.ceil(s);
}

export function decide(s: GameState, seat: number, rng: Rng = Math.random): PlayerInput {
  return s.street === 'preflop' ? preflop(s, seat, rng) : postflop(s, seat, rng);
}

/* --------------------------------------------- preflop --------------------------------------------- */

function preflop(s: GameState, seat: number, rng: Rng): PlayerInput {
  const p = s.players[seat];
  const style = p.style ?? 'tag';
  const sit = situationFromState(s, seat);
  const rec = recommend(sit);
  const label = handLabel(p.cards);
  const c = chen(p.cards);
  const level = sit.raisers.length;
  const legal = legalActions(s, seat);

  const raiseTo = (bb: number): PlayerInput => {
    const to = Math.round(bb * s.bb);
    if (to >= 0.6 * (p.stack + p.streetBet)) return { type: 'allin' };
    return legal.raise ? { type: 'raise', amount: to } : call();
  };
  const call = (): PlayerInput => (legal.check ? { type: 'check' } : { type: 'call' });
  const fold = (): PlayerInput => (legal.check ? { type: 'check' } : { type: 'fold' });
  const fromRec = (r: Recommendation): PlayerInput =>
    r.action === 'raise' ? raiseTo(r.sizeBB ?? 3) : r.action === 'allin' ? { type: 'allin' } : r.action === 'call' ? call() : fold();

  if (style === 'tag') {
    // Small random widening/tightening (±10% of hands at the edges).
    if (rec.action === 'fold' && c >= 7 && rng() < 0.1) return level === 0 ? raiseTo(3 + sit.limpers) : level === 1 ? call() : fold();
    if ((rec.action === 'raise' || rec.action === 'call') && level <= 1 && c <= 6 && rng() < 0.1) return fold();
    if (level === 2 && rec.action === 'raise' && rec.acceptable.includes('call') && rng() < 0.5) return call();
    return fromRec(rec);
  }

  if (style === 'limper') {
    if (level === 0) {
      if (rec.action === 'raise') return c >= 10 || label === 'AKo' || label === 'AQs' ? raiseTo(3 + sit.limpers) : call();
      if (sit.heroPos !== 'BB' && c >= 6 && rng() < 0.1) return call();
      return fold();
    }
    const premium = ['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(label);
    if (level === 1) {
      if (premium) return raiseTo(sit.lastRaiseToBB * (sit.heroPos === 'SB' || sit.heroPos === 'BB' ? 4 : 3));
      const pairOrSuited = label.length === 2 || label.endsWith('s');
      if (pairOrSuited && c >= jitter(5, rng) && sit.toCallBB <= jitter(4.5, rng)) return call();
      if (sit.heroPos === 'BB' && sit.toCallBB <= 2.5 && c >= 6) return call();
      return fold();
    }
    if (label === 'AA' || label === 'KK') return level >= 3 ? { type: 'allin' } : raiseTo(sit.lastRaiseToBB * 2.3);
    if (premium) return call();
    return fold();
  }

  // LAG
  const late = sit.heroPos === 'CO' || sit.heroPos === 'BTN' || sit.heroPos === 'SB';
  if (level === 0) {
    if (sit.heroPos === 'BB') return sit.limpers > 0 && c >= 9 ? raiseTo(3 + sit.limpers) : call();
    if (rec.action === 'raise' || (late && c >= jitter(5.5, rng)) || (!late && c >= jitter(8, rng))) return raiseTo(3 + sit.limpers);
    return fold();
  }
  if (level === 1) {
    const bluffs = ['A5s', 'A4s', 'A3s', 'A2s', 'KQo'];
    const mult = sit.heroPos === 'SB' || sit.heroPos === 'BB' ? 4 : 3;
    if (THREE_BET.vsLate.includes(label) || (bluffs.includes(label) && rng() < 0.6)) return raiseTo(sit.lastRaiseToBB * mult);
    if (sit.heroPos === 'BB' && c >= jitter(5, rng) && sit.toCallBB <= 3) return call();
    if (c >= jitter(7, rng) && sit.toCallBB <= 4) return call();
    return fold();
  }
  if (level === 2) {
    if (['AA', 'KK', 'QQ', 'AKs', 'AKo'].includes(label)) return raiseTo(sit.lastRaiseToBB * 2.3);
    if (['JJ', 'TT', 'AQs', 'AQo', 'KQs'].includes(label) && sit.heroRaised) return call();
    return fold();
  }
  if (['AA', 'KK'].includes(label)) return { type: 'allin' };
  if (['QQ', 'AKs', 'AKo'].includes(label)) return call();
  return fold();
}

/* --------------------------------------------- postflop --------------------------------------------- */

function postflop(s: GameState, seat: number, rng: Rng): PlayerInput {
  const p = s.players[seat];
  const style = p.style ?? 'tag';
  const legal = legalActions(s, seat);
  const st = classify(p.cards, s.board);
  const tex = boardTexture(s.board);
  const pot = potTotal(s);
  const heads = livePlayers(s).length === 2;
  const isRaiser = s.preflopAggressor === seat;
  const rank = BUCKET_ORDER.indexOf(st.bucket);
  const atLeast = (b: Bucket) => rank >= BUCKET_ORDER.indexOf(b);
  const street = s.street;

  const betFrac = (f: number): PlayerInput => {
    const amt = Math.max(s.bb, Math.round(pot * f));
    // All-in only with two pair+ or a strong draw with little behind (spec 5.2).
    if (amt >= 0.6 * p.stack) {
      if (atLeast('two_pair_plus') || (st.bucket === 'strong_draw' && p.stack < 0.4 * (pot + p.stack))) return { type: 'allin' };
      if (!atLeast('top_pair')) return { type: 'check' };
    }
    return { type: 'bet', amount: Math.min(amt, p.stack) };
  };

  if (legal.toCall === 0) {
    // Checked to (or first to act).
    const othersChecked = streetActions(s).some((a) => a.type === 'check' && a.seat !== seat);
    if (street === 'flop' && isRaiser) {
      if (heads && !tex.wet) return rng() < jitter(0.7, rng) ? betFrac(1 / 3) : { type: 'check' };
      if (atLeast('top_pair') || st.bucket === 'strong_draw') return betFrac(0.5 + rng() * 0.17);
      return { type: 'check' };
    }
    if (atLeast('two_pair_plus')) return rng() < (isRaiser || style !== 'limper' ? 0.85 : 0.4) ? betFrac(street === 'river' ? 0.67 : 0.5 + rng() * 0.17) : { type: 'check' };
    if (atLeast('top_pair')) {
      if (isRaiser || s.lastAggressor === null) {
        const chance = isRaiser ? 0.75 : style === 'lag' ? 0.5 : 0.25;
        if (rng() < chance) return betFrac(street === 'turn' ? 0.5 : 0.5 + rng() * 0.17);
      }
      return { type: 'check' };
    }
    if (st.bucket === 'strong_draw' && street === 'turn' && (isRaiser || style === 'lag') && rng() < 0.5) return betFrac(0.5);
    if (street === 'river' && othersChecked && st.bucket === 'nothing' && rng() < jitter(style === 'lag' ? 0.25 : 0.15, rng)) return betFrac(0.5);
    if (style === 'lag' && othersChecked && street !== 'river' && rng() < 0.25) return betFrac(1 / 3);
    return { type: 'check' };
  }

  // Facing a bet.
  const price = legal.toCall / (pot + legal.toCall);
  const facingRaise = s.raisesThisStreet >= 2;
  const cards = street === 'flop' ? 2 : 1;
  const equity = Math.min(0.6, (st.outs * (cards === 2 ? 4 : 2)) / 100);

  if (atLeast('two_pair_plus')) {
    if (legal.raise && rng() < (style === 'limper' ? 0.45 : 0.6)) {
      const to = s.currentBet + Math.round((pot + legal.toCall) * 0.75);
      return to >= 0.6 * (p.stack + p.streetBet) ? { type: 'allin' } : { type: 'raise', amount: to };
    }
    return { type: 'call' };
  }
  if (st.bucket === 'overpair' || st.bucket === 'top_pair') {
    if (facingRaise && price > jitter(0.3, rng)) return { type: 'fold' };
    return { type: 'call' };
  }
  if (st.bucket === 'medium_pair') {
    if (street === 'river') return rng() < 0.5 && !facingRaise ? { type: 'call' } : { type: 'fold' };
    return price <= jitter(0.35, rng) && !facingRaise ? { type: 'call' } : { type: 'fold' };
  }
  if (st.bucket === 'weak_pair') {
    return street === 'flop' && price <= jitter(0.25, rng) && !facingRaise ? { type: 'call' } : { type: 'fold' };
  }
  if (st.bucket === 'strong_draw') {
    if (!facingRaise && legal.raise && rng() < (style === 'lag' ? 0.25 : 0.1)) {
      return { type: 'raise', amount: s.currentBet + Math.round((pot + legal.toCall) * 0.75) };
    }
    return equity + 0.08 >= jitter(price, rng) ? { type: 'call' } : { type: 'fold' };
  }
  if (st.bucket === 'weak_draw') {
    return street === 'flop' && price <= jitter(0.2, rng) ? { type: 'call' } : { type: 'fold' };
  }
  // Nothing: LAG floats occasionally.
  if (style === 'lag' && street === 'flop' && heads && price <= 0.25 && randomInt(4) === 0) return { type: 'call' };
  return { type: 'fold' };
}
