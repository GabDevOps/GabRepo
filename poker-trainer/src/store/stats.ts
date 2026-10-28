import type { HandRecord, Stats } from '../types';

/** Fold a finished hand into the running stats. */
export function addHand(stats: Stats, h: HandRecord): Stats {
  const s: Stats = { ...stats, leakCounts: { ...stats.leakCounts } };
  s.hands++;
  s.net += h.result;
  for (const d of h.heroDecisions) {
    s.decisions++;
    const v = d.coach?.action_verdict;
    if (v === 'correct') s.correct++;
    else if (v === 'acceptable') s.acceptable++;
    else if (v === 'wrong') s.wrong++;
    for (const code of d.coach?.leaks ?? []) s.leakCounts[code] = (s.leakCounts[code] ?? 0) + 1;
  }
  return s;
}

/** Account for a coach reply that arrived after the hand was already counted. */
export function addLateReply(stats: Stats, verdict: string, leaks: string[]): Stats {
  const s: Stats = { ...stats, leakCounts: { ...stats.leakCounts } };
  if (verdict === 'correct') s.correct++;
  else if (verdict === 'acceptable') s.acceptable++;
  else if (verdict === 'wrong') s.wrong++;
  for (const code of leaks) s.leakCounts[code] = (s.leakCounts[code] ?? 0) + 1;
  return s;
}
