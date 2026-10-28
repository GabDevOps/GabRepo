import { quickCheck } from '../src/coach/quickCheck';
import { act, GameState, newHand, PlayerInput } from '../src/engine/table';
import { parseCards, fullDeck, cardToString, Card } from '../src/engine/cards';

/** Hand with the hero (seat 0) holding `hero` and the given board; button on `button`. */
function hand(hero: string, board: string, button: number): GameState {
  const h = parseCards(hero);
  const b = parseCards(board);
  const used = new Set([...h, ...b].map(cardToString));
  const rest = fullDeck().filter((c) => !used.has(cardToString(c)));
  const order = [1, 2, 3, 4, 5, 0].map((k) => (button + k) % 6);
  const deck: Card[] = [];
  for (let r = 0; r < 2; r++) for (const seat of order) deck.push(seat === 0 ? h[r] : rest.shift()!);
  return newHand({ id: 1, sb: 2, bb: 5, stacks: Array(6).fill(500), heroSeat: 0, buttonSeat: button, styles: Array(5).fill('tag'), deck: [...deck, ...b, ...rest] });
}

function heroMove(s: GameState, input: PlayerInput) {
  const next = act(s, input);
  return quickCheck(s, next.actions[s.actions.length]);
}

const foldTo = (s: GameState, seat: number) => {
  while (s.toAct !== seat) s = act(s, { type: 'fold' });
  return s;
};

describe('quick check', () => {
  it('grades preflop against the rule book', () => {
    // Button on seat 1 → hero (seat 0) is CO.
    let s = foldTo(hand('As 5s', '', 1), 0);
    expect(s.players[0].position).toBe('CO');
    const ok = heroMove(s, { type: 'raise', amount: 15 });
    expect(ok.action_verdict).toBe('correct');
    expect(ok.explanation).toContain('Rule book');

    s = foldTo(hand('7c 2d', '', 1), 0);
    const limp = heroMove(s, { type: 'call' });
    expect(limp.action_verdict).toBe('wrong');
    expect(limp.leaks).toContain('PF-LIMP');

    s = foldTo(hand('Kh Qh', '', 1), 0);
    const folded = heroMove(s, { type: 'fold' });
    expect(folded.action_verdict).toBe('wrong');
    expect(folded.leaks).toContain('PF-TIGHT');
    expect(folded.better_play).toContain('Raise to');
  });

  it('flags folding a flush draw with the right price', () => {
    // Hero BTN (button 0) with a nut flush draw; flop K♠ 9♦ 4♠ after a heads-up preflop.
    let s = hand('As 5s', 'Ks 9d 4s 7h 2c', 0);
    s = foldTo(s, 0);
    s = act(s, { type: 'raise', amount: 15 }); // hero opens BTN
    s = act(s, { type: 'fold' }); // SB
    s = act(s, { type: 'call' }); // BB
    expect(s.street).toBe('flop');
    s = act(s, { type: 'bet', amount: 10 }); // BB bets 1/3 pot
    const r = heroMove(s, { type: 'fold' });
    expect(r.action_verdict).toBe('wrong');
    expect(r.leaks).toContain('ODDS-FOLD');
    expect(r.numbers?.outs).toBe(9);
    expect(r.numbers?.price_pct).toBeCloseTo(19.2, 1);
  });

  it('flags a missed c-bet on a dry board heads-up', () => {
    let s = hand('Ah Qd', 'Kc 7s 2d 9h 3c', 0);
    s = foldTo(s, 0);
    s = act(s, { type: 'raise', amount: 15 });
    s = act(s, { type: 'fold' });
    s = act(s, { type: 'call' });
    s = act(s, { type: 'check' }); // BB checks to the raiser
    const r = heroMove(s, { type: 'check' });
    expect(r.leaks).toContain('CB-MISS');
    expect(r.better_play).toContain('1/3 pot');
  });
});
