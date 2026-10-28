import { newHand, act, legalActions, potTotal, GameState, seatAt, heroNet } from '../src/engine/table';
import { parseCards, fullDeck, cardToString } from '../src/engine/cards';

/** Deck whose first 12 cards deal hole cards left of the button, then board. */
function rig(holes: Record<number, string>, board: string, button = 0): ReturnType<typeof parseCards> {
  const order = [1, 2, 3, 4, 5, 0].map((k) => (button + k) % 6);
  const used = new Set<string>();
  const hc: Record<number, ReturnType<typeof parseCards>> = {};
  for (const seat of order) {
    hc[seat] = parseCards(holes[seat] ?? '');
    hc[seat].forEach((c) => used.add(cardToString(c)));
  }
  const b = parseCards(board);
  b.forEach((c) => used.add(cardToString(c)));
  const rest = fullDeck().filter((c) => !used.has(cardToString(c)));
  const deck = [] as ReturnType<typeof parseCards>;
  for (let r = 0; r < 2; r++) for (const seat of order) deck.push(hc[seat][r] ?? rest.shift()!);
  return [...deck, ...b, ...rest];
}

const base = (deck?: ReturnType<typeof parseCards>, stacks = [500, 500, 500, 500, 500, 500]) =>
  newHand({ id: 1, sb: 2, bb: 5, stacks, buttonSeat: 0, heroSeat: 0, styles: ['tag', 'tag', 'tag', 'tag', 'tag'], deck });

function foldAround(s: GameState, n: number) {
  for (let i = 0; i < n; i++) s = act(s, { type: 'fold' });
  return s;
}

describe('table', () => {
  it('posts blinds, assigns positions and starts at UTG', () => {
    const s = base();
    expect(s.players[0].position).toBe('BTN');
    expect(s.players[1].position).toBe('SB');
    expect(s.players[3].position).toBe('UTG');
    expect(potTotal(s)).toBe(7);
    expect(s.toAct).toBe(seatAt(s, 'UTG'));
  });

  it('enforces min raise and legal actions', () => {
    let s = base();
    const l = legalActions(s);
    expect(l.check).toBe(false);
    expect(l.call).toBe(5);
    expect(l.raise!.min).toBe(10);
    s = act(s, { type: 'raise', amount: 15 }); // UTG to 15 (raise by 10)
    expect(legalActions(s).raise!.min).toBe(25);
    s = act(s, { type: 'raise', amount: 12 }); // clamped up to min
    expect(s.currentBet).toBe(25);
  });

  it('walks to the BB and refunds uncalled bet', () => {
    let s = base();
    s = act(s, { type: 'raise', amount: 15 }); // UTG
    s = foldAround(s, 5);
    expect(s.handOver).toBe(true);
    expect(s.players[3].stack).toBe(500 + 7);
    expect(s.uncalled).toEqual({ seat: 3, amount: 10 });
  });

  it('BB gets an option after limps and streets advance', () => {
    let s = base();
    s = foldAround(s, 3); // UTG HJ CO
    s = act(s, { type: 'call' }); // BTN
    s = act(s, { type: 'call' }); // SB
    expect(s.toAct).toBe(2);
    expect(legalActions(s).check).toBe(true);
    s = act(s, { type: 'check' });
    expect(s.street).toBe('flop');
    expect(s.board.length).toBe(3);
    expect(s.toAct).toBe(1); // SB first postflop
    expect(potTotal(s)).toBe(15);
  });

  it('handles all-in with unequal stacks and side pots', () => {
    const deck = rig({ 3: 'As Ad', 4: 'Ks Kd', 5: 'Qs Qd' }, '2c 7h 9d 3s 4c');
    let s = base(deck, [500, 500, 500, 100, 300, 500]);
    s = act(s, { type: 'allin' }); // UTG 100
    s = act(s, { type: 'allin' }); // HJ 300
    s = act(s, { type: 'allin' }); // CO 500
    s = foldAround(s, 3); // BTN SB BB
    expect(s.handOver).toBe(true);
    // Main pot: 100*3 + 2 + 5 = 307 to AA; side pot 200*2 = 400 to KK; CO refunded 200.
    expect(s.players[3].stack).toBe(307);
    expect(s.players[4].stack).toBe(400);
    expect(s.players[5].stack).toBe(200);
    const total = s.players.reduce((t, p) => t + p.stack, 0);
    expect(total).toBe(2400);
  });

  it('splits pots on ties and tracks hero net', () => {
    const deck = rig({ 0: 'Ah 2d', 2: 'Ac 3d' }, 'Ks Qs Js Ts 5c');
    let s = base(deck);
    s = foldAround(s, 3);
    s = act(s, { type: 'raise', amount: 15 }); // hero BTN
    s = act(s, { type: 'fold' }); // SB
    s = act(s, { type: 'call' }); // BB
    while (!s.handOver) s = act(s, { type: 'check' });
    expect(s.showdown).toBe(true);
    expect(heroNet(s)).toBe(1); // 32 pot split 16/16 → hero +1
  });

  it('does not let a player raise when everyone else is all-in', () => {
    let s = base(undefined, [500, 500, 500, 100, 500, 500]);
    s = act(s, { type: 'allin' });
    s = foldAround(s, 4); // HJ CO BTN SB
    const l = legalActions(s);
    expect(l.raise).toBeNull();
    expect(l.call).toBe(95);
  });
});
