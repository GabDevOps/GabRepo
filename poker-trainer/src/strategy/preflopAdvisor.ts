import type { GameState, Position } from '../engine/table';
import { legalActions } from '../engine/table';
import {
  FACING_3BET,
  FACING_4BET,
  OPEN_TIERS,
  THREE_BET,
  isLateRaiser,
  isSmallPair,
  isSuitedAce,
  isSuitedConnector,
  outlineOf,
  tierOf,
  handLabel,
} from './ranges';

export type PreflopSituation = {
  heroPos: Position;
  label: string;
  /** Positions that raised preflop, in order (the BB post is not a raise). */
  raisers: Position[];
  /** Current price to have matched, in big blinds. */
  lastRaiseToBB: number;
  toCallBB: number;
  limpers: number;
  callersAfterLastRaise: number;
  heroRaised: boolean;
  heroInPosition: boolean;
  playersBehind: number;
};

export type RecAction = 'raise' | 'call' | 'fold' | 'check' | 'allin';

export type Recommendation = {
  action: RecAction;
  /** Other actions the rule book also accepts here. */
  acceptable: RecAction[];
  /** Raise-to size in big blinds, when raising. */
  sizeBB?: number;
  /** Short label, e.g. "Open from CO: RAISE". */
  text: string;
  /** One-line reason from the rule book. */
  why: string;
};

const POSTFLOP_ORDER: Position[] = ['SB', 'BB', 'UTG', 'HJ', 'CO', 'BTN'];
const inBlinds = (p: Position) => p === 'SB' || p === 'BB';

export function recommend(s: PreflopSituation): Recommendation {
  const { heroPos, label } = s;
  const level = s.raisers.length;
  const tier = tierOf(label);
  const outline = outlineOf(label);

  if (level === 0) {
    if (heroPos === 'BB') {
      return {
        action: 'check',
        acceptable: tier === 'green' && s.limpers > 0 ? ['raise'] : [],
        text: 'BB, no raise: CHECK',
        why: 'BB with no raise checks.',
      };
    }
    const size = 3 + s.limpers;
    const vs = s.limpers ? ` vs ${s.limpers} limper${s.limpers > 1 ? 's' : ''}` : '';
    if (OPEN_TIERS[heroPos].includes(tier)) {
      return {
        action: 'raise',
        acceptable: [],
        sizeBB: size,
        text: `Open from ${heroPos}${vs}: RAISE to ${size} BB`,
        why: `${label} is ${tier.toUpperCase()}; ${heroPos} opens ${OPEN_TIERS[heroPos].join(' + ').toUpperCase()}. Never limp.`,
      };
    }
    return {
      action: 'fold',
      acceptable: [],
      text: `Open from ${heroPos}${vs}: FOLD`,
      why: `${label} is ${tier === 'fold' ? 'not in the chart' : tier.toUpperCase() + ', not opened from ' + heroPos}.`,
    };
  }

  const last = s.raisers[level - 1];

  if (level === 1) {
    const late = isLateRaiser(last);
    const list = late ? THREE_BET.vsLate : THREE_BET.vsEarly;
    const vs = `vs ${last} raise`;
    if (list.includes(label)) {
      const mult = inBlinds(heroPos) ? 4 : 3;
      return {
        action: 'raise',
        acceptable: [],
        sizeBB: round1(s.lastRaiseToBB * mult),
        text: `${vs}: 3-BET to ${round1(s.lastRaiseToBB * mult)} BB`,
        why: `${label} is on the 3-bet list vs ${late ? 'late' : 'early'} raisers (${mult}× ${inBlinds(heroPos) ? 'from the blinds' : 'in position'}).`,
      };
    }
    const cont =
      outline === 'red' ||
      (outline === 'yellow' && late) ||
      (outline === 'black' && late && (heroPos === 'BTN' || heroPos === 'BB'));

    if (heroPos === 'BB' && s.lastRaiseToBB <= 3 && (outline || isSuitedConnector(label) || isSuitedAce(label))) {
      return { action: 'call', acceptable: [], text: `${vs}: CALL (BB discount)`, why: 'BB calls wider vs ≤ 3 BB raises.' };
    }
    if (heroPos === 'SB') {
      if (outline === 'red' && s.toCallBB <= 3.5 && s.callersAfterLastRaise >= 1) {
        return { action: 'call', acceptable: [], text: `${vs}: CALL (red, cheap, multiway)`, why: 'SB calls only red hands cheap in multiway pots.' };
      }
      return {
        action: 'fold',
        acceptable: [],
        text: `${vs}: FOLD, SB is 3-bet or fold`,
        why: 'Small blind: default is 3-bet or fold.',
      };
    }
    if (cont && isSmallPair(label)) {
      if (s.toCallBB <= 3.5 && (s.callersAfterLastRaise >= 1 || s.playersBehind >= 1)) {
        return { action: 'call', acceptable: [], text: `${vs}: CALL (small pair, cheap)`, why: 'Small pairs call cheap raises with others likely in.' };
      }
      return { action: 'fold', acceptable: [], text: `${vs}: FOLD, small pair too expensive`, why: 'Small pairs fold vs large raises.' };
    }
    if (cont) {
      return {
        action: 'call',
        acceptable: [],
        text: `${vs}: CALL (${outline})`,
        why: `${outline!.toUpperCase()}: ${outline === 'red' ? 'continue vs any seat' : 'continue vs a late raiser'}.`,
      };
    }
    let why = 'Not in the continue ranges.';
    if (outline === 'yellow') why = 'yellow needs a late raiser';
    if (outline === 'black') why = late ? 'black continues only from BTN or BB' : 'black needs a late raiser';
    return { action: 'fold', acceptable: [], text: `${vs}: FOLD, ${why}`, why };
  }

  if (level === 2) {
    const vs = `vs ${last} 3-bet`;
    if (FACING_3BET.fourBet.includes(label))
      return { action: 'raise', acceptable: ['allin'], sizeBB: round1(s.lastRaiseToBB * 2.3), text: `${vs}: 4-BET`, why: 'AA/KK 4-bet (2.2–2.5×).' };
    if (FACING_3BET.fourBetOrCall.includes(label))
      return { action: 'raise', acceptable: ['call'], sizeBB: round1(s.lastRaiseToBB * 2.3), text: `${vs}: 4-BET or CALL`, why: 'QQ/AK 4-bet or call.' };
    if (s.heroRaised && FACING_3BET.callInPosition.includes(label)) {
      return s.heroInPosition
        ? { action: 'call', acceptable: [], text: `${vs}: CALL in position`, why: 'JJ TT AQs KQs call in position only.' }
        : { action: 'fold', acceptable: [], text: `${vs}: FOLD, out of position`, why: 'JJ TT AQs KQs call in position only.' };
    }
    return { action: 'fold', acceptable: [], text: `${vs}: FOLD`, why: 'Everything else folds to a 3-bet.' };
  }

  const vs = `vs ${last} ${level === 3 ? '4-bet' : 're-raise'}`;
  if (FACING_4BET.shove.includes(label))
    return { action: 'allin', acceptable: ['raise', 'call'], text: `${vs}: ALL-IN`, why: 'AA/KK 5-bet all-in.' };
  if (FACING_4BET.call.includes(label))
    return { action: 'call', acceptable: [], text: `${vs}: CALL`, why: 'QQ/AK call a 4-bet.' };
  return { action: 'fold', acceptable: [], text: `${vs}: FOLD`, why: 'Rest folds to a 4-bet.' };
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}

/** Build the preflop situation for `seat` from a live game state. */
export function situationFromState(s: GameState, seat: number): PreflopSituation {
  const me = s.players[seat];
  const pre = s.actions.filter((a) => a.street === 'preflop');
  const raisers: Position[] = [];
  let limpers = 0;
  let callersAfterLastRaise = 0;
  let heroRaised = false;
  for (const a of pre) {
    if (a.type === 'bet' || a.type === 'raise') {
      raisers.push(s.players[a.seat].position);
      callersAfterLastRaise = 0;
      if (a.seat === seat) heroRaised = true;
    } else if (a.type === 'call') {
      if (raisers.length === 0) limpers++;
      else callersAfterLastRaise++;
    }
  }
  const lastRaiser = [...pre].reverse().find((a) => a.type === 'bet' || a.type === 'raise');
  const heroInPosition = lastRaiser
    ? POSTFLOP_ORDER.indexOf(me.position) > POSTFLOP_ORDER.indexOf(s.players[lastRaiser.seat].position)
    : false;
  const toCall = s.toAct === seat ? legalActions(s, seat).toCall : Math.max(0, s.currentBet - me.streetBet);
  const playersBehind = s.players.filter(
    (p) => p.seat !== seat && !p.folded && !p.acted && (!lastRaiser || p.seat !== lastRaiser.seat),
  ).length;
  return {
    heroPos: me.position,
    label: handLabel(me.cards),
    raisers,
    lastRaiseToBB: s.currentBet / s.bb,
    toCallBB: toCall / s.bb,
    limpers,
    callersAfterLastRaise,
    heroRaised,
    heroInPosition,
    playersBehind,
  };
}

/** Grade a simple raise/call/fold(/check) choice against the rule book. */
export function gradeChoice(rec: Recommendation, choice: RecAction): 'correct' | 'acceptable' | 'wrong' {
  const norm = (a: RecAction) => (a === 'allin' ? 'raise' : a);
  if (norm(choice) === norm(rec.action)) return 'correct';
  if (rec.acceptable.map(norm).includes(norm(choice))) return 'acceptable';
  return 'wrong';
}
