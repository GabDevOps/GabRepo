import type { HeroDecision } from '../types';
import { renderMarkdown } from './markdown';
import { signed } from '../engine/money';

const STREET = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' } as const;
const VERDICT = { correct: 'Correct', acceptable: 'Acceptable', wrong: 'Wrong' } as const;
const REASON = { correct: 'Reasoning: correct', partly: 'Reasoning: partly', off: 'Reasoning: off' } as const;

type Props = {
  handNumber: number;
  decisions: HeroDecision[];
  scorecard: { status: 'idle' | 'loading' | 'done' | 'unavailable'; text: string };
  result: number | null;
  tally: { decisions: number; correct: number; net: number };
  onRetry: (index: number) => void;
};

export function CoachPanel({ handNumber, decisions, scorecard, result, tally, onRetry }: Props) {
  const pct = tally.decisions ? Math.round((100 * tally.correct) / tally.decisions) : 0;
  return (
    <aside className="coach" aria-label="Coach">
      <header className="coach-head">
        <h2>Coach</h2>
        <div className="tally" title="This session">
          <span>
            <b>{tally.decisions}</b> decisions
          </span>
          <span>
            <b>{pct}%</b> correct
          </span>
          <span className={tally.net >= 0 ? 'pos' : 'neg'}>
            <b>{signed(tally.net)}</b>
          </span>
        </div>
      </header>
      <div className="coach-feed">
        <p className="feed-hand">Hand #{handNumber}</p>
        {decisions.length === 0 ? <p className="muted">Your decisions and the coach's notes for this hand appear here.</p> : null}
        {decisions.map((d, i) => (
          <article key={i} className="decision">
            <div className="decision-meta">
              <span className="street-tag">{STREET[d.street]}</span>
              <span className="you-did">{d.actionText}</span>
            </div>
            {d.reasoning ? <p className="your-words">“{d.reasoning}”</p> : null}
            {d.coachStatus === 'pending' ? <p className="thinking">Coach is reading the hand…</p> : null}
            {d.coachStatus === 'unavailable' ? (
              <div className="unavailable">
                <p>Coach unavailable. {d.coachError ? <span className="muted">{d.coachError}</span> : null}</p>
                <p className="muted">The decision is logged and will be included in the next progress review.</p>
                <button className="link-btn" onClick={() => onRetry(i)}>
                  Ask again
                </button>
              </div>
            ) : null}
            {d.coach ? (
              <>
                <div className="badges">
                  <span className={`badge v-${d.coach.action_verdict}`}>{VERDICT[d.coach.action_verdict]}</span>
                  <span className={`badge r-${d.coach.reasoning_verdict}`}>{REASON[d.coach.reasoning_verdict]}</span>
                </div>
                <p className="headline">{d.coach.headline}</p>
                {d.coach.better_play ? (
                  <p className="better">
                    Better: <b>{d.coach.better_play}</b>
                  </p>
                ) : null}
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.coach.explanation) }} />
                {d.coach.numbers && Object.values(d.coach.numbers).some((x) => x !== null && x !== undefined) ? (
                  <dl className="numbers">
                    {d.coach.numbers.price_pct != null ? (
                      <div>
                        <dt>Price</dt>
                        <dd>{d.coach.numbers.price_pct}%</dd>
                      </div>
                    ) : null}
                    {d.coach.numbers.outs != null ? (
                      <div>
                        <dt>Outs</dt>
                        <dd>{d.coach.numbers.outs}</dd>
                      </div>
                    ) : null}
                    {d.coach.numbers.hit_pct_next_card != null ? (
                      <div>
                        <dt>Next card</dt>
                        <dd>{d.coach.numbers.hit_pct_next_card}%</dd>
                      </div>
                    ) : null}
                    {d.coach.numbers.hit_pct_two_cards != null ? (
                      <div>
                        <dt>Two cards</dt>
                        <dd>{d.coach.numbers.hit_pct_two_cards}%</dd>
                      </div>
                    ) : null}
                  </dl>
                ) : null}
                {d.coach.leaks.length ? (
                  <p className="leaks">
                    {d.coach.leaks.map((l) => (
                      <code key={l}>{l}</code>
                    ))}
                  </p>
                ) : null}
              </>
            ) : null}
          </article>
        ))}
        {result !== null ? (
          <article className="scorecard">
            <h3>
              Scorecard <span className={result >= 0 ? 'pos' : 'neg'}>{signed(result)}</span>
            </h3>
            {scorecard.status === 'loading' ? <p className="thinking">Coach is writing the scorecard…</p> : null}
            {scorecard.status === 'unavailable' ? <p className="muted">Coach unavailable for the scorecard.</p> : null}
            {scorecard.text ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(scorecard.text) }} /> : null}
          </article>
        ) : null}
      </div>
    </aside>
  );
}
