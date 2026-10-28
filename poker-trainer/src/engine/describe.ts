import { Action, GameState, Player, Street, potTotal, legalActions } from './table';
import { Card, cardPretty } from './cards';
import { fmt } from './money';

type Named = Pick<Player, 'seat' | 'position' | 'isHero'>;

export function who(p: Named): string {
  return p.isHero ? `${p.position} (You)` : p.position;
}

/** Hand-history style line, e.g. "HJ: raises €0.10 to €0.15". */
export function actionLine(players: Named[], a: Action): string {
  const p = players[a.seat];
  const all = a.allIn ? ' and is all-in' : '';
  switch (a.type) {
    case 'post_sb':
      return `${who(p)}: posts small blind ${fmt(a.amount!)}`;
    case 'post_bb':
      return `${who(p)}: posts big blind ${fmt(a.amount!)}`;
    case 'fold':
      return `${who(p)}: folds`;
    case 'check':
      return `${who(p)}: checks`;
    case 'call':
      return `${who(p)}: calls ${fmt(a.amount!)}${all}`;
    case 'bet':
      return `${who(p)}: bets ${fmt(a.amount!)}${all}`;
    case 'raise':
      return `${who(p)}: raises ${fmt(a.raiseBy!)} to ${fmt(a.amount!)}${all}`;
    default:
      return `${who(p)}: ${a.type}`;
  }
}

export function boardText(board: Card[]): string {
  return board.map(cardPretty).join(' ');
}

export function streetHeader(street: Street, board: Card[]): string {
  if (street === 'flop') return `*** FLOP *** [${boardText(board.slice(0, 3))}]`;
  if (street === 'turn') return `*** TURN *** [${boardText(board.slice(0, 3))}] [${cardPretty(board[3])}]`;
  if (street === 'river') return `*** RIVER *** [${boardText(board.slice(0, 4))}] [${cardPretty(board[4])}]`;
  return '*** HOLE CARDS ***';
}

/** Action log lines with street headers, as in a hand history file. */
export function logLines(players: Named[], actions: Action[], board: Card[]): string[] {
  const out: string[] = [];
  const order: Street[] = ['preflop', 'flop', 'turn', 'river'];
  const dealt = board.length >= 5 ? 4 : board.length === 4 ? 3 : board.length === 3 ? 2 : 1;
  let street: Street = 'preflop';
  let hole = false;
  const enter = (to: Street) => {
    while (street !== to) {
      street = order[order.indexOf(street) + 1];
      out.push(streetHeader(street, board));
    }
  };
  for (const a of actions) {
    if (!hole && a.type !== 'post_sb' && a.type !== 'post_bb') {
      out.push('*** HOLE CARDS ***');
      hole = true;
    }
    enter(a.street);
    out.push(actionLine(players, a));
  }
  // Streets dealt without any action (all-in run-outs).
  enter(order[dealt - 1]);
  return out;
}

/** "FOLD", "CALL €0.15", "RAISE to €0.45", "ALL-IN €5.00" — the coach's action format. */
export function heroActionText(a: Action): string {
  const amt = a.amount ?? 0;
  if (a.allIn && a.type !== 'fold' && a.type !== 'check') {
    return `ALL-IN ${fmt(amt)}${a.type === 'call' ? ' (call)' : ''}`;
  }
  switch (a.type) {
    case 'fold':
      return 'FOLD';
    case 'check':
      return 'CHECK';
    case 'call':
      return `CALL ${fmt(amt)}`;
    case 'bet':
      return `BET ${fmt(amt)}`;
    case 'raise':
      return `RAISE to ${fmt(amt)}`;
    default:
      return a.type.toUpperCase();
  }
}

const STREET_NAME: Record<Street, string> = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' };

/** e.g. "Preflop · You are BTN · HJ raised to €0.15, CO called · Pot €0.37 · To call €0.15" */
export function situationLine(s: GameState, seat: number): string {
  const me = s.players[seat];
  const parts = [STREET_NAME[s.street], `You are ${me.position}`];
  const acts = s.actions
    .filter((a) => a.street === s.street && a.type !== 'post_sb' && a.type !== 'post_bb' && a.type !== 'fold')
    .map((a) => {
      const p = s.players[a.seat];
      const n = p.isHero ? 'you' : p.position;
      const all = a.allIn ? ' (all-in)' : '';
      if (a.type === 'check') return `${n} checked`;
      if (a.type === 'call') return `${n} ${s.street === 'preflop' && !s.actions.some((x) => x.street === 'preflop' && (x.type === 'raise' || x.type === 'bet') && s.actions.indexOf(x) < s.actions.indexOf(a)) ? 'limped' : 'called'}${all}`;
      if (a.type === 'bet') return `${n} bet ${fmt(a.amount!)}${all}`;
      return `${n} raised to ${fmt(a.amount!)}${all}`;
    });
  parts.push(acts.length ? acts.join(', ') : s.street === 'preflop' ? 'Folded to you' : 'First to act');
  const live = s.players.filter((p) => !p.folded).length;
  if (s.street !== 'preflop') parts.push(`${live} players`);
  parts.push(`Pot ${fmt(potTotal(s))}`);
  const l = legalActions(s, seat);
  if (l.toCall > 0) parts.push(`To call ${fmt(Math.min(l.toCall, me.stack))}`);
  parts.push(`Stack ${fmt(me.stack)}`);
  return parts.join(' · ');
}
