import { GameState, legalActions, potTotal } from '../engine/table';
import { cardToString } from '../engine/cards';
import { fmt } from '../engine/money';
import { actionLine } from '../engine/describe';
import { evaluate } from '../engine/evaluator';
import { drawInfo } from '../bots/handStrength';
import { recommend, situationFromState } from '../strategy/preflopAdvisor';
import { leaksText, rulebookText } from '../strategy/ranges';
import type { HandRecord, Review, Stats } from '../types';

function intro(bb: number, sb: number, stackBB: number) {
  return `You are a poker coach for a beginner playing 6-max no-limit hold'em cash games at ${fmt(sb)}/${fmt(bb)} with ${stackBB} BB stacks. You grade the student's decisions against the TAG rule set below. Be direct and concise. Lead with the verdict. Correct the reasoning explicitly, not only the action. Use short bullet points and small tables. Quote the student's numbers next to the exact numbers when they differ. Never reveal villain cards mid-hand. If the student picks an action that is not available, say so and ask again. If the student misreads their own hand or the board, correct that first. Count to five before calling anything a straight or a flush.
A right action for a wrong reason gets action "acceptable" or reasoning "partly" plus a correction. The hand continues with the student's action even when it is wrong, so note the better line. Tone: direct, no praise padding, never write "genuinely" or "honestly".`;
}

function ruleSet() {
  return `=== RULE SET ===
${rulebookText()}

=== LEAK CODES ===
${leaksText()}`;
}

const OUTPUT_FORMAT = `=== OUTPUT FORMAT ===
Respond ONLY with one JSON object:
{
  "action_verdict": "correct" | "acceptable" | "wrong",
  "reasoning_verdict": "correct" | "partly" | "off",
  "headline": "one line, verdict + action first, e.g. \\"Correct: call. Price 28%, you have 8 outs (32% over two cards).\\"",
  "better_play": "e.g. \\"Bet €0.10 (1/3 pot)\\"" or null when the student's action is best,
  "explanation": "2–6 short Markdown bullet lines starting with '- '. Correct the reasoning explicitly: what was right, what to change, and the rule number it comes from. When the student's numbers differ from the exact ones, include a small Markdown table: | | You | Exact |.",
  "numbers": { "price_pct": number|null, "outs": number|null, "hit_pct_next_card": number|null, "hit_pct_two_cards": number|null } or null when no math is involved,
  "leaks": ["CODE", ...]  (leak codes that apply to this decision; [] if none)
}

Example:
{"action_verdict":"wrong","reasoning_verdict":"off","headline":"Call was right. Price is 16.7%, your flush alone hits 19.6%.","better_play":"Call €0.18","explanation":"- Price: €0.18 ÷ (€0.90 + €0.18) = 16.7%, not 20%. You rounded the bet up and forgot to add your call.\\n- Outs: 9 spades of 46 unseen cards = 19.6% (rule of 2 says 18%, slightly low).\\n- Rule 6: never round the bet up.","numbers":{"price_pct":16.7,"outs":9,"hit_pct_next_card":19.6,"hit_pct_two_cards":null},"leaks":["ODDS-MATH","ODDS-FOLD"]}`;

/** Hand state for the decision about to be made by the hero (state BEFORE the action). */
export function handStateJson(s: GameState, handNumber: number): string {
  const hero = s.players[s.heroSeat];
  const legal = legalActions(s, s.heroSeat);
  const pot = potTotal(s);
  const legalList: string[] = [];
  if (legal.fold) legalList.push('FOLD');
  if (legal.check) legalList.push('CHECK');
  if (legal.call !== null) legalList.push(`CALL ${fmt(legal.call)}`);
  if (legal.bet) legalList.push(`BET ${fmt(legal.bet.min)}–${fmt(legal.bet.max)}`);
  if (legal.raise) legalList.push(`RAISE to ${fmt(legal.raise.min)}–${fmt(legal.raise.max)}`);
  if (legal.allin > 0) legalList.push(`ALL-IN ${fmt(legal.allin)}`);

  // Engine-verified facts so the coach never has to guess the student's hand.
  const facts: Record<string, unknown> = {};
  if (s.board.length >= 3) {
    const v = evaluate([...hero.cards, ...s.board]);
    facts.hero_made_hand = v.name;
    if (s.board.length < 5) {
      const d = drawInfo(hero.cards, s.board);
      facts.hero_draws = { flush_draw: d.flushDraw, straight_draw: d.straightDraw, clean_outs_estimate: d.outs };
    }
    facts.cards_to_come = 5 - s.board.length;
  }
  if (legal.toCall > 0) facts.price_pct = round1((100 * legal.toCall) / (pot + legal.toCall));
  facts.spr = round1(hero.stack / Math.max(1, pot));
  if (s.street === 'preflop') {
    const rec = recommend(situationFromState(s, s.heroSeat));
    facts.rule_book_preflop = { recommendation: rec.text, acceptable_alternatives: rec.acceptable, why: rec.why };
  }

  const state = {
    hand_number: handNumber,
    blinds: `${fmt(s.sb)}/${fmt(s.bb)}`,
    seats: s.players.map((p) => ({
      name: p.name,
      position: p.position,
      stack: fmt(p.stack),
      status: p.folded ? 'folded' : p.allIn ? 'all-in' : 'active',
      bet_this_street: fmt(p.streetBet),
    })),
    hero_position: hero.position,
    hero_cards: hero.cards.map(cardToString),
    board: s.board.map(cardToString),
    pot: fmt(pot),
    action_history: s.actions.map((a) => `[${a.street}] ${actionLine(s.players, a)}`),
    current_street: s.street,
    legal_actions: legalList,
    to_call: fmt(legal.toCall),
    hero_stack: fmt(hero.stack),
    villain_stacks: s.players.filter((p) => !p.isHero).map((p) => `${p.position} ${fmt(p.stack)}`),
    engine_facts: facts,
  };
  return JSON.stringify(state, null, 1);
}

export function decisionPrompt(o: { sb: number; bb: number; stackBB: number; handState: string; reasoning: string; actionText: string }) {
  return `${intro(o.bb, o.sb, o.stackBB)}

${ruleSet()}

${OUTPUT_FORMAT}

=== HAND STATE ===
${o.handState}

=== STUDENT ===
Reasoning: "${o.reasoning.trim() || '(no reasoning given)'}"
Action: ${o.actionText}`;
}

function handSummary(h: HandRecord, revealAll: boolean) {
  const hero = h.seats[h.heroSeat];
  return {
    hand_number: h.number,
    hero_position: hero.position,
    hero_cards: hero.cards?.map(cardToString),
    board: h.board.map(cardToString),
    villains: h.seats
      .filter((s) => s.seat !== h.heroSeat)
      .map((s) => ({
        position: s.position,
        cards: revealAll || h.shownSeats.includes(s.seat) ? s.cards?.map(cardToString) : 'hidden',
      })),
    actions: h.actions.map((a) => `[${a.street}] ${actionLine(h.seats.map((x) => ({ ...x, isHero: x.seat === h.heroSeat })), a)}`),
    showdown: h.showdown,
    hero_result: fmt(h.result),
    decisions: h.heroDecisions.map((d) => ({
      street: d.street,
      situation: d.situation,
      reasoning: d.reasoning,
      action: d.actionText,
      coach: d.coach
        ? { action_verdict: d.coach.action_verdict, reasoning_verdict: d.coach.reasoning_verdict, headline: d.coach.headline, leaks: d.coach.leaks }
        : 'coach unavailable at the time — grade this decision yourself',
    })),
  };
}

export function scorecardPrompt(o: { sb: number; bb: number; stackBB: number; hand: HandRecord }) {
  return `${intro(o.bb, o.sb, o.stackBB)}

${ruleSet()}

The hand is over. Villain cards are included "for training"; you may mention them if it helps the lesson (if the student folded, say these were not shown at the table).

=== HAND ===
${JSON.stringify(handSummary(o.hand, true), null, 1)}

=== TASK ===
Write the end-of-hand scorecard in Markdown, nothing else:
1. A table with columns: Street | Your action | Action verdict | Reasoning note (one row per student decision; verdicts as Correct / Acceptable / Wrong).
2. A line "**Result:** ${fmt(o.hand.result)}".
3. One sentence starting "**Takeaway:**" with the single most important lesson from this hand, or "**Takeaway:** clean hand." if there is nothing to fix.`;
}

export function reviewPrompt(o: { sb: number; bb: number; stackBB: number; hands: HandRecord[]; stats: Stats; previous?: Review }) {
  const leakEuro: Record<string, { count: number; net: number; hands: number[] }> = {};
  for (const h of o.hands)
    for (const d of h.heroDecisions)
      for (const code of d.coach?.leaks ?? []) {
        const e = (leakEuro[code] ??= { count: 0, net: 0, hands: [] });
        e.count++;
        if (!e.hands.includes(h.number)) {
          e.hands.push(h.number);
          e.net += h.result;
        }
      }
  const decisions = o.hands.flatMap((h) => h.heroDecisions);
  const correct = decisions.filter((d) => d.coach?.action_verdict === 'correct').length;
  return `${intro(o.bb, o.sb, o.stackBB)}

${ruleSet()}

=== LAST ${o.hands.length} HANDS ===
${JSON.stringify(o.hands.map((h) => handSummary(h, false)), null, 1)}

=== AGGREGATES (these hands) ===
decisions: ${decisions.length}, correct: ${correct}, result: ${fmt(o.hands.reduce((t, h) => t + h.result, 0))}
leaks in these hands (count, € result of hands where it occurred, hand numbers): ${JSON.stringify(leakEuro)}
all-time leak counts: ${JSON.stringify(o.stats.leakCounts)} over ${o.stats.hands} hands

=== PREVIOUS REVIEW ===
${o.previous ? o.previous.markdown : '(none — this is the first review)'}

=== TASK ===
Write the progress review in Markdown, nothing else, with these sections:
## Overall
decisions, % correct, € result.
## Fixed
leaks from the previous review that did not recur (or "First review" if none).
## Still to fix
ranked by estimated € cost; each with its leak code, 1–2 example hand numbers (#n), and a one-line rule.
## Not a problem
what the student can stop worrying about.
## Next session
one instruction for the next real session.`;
}

function round1(x: number) {
  return Math.round(x * 10) / 10;
}
