# Poker Trainer

Single-player 6-max No-Limit Hold'em trainer (€0.02/€0.05, 100 BB). You play one seat against five bots,
type your reasoning before every action, and an AI coach grades the action **and** the reasoning street by
street, writes a scorecard at the end of each hand and a progress review every N hands.

It is built to run as a **claude.ai Artifact**: the build produces one self-contained HTML page.

The full plan of the app (goals, architecture, decisions, verification) is in [PLAN.md](PLAN.md) (Spanish).
What each branch of this repo is, and its status: [BRANCHES.md](../BRANCHES.md).

## How it runs inside claude.ai

| Spec item | In the Artifact |
|---|---|
| Coach (Anthropic API behind a local proxy) | `sample` capability: the page asks Claude directly with the viewer's account, so no API key and no server. |
| Hand history + stats (IndexedDB / JSON file) | `db` capability, in the viewer's private folder `data/users/<id>/`. Falls back to `localStorage`. |
| Export `.txt` / `.json` | `downloads` capability. |
| Offline fallback | Outside claude.ai (or if Claude is unreachable) the game still deals and plays. Decisions are logged as "Coach unavailable" and can be re-asked. The preflop drill never needs the coach. |

Capabilities declared when publishing: `{ sample: {}, db: {}, user: {}, downloads: true }`.

## Develop

```bash
npm install
npm test          # engine, evaluator, ranges, advisor, bots, coach prompt
npm run dev       # local dev server (coach shows as unavailable outside claude.ai)
npm run build     # dist/index.html (standalone) + dist/poker-trainer.html (Artifact page)
```

## Layout

```
src/
  engine/    cards, 7-card evaluator, table (blinds, betting rounds, min-raise, all-in, side pots,
             uncalled-bet refunds, showdown), money (integer cents), describe (log + situation line)
  strategy/  ranges.ts      ← single source of truth: chart, outlines, 3-bet lists, sizes, rules, leak codes
             preflopAdvisor  rule-book recommendation for any preflop spot (chart hint, drill grading, coach facts)
             drill           preflop drill question generator (batches of 8)
  bots/      hand-strength buckets, board texture, limper / TAG / LAG styles with ±10% jitter
  coach/     prompt builder (spec §8) and the `sample` client with JSON validation
  store/     persistence (db + localStorage), stats, PokerStars-style text export
  ui/        table, action panel, coach panel, range chart, drill, settings, progress review
tests/       vitest suites
```

The range chart, the drill grading, the bots and the coach prompt all read `src/strategy/ranges.ts`,
so changing a range there updates all four.
