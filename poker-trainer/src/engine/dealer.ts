import { act, GameState, NewHandOptions, newHand, PlayerInput } from './table';
import { decide, randomStyles, chen, Rng } from '../bots/bot';
import { recommend, situationFromState } from '../strategy/preflopAdvisor';
import { handLabel, isPair, isSuitedAce, isSuitedConnector, outlineOf, tierOf } from '../strategy/ranges';

export type Deal = {
  /** State at the start of the hand (blinds posted). */
  state: GameState;
  /** Bot moves up to the hero's first decision, replayed on screen in this order. */
  script: PlayerInput[];
  kind: SpotKind;
};

/** continue: the rule book plays the hand; borderline: a fold worth thinking about; trivial: an obvious fold; walk: hero never acts. */
export type SpotKind = 'continue' | 'borderline' | 'trivial' | 'walk';

/** Share of dealt spots where the rule book continues; the rest are borderline folds. */
export const CONTINUE_SHARE = 0.75;
const MAX_TRIES = 400;

/** Classify the hero's first preflop spot. */
export function classifySpot(s: GameState): SpotKind {
  if (s.handOver || s.toAct !== s.heroSeat) return 'walk';
  const rec = recommend(situationFromState(s, s.heroSeat));
  if (rec.action !== 'fold') return 'continue';
  const hero = s.players[s.heroSeat];
  const label = handLabel(hero.cards);
  const nearRange =
    tierOf(label) !== 'fold' || outlineOf(label) !== null || isPair(label) || isSuitedAce(label) || isSuitedConnector(label) || chen(hero.cards) >= 6;
  return nearRange ? 'borderline' : 'trivial';
}

/** Run the bots until it is the hero's turn (or the hand ends), recording their moves. */
export function playToHero(start: GameState, rng: Rng = Math.random): { state: GameState; script: PlayerInput[] } {
  let s = start;
  const script: PlayerInput[] = [];
  while (!s.handOver && s.toAct !== s.heroSeat) {
    const input = decide(s, s.toAct!, rng);
    script.push(input);
    s = act(s, input);
  }
  return { state: s, script };
}

/**
 * Deal a hand. With `interesting`, re-deal until the hero faces a real decision:
 * no walks, no obvious folds, and about 3 in 4 spots where the hand should be played.
 */
export function dealHand(o: Omit<NewHandOptions, 'styles'> & { interesting: boolean; rng?: Rng }): Deal {
  const rng = o.rng ?? Math.random;
  const wantContinue = rng() < CONTINUE_SHARE;
  let fallback: Deal | null = null;
  for (let i = 0; i < MAX_TRIES; i++) {
    const state = newHand({ ...o, styles: randomStyles(5, rng) });
    const { state: atHero, script } = playToHero(state, rng);
    const kind = classifySpot(atHero);
    const deal = { state, script, kind };
    if (!o.interesting) return deal;
    if (kind === 'walk' || kind === 'trivial') continue;
    if ((kind === 'continue') === wantContinue) return deal;
    fallback ??= deal;
  }
  if (fallback) return fallback;
  const state = newHand({ ...o, styles: randomStyles(5, rng) });
  return { state, script: [], kind: 'continue' };
}
