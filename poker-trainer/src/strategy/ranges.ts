/**
 * Single source of truth for the hero's rule book (spec section 6) and the leak taxonomy (7.4).
 * The range chart, the preflop drill grading, the bots and the coach prompt all read from here.
 */
import { Card, RANKS, rankValue } from '../engine/cards';
import type { Position } from '../engine/table';

export type Tier = 'green' | 'blue' | 'orange' | 'fold';
export type Outline = 'red' | 'yellow' | 'black';

const list = (s: string) => s.trim().split(/\s+/);

export const TIER_HANDS: Record<Exclude<Tier, 'fold'>, string[]> = {
  green: list('AA KK QQ JJ TT 99 88 77 AKs AQs AJs KQs KJs QJs AKo AQo KQo'),
  blue: list('ATs A9s A8s KTs K9s QTs Q9s JTs J9s T9s 98s 87s 76s 66 55 44 33 22 AJo'),
  orange: list(
    'A7s A6s A5s A4s A3s A2s K8s K7s K6s K5s Q8s Q7s J8s J7s T8s T7s 97s 96s 86s 75s 65s 54s 43s KJo QJo ATo',
  ),
};

export const OUTLINE_HANDS: Record<Outline, string[]> = {
  red: list('AA KK QQ JJ TT 99 88 77 66 55 44 33 22 AKs AQs AJs AKo KQs KJs QJs T9s 98s 87s'),
  yellow: list('AQo KQo ATs A9s A8s A7s A6s A5s A4s A3s A2s KTs QTs JTs'),
  black: list('AJo KJo QJo ATo'),
};

/** "AK" means both AKs and AKo. */
const expand = (hands: string[]) => hands.flatMap((h) => (h.length === 2 && h[0] !== h[1] ? [h + 's', h + 'o'] : [h]));

export const THREE_BET = {
  vsEarly: expand(list('AA KK QQ AK')),
  vsLate: expand(list('AA KK QQ JJ TT AK AQ KQs AJs')),
};

export const FACING_3BET = {
  fourBet: list('AA KK'),
  fourBetOrCall: expand(list('QQ AK')),
  callInPosition: list('JJ TT AQs KQs'),
};

export const FACING_4BET = {
  shove: list('AA KK'),
  call: expand(list('QQ AK')),
};

export const OPEN_TIERS: Record<Position, Tier[]> = {
  UTG: ['green', 'blue'],
  HJ: ['green', 'blue'],
  CO: ['green', 'blue', 'orange'],
  BTN: ['green', 'blue', 'orange'],
  SB: ['green', 'blue', 'orange'],
  BB: [],
};

export const EARLY: Position[] = ['UTG', 'HJ'];
export const isLateRaiser = (p: Position) => p === 'CO' || p === 'BTN' || p === 'SB';

export const COLORS = {
  green: '#5DBE8A',
  blue: '#7AB4F5',
  orange: '#F5A05A',
  fold: '#D9C7F2',
  red: '#D93636',
  yellow: '#E8C21A',
  black: '#111111',
};

/** Hand label for two hole cards: "AKs", "77", "QJo". */
export function handLabel(cards: Card[]): string {
  const [a, b] = [...cards].sort((x, y) => rankValue(y.rank) - rankValue(x.rank));
  if (a.rank === b.rank) return a.rank + b.rank;
  return a.rank + b.rank + (a.suit === b.suit ? 's' : 'o');
}

/** Label for the chart cell at (row, col): suited above the diagonal, offsuit below. */
export function cellLabel(row: number, col: number): string {
  const r = RANKS[row];
  const c = RANKS[col];
  if (row === col) return r + c;
  return row < col ? r + c + 's' : c + r + 'o';
}

const tierMap = new Map<string, Tier>();
for (const t of ['green', 'blue', 'orange'] as const) for (const h of TIER_HANDS[t]) tierMap.set(h, t);
const outlineMap = new Map<string, Outline>();
for (const o of ['red', 'yellow', 'black'] as const) for (const h of OUTLINE_HANDS[o]) outlineMap.set(h, o);

export function tierOf(label: string): Tier {
  return tierMap.get(label) ?? 'fold';
}

export function outlineOf(label: string): Outline | null {
  return outlineMap.get(label) ?? null;
}

export function allLabels(): string[] {
  const out: string[] = [];
  for (let r = 0; r < 13; r++) for (let c = 0; c < 13; c++) out.push(cellLabel(r, c));
  return out;
}

export const isPair = (l: string) => l.length === 2;
export const isSuited = (l: string) => l.endsWith('s');
export const isSmallPair = (l: string) => isPair(l) && rankValue(l[0] as Card['rank']) <= 6;
export const isSuitedAce = (l: string) => isSuited(l) && l[0] === 'A';
export const isSuitedConnector = (l: string) =>
  isSuited(l) && rankValue(l[0] as Card['rank']) - rankValue(l[1] as Card['rank']) === 1;

/* ---------------------------------------------------------------------------------------------
 * Text versions (embedded in the coach prompt and shown under the chart).
 * ------------------------------------------------------------------------------------------- */

export const SIZES_TEXT = `- Open: 3 BB. With limpers: 3 BB + 1 BB per limper.
- Never limp. Never min-raise.
- Continuation bet, dry board, heads-up: 1/3 pot.
- Value bet when the opponent has shown a hand (called once or more): 1/2 to 2/3 pot.
- Wet/coordinated board with a strong hand: 2/3 to pot.
- Multiway: bigger (1/2+) and less often.
- Always check stack-to-pot before turn/river bets: if the pot is larger than the remaining stack, the only sensible sizes are check or all-in.`;

export const POSTFLOP_TEXT = `1. High and dry, bet more. Low and connected, check more. Multiway, slow down.
2. As the preflop raiser heads-up on a dry board, bet 1/3 pot with almost the whole range, including misses with backup (overcards, backdoor draws).
3. Stop bluffing once the opponent has called and the hand has nothing to improve to.
4. Strong hand + wet board = bet, regardless of who raised preflop. "Check to the raiser" is for medium hands and air, not for sets/two pair/nut straights.
5. Facing a bet: think about your own two cards and the price, not your range.
6. Pot odds: price = call ÷ (pot + call). Call if chance of winning > price. Always add your call to the pot before dividing; do not round the bet up.
7. Outs to %: outs × 2 for one card to come, outs × 4 for two. Open-ended straight draw = 8 outs, flush draw = 9, both = 15. A straight needs five consecutive cards; a flush needs five of a suit (count carefully).
8. Combos: pocket pair 6, suited hand 4, offsuit hand 12, any two ranks 16. Remove combos blocked by visible cards. Use this to weigh "what beats me" vs "what I beat" rather than counting hand types.
9. River test before betting: will worse hands call, or will better hands fold? If neither, check.
10. Third bet with a medium hand (top pair, medium kicker) against a player who called twice: size down (1/4–1/3) or check.
11. A raise from a passive player (limper/caller) means strength. One pair is not a hand to put 100 BB in after the flop.
12. Draws: call a bet ≤ 1/2 pot with an 8–9-out draw; fold to pot-size bets unless you also have a pair/overcards. Prefer semi-bluffing (betting) with draws when you have position or the initiative.
13. Before every decision say three things: my hand, the draws on the board, how many cards are left. And read the opponent's last action (limp vs raise; bet vs check) before choosing.`;

export const OUTLINE_RULES: Record<Outline, string> = {
  red: 'Continue against a raise from any seat (call or 3-bet per 6.3).',
  yellow: 'Continue only against a late raiser (CO, BTN). Fold vs UTG/HJ.',
  black: 'Continue only against a late raiser, and only from BTN or BB. Fold from SB and vs early raisers.',
};

export const TIER_RULES: Record<Tier, string> = {
  green: 'Premium: open from every seat.',
  blue: 'Middle: open from UTG, HJ and later (added to green).',
  orange: 'Late: open from CO, BTN and SB (added to green + blue).',
  fold: 'Fold when nobody has raised yet.',
};

const j = (a: string[]) => a.join(' ');

export function rulebookText(): string {
  return `6.1 OPENING CHART (nobody has raised yet)
At a 6-max table the first seat (UTG) plays the blue range.
- UTG, HJ: GREEN + BLUE
- CO, BTN: GREEN + BLUE + ORANGE
- SB (folded to): same as BTN
- BB (no raise): check
GREEN (premium / early): ${j(TIER_HANDS.green)}
BLUE (middle, added to green): ${j(TIER_HANDS.blue)}
ORANGE (late, added to green + blue): ${j(TIER_HANDS.orange)}
Everything else: fold. "s" = suited; "o" = offsuit. Offsuit broadways other than AKo/AQo/KQo/AJo/KJo/QJo/ATo are folds everywhere.

6.2 CONTINUING AFTER SOMEONE RAISED (outline colours)
- RED: ${j(OUTLINE_HANDS.red)} — ${OUTLINE_RULES.red}
- YELLOW: ${j(OUTLINE_HANDS.yellow)} — ${OUTLINE_RULES.yellow}
- BLACK: ${j(OUTLINE_HANDS.black)} — ${OUTLINE_RULES.black}
Small pairs (22–66) vs a raise: call only when cheap (≤ 3.5 BB to call) and at least one other player is in or likely to come in; fold vs large raises or after a 3-bet.
Small blind: default is 3-bet or fold; calling from the SB is reserved for red hands at a cheap price in multiway pots.
Big blind: can call wider than the chart (any red/yellow/black hand vs any raise size ≤ 3 BB, plus suited connectors and suited aces) because of the discount.

6.3 3-BET, 4-BET, AND FACING A 3-BET
- 3-bet vs early raiser (UTG/HJ): ${j(THREE_BET.vsEarly)} — size 3× the raise in position; 4× from the blinds.
- 3-bet vs late raiser (CO/BTN): ${j(THREE_BET.vsLate)} — same sizes.
- Facing a 3-bet after you raised: AA KK → 4-bet · QQ AK → 4-bet or call · JJ TT AQs KQs → call in position only · everything else → fold. 4-bet = 2.2–2.5× the 3-bet.
- Facing a 4-bet after you 3-bet: AA KK → 5-bet / all-in · QQ AK → call · rest → fold.

6.4 SIZES
${SIZES_TEXT}

6.5 POSTFLOP RULES OF THUMB
${POSTFLOP_TEXT}`;
}

export const LEAKS: { code: string; text: string }[] = [
  { code: 'PF-LIMP', text: 'Limping / min-raising' },
  { code: 'PF-LOOSE', text: 'Entering with a hand outside the chart for the seat/situation' },
  { code: 'PF-TIGHT', text: 'Folding a chart hand (incl. folding to 3-bets with the continue list)' },
  { code: 'PF-NO3B', text: 'Calling with a 3-bet-list hand instead of 3-betting' },
  { code: 'PF-BAD3B', text: '3-betting / 4-betting with hands not on the list (e.g. small pairs, AJs vs 3-bet)' },
  { code: 'PF-SIZE', text: 'Wrong open / 3-bet / 4-bet size' },
  { code: 'CB-MISS', text: 'Not c-betting a dry board heads-up as the raiser' },
  { code: 'CB-WET', text: 'Barrelling with nothing on wet / multiway boards' },
  { code: 'VAL-THIN', text: 'Checking or betting too small with a strong hand (value left behind)' },
  { code: 'VAL-OVER', text: 'Betting too big / raising with a medium hand (turning it into a bluff)' },
  { code: 'STACK', text: 'Ignoring stack-to-pot when sizing' },
  { code: 'ODDS-MATH', text: 'Price or outs miscalculated (not adding the call, rounding, rule of 2/4)' },
  { code: 'ODDS-FOLD', text: 'Folding a draw or a made hand that had the right price' },
  { code: 'ODDS-CALL', text: 'Calling without the price' },
  { code: 'READ-HAND', text: 'Misreading own hand/board (draw vs made, straight/flush counting)' },
  { code: 'READ-ACTION', text: 'Choosing an action not available (check facing a bet) or misreading limp vs raise' },
  { code: 'READ-RANGE', text: 'Range read wrong (e.g. "BB called so he\'s strong", counting hand types instead of combos)' },
  { code: 'SLOWPLAY', text: 'Slow-playing a monster on a wet board' },
  { code: 'STACKOFF', text: "Putting a stack in with one pair after the flop against a passive player's raise" },
];

export function leaksText(): string {
  return LEAKS.map((l) => `${l.code}: ${l.text}`).join('\n');
}
