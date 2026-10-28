/**
 * Instant, rule-based grading of a hero decision (runs in the browser in a few ms).
 * Preflop it is exact against the rule book; postflop it checks price, outs and the
 * main rules of thumb. Claude's comment arrives later and replaces it on the card.
 */
import { Action, GameState, legalActions, livePlayers, potTotal } from '../engine/table';
import { evaluate } from '../engine/evaluator';
import { fmt } from '../engine/money';
import { classify, drawInfo, boardTexture, Bucket } from '../bots/handStrength';
import { gradeChoice, recommend, RecAction, situationFromState } from '../strategy/preflopAdvisor';
import { outlineOf, tierOf, THREE_BET, isLateRaiser } from '../strategy/ranges';
import type { ActionVerdict, CoachReply } from '../types';

const VERB: Record<ActionVerdict, string> = { correct: 'Correct', acceptable: 'Acceptable', wrong: 'Wrong' };
const pct = (x: number) => Math.round(x * 1000) / 10;

function reply(o: Omit<CoachReply, 'reasoning_verdict' | 'source'>): CoachReply {
  return { ...o, reasoning_verdict: 'none', source: 'quick' };
}

function actionWord(a: Action): string {
  if (a.allIn && a.type !== 'fold' && a.type !== 'check') return 'all-in';
  return a.type === 'bet' ? 'bet' : a.type === 'raise' ? 'raise' : a.type;
}

export function quickCheck(before: GameState, action: Action): CoachReply {
  return before.street === 'preflop' ? preflop(before, action) : postflop(before, action);
}

/* ------------------------------------------------ preflop ------------------------------------------------ */

function preflop(s: GameState, a: Action): CoachReply {
  const sit = situationFromState(s, s.heroSeat);
  const rec = recommend(sit);
  const label = sit.label;
  const level = sit.raisers.length;
  const choice: RecAction =
    a.type === 'fold' ? 'fold' : a.type === 'check' ? 'check' : a.type === 'call' ? 'call' : a.allIn ? 'allin' : 'raise';
  let verdict = gradeChoice(rec, choice);
  const leaks: string[] = [];
  const bullets: string[] = [];

  const tier = tierOf(label);
  const outline = outlineOf(label);
  bullets.push(`- ${label}: ${tier === 'fold' ? 'not in the opening chart' : `${tier.toUpperCase()} hand`}${outline ? `, ${outline.toUpperCase()} outline` : ''}.`);
  bullets.push(`- Rule book: ${rec.why}`);

  if (level === 0 && choice === 'call') {
    verdict = 'wrong';
    leaks.push('PF-LIMP');
    bullets.push('- Never limp: raise to 3 BB (+1 BB per limper) or fold.');
  } else if (verdict === 'wrong') {
    const playing = choice !== 'fold' && choice !== 'check';
    if (!playing && rec.action !== 'fold' && rec.action !== 'check') leaks.push('PF-TIGHT');
    else if (playing && rec.action === 'fold') leaks.push(choice === 'call' ? 'PF-LOOSE' : level >= 1 ? 'PF-BAD3B' : 'PF-LOOSE');
    else if (choice === 'call' && rec.action === 'raise' && level === 1) {
      leaks.push('PF-NO3B');
      const list = isLateRaiser(sit.raisers[0]) ? THREE_BET.vsLate : THREE_BET.vsEarly;
      bullets.push(`- ${label} is on the 3-bet list (${list.join(' ')}): 3-bet, don't flat.`);
    } else if (choice === 'raise' && rec.action === 'call') leaks.push(level >= 1 ? 'PF-BAD3B' : 'PF-LOOSE');
  }

  // Size check for raises the rule book also wants.
  if ((choice === 'raise' || choice === 'allin') && rec.action === 'raise' && rec.sizeBB && !a.allIn) {
    const toBB = (a.amount ?? 0) / s.bb;
    if (level === 0 && toBB < 2.5) {
      leaks.push('PF-LIMP');
      verdict = 'acceptable';
      bullets.push(`- Never min-raise: open to ${rec.sizeBB} BB (${fmt(Math.round(rec.sizeBB * s.bb))}).`);
    } else if (Math.abs(toBB - rec.sizeBB) / rec.sizeBB > 0.35) {
      leaks.push('PF-SIZE');
      if (verdict === 'correct') verdict = 'acceptable';
      bullets.push(`- Size: you made it ${toBB.toFixed(1)} BB; the rule book uses ${rec.sizeBB} BB (${fmt(Math.round(rec.sizeBB * s.bb))}).`);
    }
  }

  const better =
    verdict === 'correct'
      ? null
      : rec.action === 'raise' && rec.sizeBB
        ? `Raise to ${fmt(Math.round(rec.sizeBB * s.bb))} (${rec.sizeBB} BB)`
        : rec.action === 'allin'
          ? 'All-in'
          : rec.action[0].toUpperCase() + rec.action.slice(1);
  return reply({
    action_verdict: verdict,
    headline: `${VERB[verdict]}: ${actionWord(a)}. ${rec.text}.`,
    better_play: better,
    explanation: bullets.join('\n'),
    numbers: null,
    leaks: [...new Set(leaks)],
  });
}

/* ------------------------------------------------ postflop ------------------------------------------------ */

const STRONG: Bucket[] = ['two_pair_plus'];
const GOOD_PAIR: Bucket[] = ['top_pair', 'overpair'];
const WEAK_PAIR: Bucket[] = ['weak_pair', 'medium_pair'];

function postflop(s: GameState, a: Action): CoachReply {
  const hero = s.players[s.heroSeat];
  const legal = legalActions(s, s.heroSeat);
  const pot = potTotal(s);
  const toCall = Math.min(legal.toCall, hero.stack);
  const st = classify(hero.cards, s.board);
  const draws = drawInfo(hero.cards, s.board);
  const tex = boardTexture(s.board);
  const made = evaluate([...hero.cards, ...s.board]);
  const players = livePlayers(s).length;
  const unseen = 52 - 2 - s.board.length;
  const cardsToCome = 5 - s.board.length;
  const outs = s.board.length < 5 ? draws.outs : 0;
  const hitNext = outs / unseen;
  const hitTwo = cardsToCome === 2 ? 1 - (1 - outs / unseen) * (1 - outs / (unseen - 1)) : null;
  const price = toCall > 0 ? toCall / (pot + toCall) : null;
  const isPfr = s.preflopAggressor === s.heroSeat;
  const firstFlopAction = s.street === 'flop' && !s.actions.some((x) => x.street === 'flop' && x.seat === s.heroSeat);
  const word = actionWord(a);
  const betFrac = a.type === 'bet' ? (a.amount ?? 0) / pot : a.type === 'raise' ? ((a.amount ?? 0) - s.currentBet) / (pot + toCall) : 0;
  const aggressive = a.type === 'bet' || a.type === 'raise';

  let verdict: ActionVerdict = 'acceptable';
  let better: string | null = null;
  const leaks: string[] = [];
  const bullets: string[] = [];

  const handDesc = STRONG.includes(st.bucket)
    ? `${made.name.toLowerCase()} (strong)`
    : GOOD_PAIR.includes(st.bucket)
      ? st.bucket === 'overpair' ? 'an overpair' : 'top pair'
      : WEAK_PAIR.includes(st.bucket)
        ? 'a weak/medium pair'
        : outs >= 4
          ? `a draw (${draws.flushDraw ? 'flush draw' : ''}${draws.flushDraw && draws.straightDraw ? ' + ' : ''}${draws.straightDraw === 'oesd' ? 'open-ended straight draw' : draws.straightDraw === 'gutshot' ? 'gutshot' : ''})`
          : 'nothing (no pair, no real draw)';
  bullets.push(`- Your hand: ${handDesc}. Board is ${tex.wet ? 'wet/coordinated' : 'dry'}${tex.paired ? ', paired' : ''}; ${players} players; ${cardsToCome} card${cardsToCome === 1 ? '' : 's'} to come.`);
  if (price !== null) {
    bullets.push(`- Price: ${fmt(toCall)} ÷ (${fmt(pot)} + ${fmt(toCall)}) = ${pct(price)}%.`);
  }
  if (outs >= 4) {
    bullets.push(`- Outs: ${outs} of ${unseen} unseen = ${pct(hitNext)}% next card${hitTwo !== null ? `, ${pct(hitTwo)}% by the river` : ''}.`);
  }

  const spr = hero.stack / Math.max(1, pot);

  if (toCall > 0) {
    // Facing a bet.
    const facingRaise = s.raisesThisStreet >= 2;
    if (STRONG.includes(st.bucket)) {
      verdict = a.type === 'fold' ? 'wrong' : aggressive || a.allIn ? 'correct' : tex.wet ? 'acceptable' : 'correct';
      if (a.type === 'fold') leaks.push('ODDS-FOLD');
      if (a.type === 'call' && tex.wet) {
        leaks.push('VAL-THIN');
        better = 'Raise (about 3× the bet)';
        bullets.push('- Strong hand + wet board = raise for value now (rule 4).');
      }
    } else if (GOOD_PAIR.includes(st.bucket)) {
      if (a.type === 'fold') {
        verdict = facingRaise ? 'acceptable' : 'wrong';
        if (!facingRaise) {
          leaks.push('ODDS-FOLD');
          better = `Call ${fmt(toCall)}`;
          bullets.push('- Top pair / overpair is ahead of most betting ranges facing a single bet: call.');
        } else bullets.push('- A raise from a passive player means strength (rule 11); folding one pair is fine.');
      } else if (a.type === 'call') verdict = 'correct';
      else {
        verdict = facingRaise || a.allIn ? 'wrong' : 'acceptable';
        leaks.push(facingRaise || a.allIn ? 'STACKOFF' : 'VAL-OVER');
        better = `Call ${fmt(toCall)}`;
        bullets.push('- One pair is not a hand to build a huge pot with (rule 11): call, don\'t raise.');
      }
    } else if (outs >= 8 || (outs >= 4 && cardsToCome > 0)) {
      const allInCall = toCall >= hero.stack;
      const equity = allInCall && hitTwo !== null ? hitTwo : hitNext;
      const ok = equity + 0.03 >= price!;
      if (a.type === 'fold') {
        verdict = ok ? 'wrong' : 'correct';
        if (ok) {
          leaks.push('ODDS-FOLD');
          better = `Call ${fmt(toCall)}`;
        }
      } else if (a.type === 'call') {
        verdict = ok ? 'correct' : equity + 0.08 >= price! ? 'acceptable' : 'wrong';
        if (!ok) leaks.push('ODDS-CALL');
        if (verdict === 'wrong') better = 'Fold';
      } else {
        verdict = outs >= 8 ? 'acceptable' : 'wrong';
        if (verdict === 'wrong') {
          leaks.push('CB-WET');
          better = ok ? `Call ${fmt(toCall)}` : 'Fold';
        }
        bullets.push('- Raising a draw is a semi-bluff: fine with 8+ outs and fold equity, not with a gutshot.');
      }
      bullets.push(`- ${ok ? 'Your chance of hitting beats the price' : 'The price is higher than your chance of hitting'} (rule 6: call if chance > price).`);
    } else if (WEAK_PAIR.includes(st.bucket)) {
      if (a.type === 'fold') verdict = price! > 0.3 || facingRaise ? 'correct' : 'acceptable';
      else if (a.type === 'call') {
        verdict = price! <= 0.3 && !facingRaise ? 'acceptable' : 'wrong';
        if (verdict === 'wrong') {
          leaks.push('ODDS-CALL');
          better = 'Fold';
        }
      } else {
        verdict = 'wrong';
        leaks.push('VAL-OVER');
        better = price! <= 0.3 ? `Call ${fmt(toCall)}` : 'Fold';
      }
    } else {
      // Nothing.
      if (a.type === 'fold') verdict = 'correct';
      else {
        verdict = s.street === 'river' && price! < 0.15 && a.type === 'call' ? 'acceptable' : 'wrong';
        leaks.push(a.type === 'call' ? 'ODDS-CALL' : 'CB-WET');
        better = 'Fold';
        bullets.push('- With no pair and no draw there is nothing to call with (rule 5: your two cards and the price).');
      }
    }
  } else {
    // Checked to the hero, or first to act.
    if (STRONG.includes(st.bucket)) {
      if (!aggressive && !a.allIn) {
        verdict = tex.wet ? 'wrong' : 'acceptable';
        leaks.push(tex.wet ? 'SLOWPLAY' : 'VAL-THIN');
        better = `Bet ${fmt(Math.round(pot * (tex.wet ? 0.75 : 0.5)))} (${tex.wet ? '3/4' : '1/2'} pot)`;
        bullets.push(`- Strong hand${tex.wet ? ' + wet board = bet (rule 4)' : ': bet for value'}; checking gives free cards.`);
      } else {
        verdict = tex.wet && betFrac < 0.5 && !a.allIn ? 'acceptable' : 'correct';
        if (verdict === 'acceptable') {
          leaks.push('VAL-THIN');
          bullets.push('- On a wet board bet 2/3 to pot with a strong hand.');
        }
      }
    } else if (GOOD_PAIR.includes(st.bucket)) {
      if (aggressive || a.allIn) {
        verdict = betFrac > 1.1 || a.allIn ? 'acceptable' : 'correct';
        if (verdict === 'acceptable') {
          leaks.push('VAL-OVER');
          bullets.push('- Overbetting one pair only gets called by better hands.');
        }
      } else {
        verdict = 'acceptable';
        better = `Bet ${fmt(Math.round(pot * 0.5))} (1/2 pot)`;
        bullets.push('- Top pair is usually a value bet of 1/2–2/3 pot; checking is pot control.');
      }
    } else if (firstFlopAction && isPfr && players === 2 && !tex.wet) {
      if (aggressive) verdict = betFrac <= 0.5 ? 'correct' : 'acceptable';
      else {
        verdict = 'acceptable';
        leaks.push('CB-MISS');
        better = `Bet ${fmt(Math.max(s.bb, Math.round(pot / 3)))} (1/3 pot)`;
        bullets.push('- As the preflop raiser heads-up on a dry board, c-bet 1/3 pot with almost your whole range (rule 2).');
      }
      if (aggressive && betFrac > 0.5) bullets.push('- On a dry board heads-up 1/3 pot does the same job for less.');
    } else if (st.bucket === 'strong_draw' && aggressive) {
      verdict = 'correct';
      bullets.push('- Semi-bluffing a strong draw wins the pot now or improves later (rule 12).');
    } else if (aggressive) {
      const bluff = st.bucket === 'nothing' || st.bucket === 'weak_draw';
      verdict = bluff && (players > 2 || tex.wet) ? 'wrong' : 'acceptable';
      if (bluff && (players > 2 || tex.wet)) {
        leaks.push('CB-WET');
        better = 'Check';
        bullets.push('- Low and connected or multiway: check more, bluff less (rule 1).');
      }
      if (bluff && s.street === 'river') bullets.push('- River test: will worse hands call or better hands fold? If neither, check (rule 9).');
    } else {
      verdict = 'correct';
    }
  }

  // Stack-to-pot: a big non-all-in bet that leaves less than the pot behind.
  if (aggressive && !a.allIn) {
    const committed = (a.amount ?? 0) - hero.streetBet;
    const behind = hero.stack - committed;
    if (behind > 0 && behind < pot + committed && spr < 1.5) {
      leaks.push('STACK');
      if (verdict === 'correct') verdict = 'acceptable';
      bullets.push(`- Stack-to-pot is ${spr.toFixed(1)}: the only sensible sizes are check or all-in.`);
    }
  }

  if (bullets.length < 2) bullets.push('- The coach will add detail on this spot.');
  const headline = `${VERB[verdict]}: ${word}.${price !== null ? ` Price ${pct(price)}%` : ''}${outs >= 4 ? `${price !== null ? ',' : ''} ${outs} outs` : ''}${price !== null || outs >= 4 ? '.' : ''}`;
  return reply({
    action_verdict: verdict,
    headline,
    better_play: verdict === 'correct' ? null : better,
    explanation: bullets.join('\n'),
    numbers:
      price !== null || outs >= 4
        ? {
            price_pct: price !== null ? pct(price) : null,
            outs: outs >= 4 ? outs : null,
            hit_pct_next_card: outs >= 4 ? pct(hitNext) : null,
            hit_pct_two_cards: outs >= 4 && hitTwo !== null ? pct(hitTwo) : null,
          }
        : null,
    leaks: [...new Set(leaks)],
  });
}
