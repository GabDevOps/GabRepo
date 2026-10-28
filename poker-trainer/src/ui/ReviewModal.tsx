import type { Stats } from '../types';
import { renderMarkdown } from './markdown';
import { LEAKS } from '../strategy/ranges';
import { signed } from '../engine/money';

type Props = {
  stats: Stats;
  review: { status: 'loading' | 'done' | 'unavailable'; text: string; afterHand: number } | null;
  onRequest: () => void;
  onClose: () => void;
};

export function ReviewModal({ stats, review, onRequest, onClose }: Props) {
  const graded = stats.correct + stats.acceptable + stats.wrong;
  const pct = graded ? Math.round((100 * stats.correct) / graded) : 0;
  const leaks = Object.entries(stats.leakCounts).sort((a, b) => b[1] - a[1]);
  const past = [...stats.reviews].reverse();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal wide" role="dialog" aria-label="Progress review" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Progress</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close progress">
            ✕
          </button>
        </header>
        <div className="kpis">
          <div>
            <span>Hands</span>
            <b>{stats.hands}</b>
          </div>
          <div>
            <span>Decisions</span>
            <b>{stats.decisions}</b>
          </div>
          <div>
            <span>Correct</span>
            <b>{pct}%</b>
          </div>
          <div>
            <span>Result</span>
            <b className={stats.net >= 0 ? 'pos' : 'neg'}>{signed(stats.net)}</b>
          </div>
          <div>
            <span>Drill</span>
            <b>{stats.drill.questions ? `${Math.round((100 * stats.drill.correct) / stats.drill.questions)}%` : '—'}</b>
          </div>
        </div>
        {leaks.length ? (
          <div className="leak-bars">
            <h3>Leak counts (all time)</h3>
            {leaks.map(([code, n]) => (
              <div key={code} className="leak-row" title={LEAKS.find((l) => l.code === code)?.text}>
                <code>{code}</code>
                <span className="bar" style={{ width: `${(100 * n) / leaks[0][1]}%` }} />
                <b>{n}</b>
              </div>
            ))}
          </div>
        ) : null}
        <div className="review-body">
          {review ? (
            <>
              <h3>Review after hand #{review.afterHand}</h3>
              {review.status === 'loading' && !review.text ? <p className="thinking">Coach is reviewing your last hands…</p> : null}
              {review.status === 'unavailable' ? <p className="muted">Coach unavailable. Try again from claude.ai.</p> : null}
              {review.text ? <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(review.text) }} /> : null}
            </>
          ) : (
            <p className="muted">The coach writes a review every few hands. You can also ask for one now.</p>
          )}
          <button className="btn check" disabled={review?.status === 'loading' || stats.hands === 0} onClick={onRequest}>
            Review my last hands now
          </button>
        </div>
        {past.length > (review?.status === 'done' ? 1 : 0) ? (
          <details className="past">
            <summary>Earlier reviews</summary>
            {past.slice(review?.status === 'done' ? 1 : 0).map((r) => (
              <div key={r.timestamp} className="md past-review">
                <h4>After hand #{r.afterHand}</h4>
                <div dangerouslySetInnerHTML={{ __html: renderMarkdown(r.markdown) }} />
              </div>
            ))}
          </details>
        ) : null}
      </section>
    </div>
  );
}
