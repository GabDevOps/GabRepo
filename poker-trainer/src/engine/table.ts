import { Card, shuffledDeck, randomInt } from './cards';
import { evaluate, HandValue } from './evaluator';

/** All money is in integer cents to avoid float drift. */
export type Position = 'BTN' | 'SB' | 'BB' | 'UTG' | 'HJ' | 'CO';
/** Clockwise from the button. */
export const POSITION_ORDER: Position[] = ['BTN', 'SB', 'BB', 'UTG', 'HJ', 'CO'];
export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type BotStyle = 'limper' | 'tag' | 'lag';

export type ActionType = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin' | 'post_sb' | 'post_bb';

export type Action = {
  seat: number;
  type: ActionType;
  /** call: chips added; bet: bet size; raise: total "to" amount; posts: blind size. */
  amount?: number;
  /** raise only: increment over the previous bet. */
  raiseBy?: number;
  allIn?: boolean;
  street: Street;
};

export type PlayerInput = { type: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'; amount?: number };

export type Player = {
  seat: number;
  name: string;
  position: Position;
  isHero: boolean;
  style?: BotStyle;
  startStack: number;
  stack: number;
  cards: Card[];
  folded: boolean;
  allIn: boolean;
  streetBet: number;
  totalBet: number;
  acted: boolean;
};

export type Winner = { seat: number; amount: number; hand?: HandValue };

export type GameState = {
  id: number;
  sb: number;
  bb: number;
  players: Player[];
  heroSeat: number;
  buttonSeat: number;
  deck: Card[];
  board: Card[];
  street: Street;
  currentBet: number;
  minRaise: number;
  /** Bets + raises on the current street (preflop counts the BB as the first bet). */
  raisesThisStreet: number;
  toAct: number | null;
  actions: Action[];
  preflopAggressor: number | null;
  lastAggressor: number | null;
  handOver: boolean;
  showdown: boolean;
  winners: Winner[];
  /** Refunded uncalled bet, if any. */
  uncalled?: { seat: number; amount: number };
};

export const SEATS = 6;

export type NewHandOptions = {
  id: number;
  sb: number;
  bb: number;
  stacks: number[];
  heroSeat?: number;
  buttonSeat?: number;
  styles: BotStyle[];
  deck?: Card[];
};

export function newHand(o: NewHandOptions): GameState {
  const heroSeat = o.heroSeat ?? 0;
  const buttonSeat = o.buttonSeat ?? randomInt(SEATS);
  const deck = o.deck ? [...o.deck] : shuffledDeck();
  let villain = 0;
  const players: Player[] = [];
  for (let seat = 0; seat < SEATS; seat++) {
    const isHero = seat === heroSeat;
    players.push({
      seat,
      name: isHero ? 'You' : `Villain ${++villain}`,
      position: POSITION_ORDER[(seat - buttonSeat + SEATS) % SEATS],
      isHero,
      style: isHero ? undefined : o.styles[villain - 1],
      startStack: o.stacks[seat],
      stack: o.stacks[seat],
      cards: [],
      folded: false,
      allIn: false,
      streetBet: 0,
      totalBet: 0,
      acted: false,
    });
  }
  // Deal two cards each, starting left of the button.
  for (let r = 0; r < 2; r++)
    for (let k = 1; k <= SEATS; k++) players[(buttonSeat + k) % SEATS].cards.push(deck.shift()!);

  const s: GameState = {
    id: o.id,
    sb: o.sb,
    bb: o.bb,
    players,
    heroSeat,
    buttonSeat,
    deck,
    board: [],
    street: 'preflop',
    currentBet: 0,
    minRaise: o.bb,
    raisesThisStreet: 1,
    toAct: null,
    actions: [],
    preflopAggressor: null,
    lastAggressor: null,
    handOver: false,
    showdown: false,
    winners: [],
  };
  post(s, seatAt(s, 'SB'), o.sb, 'post_sb');
  post(s, seatAt(s, 'BB'), o.bb, 'post_bb');
  s.currentBet = o.bb;
  s.toAct = nextToAct(s, seatAt(s, 'BB'));
  if (s.toAct === null) finishRound(s);
  return s;
}

function post(s: GameState, seat: number, amount: number, type: 'post_sb' | 'post_bb') {
  const p = s.players[seat];
  const a = Math.min(amount, p.stack);
  commit(p, a);
  s.actions.push({ seat, type, amount: a, street: 'preflop', allIn: p.allIn || undefined });
}

function commit(p: Player, amount: number) {
  p.stack -= amount;
  p.streetBet += amount;
  p.totalBet += amount;
  if (p.stack === 0) p.allIn = true;
}

export function seatAt(s: GameState, pos: Position): number {
  return s.players.find((p) => p.position === pos)!.seat;
}

export function potTotal(s: GameState): number {
  return s.players.reduce((t, p) => t + p.totalBet, 0);
}

export function potBeforeStreet(s: GameState): number {
  return s.players.reduce((t, p) => t + p.totalBet - p.streetBet, 0);
}

export function livePlayers(s: GameState): Player[] {
  return s.players.filter((p) => !p.folded);
}

function canAct(p: Player) {
  return !p.folded && !p.allIn;
}

export type Legal = {
  fold: boolean;
  check: boolean;
  call: number | null; // chips to add
  bet: { min: number; max: number } | null; // bet size
  raise: { min: number; max: number } | null; // raise-to amounts
  allin: number; // total chips the player can still put in
  toCall: number;
};

export function legalActions(s: GameState, seat = s.toAct!): Legal {
  const p = s.players[seat];
  const toCall = Math.max(0, s.currentBet - p.streetBet);
  const maxTo = p.streetBet + p.stack;
  const legal: Legal = {
    fold: toCall > 0,
    check: toCall === 0,
    call: toCall > 0 ? Math.min(toCall, p.stack) : null,
    bet: null,
    raise: null,
    allin: p.stack,
    toCall,
  };
  if (s.currentBet === 0 && p.stack > 0) legal.bet = { min: Math.min(s.bb, p.stack), max: p.stack };
  if (s.currentBet > 0 && p.stack > toCall) {
    // Nobody left to raise against if every other live player is all-in.
    const othersCanAct = s.players.some((o) => o.seat !== seat && canAct(o));
    if (othersCanAct) legal.raise = { min: Math.min(s.currentBet + s.minRaise, maxTo), max: maxTo };
  }
  return legal;
}

/** Apply the acting player's move. Returns a new state (input is not mutated). */
export function act(state: GameState, input: PlayerInput): GameState {
  if (state.handOver || state.toAct === null) throw new Error('No player to act');
  const s = structuredClone(state);
  const seat = s.toAct!;
  const p = s.players[seat];
  const legal = legalActions(s, seat);
  const street = s.street;
  let { type } = input;

  if (type === 'allin') {
    const to = p.streetBet + p.stack;
    if (to <= s.currentBet) type = 'call';
    else if (s.currentBet === 0) type = 'bet';
    else type = 'raise';
    input = { type, amount: type === 'bet' ? p.stack : to };
  }

  switch (type) {
    case 'fold':
      if (!legal.fold) throw new Error('Fold not available (check instead)');
      p.folded = true;
      s.actions.push({ seat, type: 'fold', street });
      break;
    case 'check':
      if (!legal.check) throw new Error('Check not available facing a bet');
      s.actions.push({ seat, type: 'check', street });
      break;
    case 'call': {
      if (legal.call === null) throw new Error('Nothing to call');
      commit(p, legal.call);
      s.actions.push({ seat, type: 'call', amount: legal.call, street, allIn: p.allIn || undefined });
      break;
    }
    case 'bet': {
      if (!legal.bet) throw new Error('Bet not available');
      const amt = clamp(Math.round(input.amount ?? 0), legal.bet.min, legal.bet.max);
      commit(p, amt);
      registerRaise(s, seat, amt);
      s.actions.push({ seat, type: 'bet', amount: amt, street, allIn: p.allIn || undefined });
      break;
    }
    case 'raise': {
      if (!legal.raise) {
        if (legal.call !== null) return act(state, { type: 'call' });
        throw new Error('Raise not available');
      }
      const to = clamp(Math.round(input.amount ?? 0), legal.raise.min, legal.raise.max);
      const by = to - s.currentBet;
      commit(p, to - p.streetBet);
      registerRaise(s, seat, to);
      s.actions.push({ seat, type: 'raise', amount: to, raiseBy: by, street, allIn: p.allIn || undefined });
      break;
    }
  }
  p.acted = true;

  if (livePlayers(s).length === 1) {
    refundUncalled(s);
    award(s);
    return s;
  }
  const next = nextToAct(s, seat);
  if (next === null) finishRound(s);
  else s.toAct = next;
  return s;
}

function registerRaise(s: GameState, seat: number, to: number) {
  const by = to - s.currentBet;
  if (by >= s.minRaise) {
    s.minRaise = by;
    // A full raise reopens the action for everyone else.
    for (const o of s.players) if (o.seat !== seat) o.acted = false;
  }
  s.currentBet = to;
  s.raisesThisStreet++;
  s.lastAggressor = seat;
  if (s.street === 'preflop') s.preflopAggressor = seat;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Next seat clockwise after `from` that still has to act this round, or null if the round is closed. */
function nextToAct(s: GameState, from: number): number | null {
  for (let k = 1; k <= SEATS; k++) {
    const p = s.players[(from + k) % SEATS];
    if (!canAct(p)) continue;
    if (!p.acted || p.streetBet < s.currentBet) {
      // A lone player with nothing to call and nobody to play against doesn't need to act.
      const others = s.players.filter((o) => o.seat !== p.seat && canAct(o)).length;
      if (others === 0 && p.streetBet >= s.currentBet) continue;
      return p.seat;
    }
  }
  return null;
}

function refundUncalled(s: GameState) {
  const sorted = [...s.players].sort((a, b) => b.streetBet - a.streetBet);
  const excess = sorted[0].streetBet - (sorted[1]?.streetBet ?? 0);
  if (excess > 0) {
    const p = sorted[0];
    p.stack += excess;
    p.streetBet -= excess;
    p.totalBet -= excess;
    if (p.stack > 0) p.allIn = false;
    s.uncalled = { seat: p.seat, amount: excess };
  }
}

const NEXT_STREET: Record<Street, Street> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
  showdown: 'showdown',
};

function finishRound(s: GameState) {
  refundUncalled(s);
  for (;;) {
    s.street = NEXT_STREET[s.street];
    for (const p of s.players) {
      p.streetBet = 0;
      p.acted = false;
    }
    s.currentBet = 0;
    s.minRaise = s.bb;
    s.raisesThisStreet = 0;
    s.lastAggressor = null;
    if (s.street === 'showdown') {
      s.toAct = null;
      award(s);
      return;
    }
    const n = s.street === 'flop' ? 3 : 1;
    for (let i = 0; i < n; i++) s.board.push(s.deck.shift()!);
    const first = nextToAct(s, s.buttonSeat);
    if (first !== null) {
      s.toAct = first;
      return;
    }
    // Nobody can act (all-in): keep dealing.
  }
}

function award(s: GameState) {
  s.handOver = true;
  s.toAct = null;
  const live = livePlayers(s);
  const total = potTotal(s);
  if (live.length === 1) {
    live[0].stack += total;
    s.winners = [{ seat: live[0].seat, amount: total }];
    return;
  }
  s.showdown = true;
  s.street = 'showdown';
  while (s.board.length < 5) s.board.push(s.deck.shift()!);
  const values = new Map<number, HandValue>();
  for (const p of live) values.set(p.seat, evaluate([...p.cards, ...s.board]));

  const levels = [...new Set(live.map((p) => p.totalBet))].sort((a, b) => a - b);
  const won = new Map<number, number>();
  let prev = 0;
  let distributed = 0;
  let lastWinners: number[] = [];
  for (const level of levels) {
    let amount = 0;
    for (const p of s.players) amount += Math.min(p.totalBet, level) - Math.min(p.totalBet, prev);
    const eligible = live.filter((p) => p.totalBet >= level);
    const best = Math.max(...eligible.map((p) => values.get(p.seat)!.score));
    const winners = orderFromButton(s, eligible.filter((p) => values.get(p.seat)!.score === best).map((p) => p.seat));
    split(won, winners, amount);
    distributed += amount;
    lastWinners = winners;
    prev = level;
  }
  if (total > distributed) split(won, lastWinners, total - distributed);
  s.winners = [...won.entries()].map(([seat, amount]) => ({ seat, amount, hand: values.get(seat) }));
  for (const w of s.winners) s.players[w.seat].stack += w.amount;
}

function split(won: Map<number, number>, seats: number[], amount: number) {
  const share = Math.floor(amount / seats.length);
  let rem = amount - share * seats.length;
  for (const seat of seats) {
    won.set(seat, (won.get(seat) ?? 0) + share + (rem > 0 ? 1 : 0));
    if (rem > 0) rem--;
  }
}

function orderFromButton(s: GameState, seats: number[]): number[] {
  return [...seats].sort((a, b) => ((a - s.buttonSeat + SEATS - 1) % SEATS) - ((b - s.buttonSeat + SEATS - 1) % SEATS));
}

/** Hero's net result in cents (only meaningful once the hand is over). */
export function heroNet(s: GameState): number {
  const h = s.players[s.heroSeat];
  return h.stack - h.startStack;
}

export function streetActions(s: GameState, street: Street = s.street): Action[] {
  return s.actions.filter((a) => a.street === street);
}
