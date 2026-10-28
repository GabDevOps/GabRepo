import { useEffect, useRef } from 'react';
import type { HandRecord, HeroDecision } from '../types';
import { gradeOf } from '../types';
import { renderMarkdown } from './markdown';
import { signed } from '../engine/money';

const STREET = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', showdown: 'Showdown' } as const;
const VERDICT = { correct: 'Correct', acceptable: 'Acceptable', wrong: 'Wrong' } as const;
const REASON = { correct: 'Reasoning: correct', partly: 'Reasoning: partly', off: 'Reasoning: off', none: '' } as const;

type Scorecard = { status: 'idle' | 'loading' | 'done' | 'unavailable'; text: string };

type Props = {
  handNumber: number;
  decisions: HeroDecision[];
  scorecard: Scorecard;
  result: number | null;
  /** The hand before this one (kept visible so a fold's feedback isn't lost when the next hand deals). */
  previous: HandRecord | null;
  tally: { decisions: number; correct: number; net: number };
  onRetry: (handId: number | null, index: number) => void;
};

function DecisionCard({ d, onRetry }: { d: HeroDecision; onRetry: () => void }) {
  const g = gradeOf(d);
  return (
    <article className="decision">
      <div className="decision-meta">
        <span className="street-tag">{STREET[d.street]}</span>
        <span className="you-did">{d.actionText}</span>
        {g ? <span className={`source-tag ${d.coach ? 'ai' : 'quick'}`}>{d.coach ? 'Coach' : 'Quick check'}</span> : null}
      </div>
      {d.reasoning ? <p className="your-words">“{d.reasoning}”</p> : null}
      {g ? (
        <>
          <div className="badges">
            <span className={`badge v-${g.action_verdict}`}>{VERDICT[g.action_verdict]}</span>
            {g.reasoning_verdict !== 'none' ? <span className={`badge r-${g.reasoning_verdict}`}>{REASON[g.reasoning_verdict]}</span> : null}
          </div>
          <p className="headline">{g.headline}</p>
          {g.better_play ? (
            <p className="better">
              Better: <b>{g.better_play}</b>
            </p>
          ) : null}
          <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(g.explanation) }} />
          {g.numbers && Object.values(g.numbers).some((x) => x !== null && x !== undefined) ? (
            <dl className="numbers">
              {g.numbers.price_pct != null ? (
                <div>
                  <dt>Price</dt>
                  <dd>{g.numbers.price_pct}%</dd>
                </div>
              ) : null}
              {g.numbers.outs != null ? (
                <div>
                  <dt>Outs</dt>
                  <dd>{g.numbers.outs}</dd>
                </div>
              ) : null}
              {g.numbers.hit_pct_next_card != null ? (
                <div>
                  <dt>Next card</dt>
                  <dd>{g.numbers.hit_pct_next_card}%</dd>
                </div>
              ) : null}
              {g.numbers.hit_pct_two_cards != null ? (
                <div>
                  <dt>Two cards</dt>
                  <dd>{g.numbers.hit_pct_two_cards}%</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {g.leaks.length ? (
            <p className="leaks">
              {g.leaks.map((l) => (
                <code key={l}>{l}</code>
              ))}
            </p>
          ) : null}
        </>
      ) : null}
      {d.coachStatus === 'pending' ? <p className="thinking small">Coach is adding detail</p> : null}
      {d.coachStatus === 'unavailable' ? (
        <p className="muted small">
          AI coach unavailable{d.coachError ? ` (${d.coachError})` : ''}.{' '}
          <button className="link-btn" onClick={onRetry}>
            Ask again
          </button>
        </p>
      ) : null}
    </article>
  );
}

export function CoachPanel({ handNumber, decisions, scorecard, result, previous, tally, onRetry }: Props) {
  const pct = tally.decisions ? Math.round((100 * tally.correct) / tally.decisions) : 0;
  const feedRef = useRef<HTMLDivElement>(null);

  // New hand: start the feed clean at the top.
  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = 0;
  }, [handNumber]);

  // New decision or scorecard in this hand: keep the latest note in view (desktop, where the feed scrolls).
  useEffect(() => {
    const el = feedRef.current?.querySelector('.current-hand')?.lastElementChild as HTMLElement | null;
    const feed = feedRef.current;
    if (!el || !feed || feed.scrollHeight <= feed.clientHeight) return;
    feed.scrollTop = Math.max(0, el.offsetTop - feed.offsetTop - 8);
  }, [decisions.length, result !== null]);

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
      <div className="coach-feed" ref={feedRef}>
        <div className="current-hand">
        <p className="feed-hand">Hand #{handNumber}</p>
        {decisions.length === 0 ? <p className="muted">Your decisions and the coach's notes for this hand appear here.</p> : null}
        {decisions.map((d, i) => (
          <DecisionCard key={i} d={d} onRetry={() => onRetry(null, i)} />
        ))}
        {result !== null ? (
          <article className="scorecard">
            <h3>
              Scorecard <span className={result >= 0 ? 'pos' : 'neg'}>{signed(result)}</span>
            </h3>
            {scorecard.status === 'loading' && !scorecard.text ? <p className="thinking">Coach is writing the scorecard</p> : null}
            {scorecard.status === 'unavailable' ? <p className="muted">Coach unavailable for the scorecard.</p> : null}
            {scorecard.text ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(scorecard.text) }} /> : null}
          </article>
        ) : null}
        </div>
        {previous && previous.heroDecisions.length ? (
          <details className="previous">
            <summary>
              <span>
                Previous hand #{previous.number} <span className={previous.result >= 0 ? 'pos' : 'neg'}>{signed(previous.result)}</span>
              </span>
              <span className="prev-verdicts">
                {previous.heroDecisions.map((d, i) => {
                  const g = gradeOf(d);
                  return g ? (
                    <span key={i} className={`badge v-${g.action_verdict}`} title={`${STREET[d.street]}: ${d.actionText}`}>
                      {d.actionText.split(' ')[0]}
                    </span>
                  ) : null;
                })}
              </span>
            </summary>
            {previous.heroDecisions.map((d, i) => (
              <DecisionCard key={i} d={d} onRetry={() => onRetry(previous.id, i)} />
            ))}
            {previous.scorecard ? <div className="md scorecard" dangerouslySetInnerHTML={{ __html: renderMarkdown(previous.scorecard) }} /> : null}
          </details>
        ) : null}
      </div>
    </aside>
  );
}
