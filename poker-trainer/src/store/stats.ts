import { gradeOf, type CoachReply, type HandRecord, type Stats } from '../types';

function apply(s: Stats, g: CoachReply | null, sign: 1 | -1) {
  if (!g) return;
  if (g.action_verdict === 'correct') s.correct += sign;
  else if (g.action_verdict === 'acceptable') s.acceptable += sign;
  else if (g.action_verdict === 'wrong') s.wrong += sign;
  for (const code of g.leaks) s.leakCounts[code] = Math.max(0, (s.leakCounts[code] ?? 0) + sign);
}

/** Fold a finished hand into the running stats (Claude's grade when present, else the instant check). */
export function addHand(stats: Stats, h: HandRecord): Stats {
  const s: Stats = { ...stats, leakCounts: { ...stats.leakCounts } };
  s.hands++;
  s.net += h.result;
  for (const d of h.heroDecisions) {
    s.decisions++;
    apply(s, gradeOf(d), 1);
  }
  return s;
}

/** Claude's reply arrived after the hand was counted: swap the instant check's grade for it. */
export function replaceGrade(stats: Stats, previous: CoachReply | null, next: CoachReply): Stats {
  const s: Stats = { ...stats, leakCounts: { ...stats.leakCounts } };
  apply(s, previous, -1);
  apply(s, next, 1);
  return s;
}
