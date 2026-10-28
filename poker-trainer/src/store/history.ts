import type { HandRecord } from '../types';
import { cardPretty } from '../engine/cards';
import { fmt } from '../engine/money';
import { logLines } from '../engine/describe';

/** PokerStars-style text export of a list of hands. */
export function handsToText(hands: HandRecord[]): string {
  return hands.map(handToText).join('\n\n\n');
}

export function handToText(h: HandRecord): string {
  const players = h.seats.map((s) => ({ ...s, isHero: s.seat === h.heroSeat }));
  const out: string[] = [];
  const date = h.timestamp.replace('T', ' ').slice(0, 19);
  out.push(`Poker Trainer Hand #${h.number}: Hold'em No Limit (${fmt(h.sb)}/${fmt(h.bb)} EUR) - ${date}`);
  out.push(`Table 'Zoom Trainer' 6-max Seat #${h.buttonSeat + 1} is the button`);
  for (const s of players) out.push(`Seat ${s.seat + 1}: ${s.name} [${s.position}] (${fmt(s.stack)} in chips)`);
  const lines = logLines(players, h.actions, h.board);
  const holeIdx = lines.indexOf('*** HOLE CARDS ***');
  const hero = players[h.heroSeat];
  const dealt = `Dealt to ${hero.name} [${(hero.cards ?? []).map(cardPretty).join(' ')}]`;
  if (holeIdx >= 0) lines.splice(holeIdx + 1, 0, dealt);
  out.push(...lines);
  if (h.showdown) {
    out.push('*** SHOW DOWN ***');
    for (const seat of h.shownSeats) {
      const p = players[seat];
      out.push(`${p.name}: shows [${(p.cards ?? []).map(cardPretty).join(' ')}]`);
    }
  }
  for (const w of h.winners) out.push(`${players[w.seat].name} collected ${fmt(w.amount)} from pot`);
  out.push('*** SUMMARY ***');
  out.push(`Total pot ${fmt(h.winners.reduce((t, w) => t + w.amount, 0))} | Rake ${fmt(0)}`);
  if (h.board.length) out.push(`Board [${h.board.map(cardPretty).join(' ')}]`);
  out.push(`Hero result: ${fmt(h.result)}`);
  for (const d of h.heroDecisions) {
    out.push(`# ${d.street}: ${d.actionText} — "${d.reasoning}"`);
    if (d.coach) out.push(`#   coach: ${d.coach.action_verdict}/${d.coach.reasoning_verdict} — ${d.coach.headline}`);
  }
  return out.join('\n');
}
