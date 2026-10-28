import { Card, RANKS, SUITS, randomInt } from '../engine/cards';
import type { Position } from '../engine/table';
import { allLabels, outlineOf, tierOf } from './ranges';
import { PreflopSituation, Recommendation, recommend } from './preflopAdvisor';

const PREFLOP_ORDER: Position[] = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

export type DrillQuestion = {
  cards: Card[];
  label: string;
  heroPos: Position;
  raiserPos: Position | null;
  raiseToBB: number;
  callers: number;
  situation: PreflopSituation;
  rec: Recommendation;
  prompt: string;
};

const pick = <T,>(a: T[]): T => a[randomInt(a.length)];

export function cardsForLabel(label: string): Card[] {
  const r1 = label[0] as Card['rank'];
  const r2 = label[1] as Card['rank'];
  const s1 = pick(SUITS);
  if (label.length === 2) {
    const s2 = pick(SUITS.filter((s) => s !== s1));
    return [{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }];
  }
  const s2 = label[2] === 's' ? s1 : pick(SUITS.filter((s) => s !== s1));
  return [{ rank: r1, suit: s1 }, { rank: r2, suit: s2 }];
}

export function makeQuestion(): DrillQuestion {
  const labels = allLabels();
  const interesting = labels.filter((l) => tierOf(l) !== 'fold' || outlineOf(l));
  const label = randomInt(10) < 7 ? pick(interesting) : pick(labels);
  const heroPos = pick(PREFLOP_ORDER);
  const idx = PREFLOP_ORDER.indexOf(heroPos);
  const facing = heroPos === 'BB' || (heroPos !== 'UTG' && randomInt(2) === 0);
  let raiserPos: Position | null = null;
  let raiseToBB = 1;
  let callers = 0;
  if (facing) {
    const ri = randomInt(idx);
    raiserPos = PREFLOP_ORDER[ri];
    raiseToBB = pick([2.5, 3, 3, 3, 3.5, 4]);
    if (idx - ri > 1 && randomInt(10) < 3) callers = 1;
  }
  const posted = heroPos === 'SB' ? 0.5 : heroPos === 'BB' ? 1 : 0;
  const situation: PreflopSituation = {
    heroPos,
    label,
    raisers: raiserPos ? [raiserPos] : [],
    lastRaiseToBB: raiseToBB,
    toCallBB: raiseToBB - posted,
    limpers: 0,
    callersAfterLastRaise: callers,
    heroRaised: false,
    heroInPosition: false,
    playersBehind: PREFLOP_ORDER.length - 1 - idx,
  };
  const prompt = raiserPos
    ? `You are ${heroPos}. ${raiserPos} raised to ${raiseToBB} BB${callers ? ', one player called' : ''}.`
    : `You are ${heroPos}. Folded to you.`;
  return { cards: cardsForLabel(label), label, heroPos, raiserPos, raiseToBB, callers, situation, rec: recommend(situation), prompt };
}

export const DRILL_BATCH = 8;
export { RANKS };
