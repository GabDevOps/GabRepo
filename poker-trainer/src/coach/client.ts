import type { CoachReply } from '../types';
import { LEAKS } from '../strategy/ranges';

/**
 * The coach talks to Claude through the claude.ai Artifact runtime (`sample` capability):
 * no API key and no server. Outside claude.ai `window.claude` is absent and the coach is unavailable.
 */
let samplePromise: Promise<SampleFn | null> | null = null;

export function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    samplePromise = window.claude?.use
      ? window.claude.use('sample').catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}

export class CoachUnavailable extends Error {}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

export async function askDecision(prompt: string): Promise<CoachReply> {
  const sample = await getSample();
  if (!sample) throw new CoachUnavailable('Open the app inside claude.ai to enable it.');
  try {
    const raw = await sample.json<unknown>(prompt, { cache: false });
    return normalizeReply(raw);
  } catch (e) {
    throw new CoachUnavailable(errMessage(e));
  }
}

export async function askMarkdown(prompt: string, onText?: (text: string) => void): Promise<string> {
  const sample = await getSample();
  if (!sample) throw new CoachUnavailable('Open the app inside claude.ai to enable it.');
  try {
    const r = await sample(prompt, { cache: false, onText: onText ? (u) => onText(u.text) : undefined });
    return stripFence(r.text);
  } catch (e) {
    throw new CoachUnavailable(errMessage(e));
  }
}

function stripFence(t: string): string {
  const m = t.trim().match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  return m ? m[1] : t.trim();
}

const CODES = new Set(LEAKS.map((l) => l.code));

/** Validate and coerce the model's JSON into a CoachReply. */
export function normalizeReply(raw: unknown): CoachReply {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const pick = <T extends string>(v: unknown, allowed: T[], dflt: T): T => {
    const s = String(v ?? '').toLowerCase();
    return (allowed as string[]).includes(s) ? (s as T) : dflt;
  };
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
  const n = o.numbers && typeof o.numbers === 'object' ? (o.numbers as Record<string, unknown>) : null;
  let explanation = o.explanation;
  if (Array.isArray(explanation)) explanation = explanation.map((x) => (String(x).startsWith('- ') ? x : `- ${x}`)).join('\n');
  return {
    action_verdict: pick(o.action_verdict, ['correct', 'acceptable', 'wrong'], 'acceptable'),
    reasoning_verdict: pick(o.reasoning_verdict, ['correct', 'partly', 'off'], 'partly'),
    headline: String(o.headline ?? '').trim() || 'No headline.',
    better_play: o.better_play ? String(o.better_play) : null,
    explanation: String(explanation ?? ''),
    numbers: n
      ? {
          price_pct: num(n.price_pct),
          outs: num(n.outs),
          hit_pct_next_card: num(n.hit_pct_next_card),
          hit_pct_two_cards: num(n.hit_pct_two_cards),
        }
      : null,
    leaks: Array.isArray(o.leaks) ? o.leaks.map(String).filter((c) => CODES.has(c)) : [],
  };
}
