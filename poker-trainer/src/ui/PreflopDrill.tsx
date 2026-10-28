import { useState } from 'react';
import { makeQuestion, DRILL_BATCH, DrillQuestion } from '../strategy/drill';
import { gradeChoice, RecAction } from '../strategy/preflopAdvisor';
import { PlayingCard } from './Card';

type Answer = { q: DrillQuestion; choice: RecAction; grade: 'correct' | 'acceptable' | 'wrong' };

export function PreflopDrill({ fourColor, onBatchDone }: { fourColor: boolean; onBatchDone: (correct: number, total: number) => void }) {
  const [q, setQ] = useState<DrillQuestion>(() => makeQuestion());
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [current, setCurrent] = useState<Answer | null>(null);

  const done = answers.length === DRILL_BATCH && !current;
  const score = answers.filter((a) => a.grade !== 'wrong').length;

  const choose = (choice: RecAction) => {
    if (current) return;
    const a: Answer = { q, choice, grade: gradeChoice(q.rec, choice) };
    setCurrent(a);
  };
  const next = () => {
    if (!current) return;
    const all = [...answers, current];
    setAnswers(all);
    setCurrent(null);
    if (all.length === DRILL_BATCH) onBatchDone(all.filter((a) => a.grade !== 'wrong').length, DRILL_BATCH);
    else setQ(makeQuestion());
  };
  const restart = () => {
    setAnswers([]);
    setCurrent(null);
    setQ(makeQuestion());
  };

  if (done) {
    return (
      <section className="drill">
        <h2>Batch complete</h2>
        <p className="drill-score">
          <b>{score}</b> / {DRILL_BATCH}
        </p>
        <ul className="drill-review">
          {answers.map((a, i) => (
            <li key={i} className={`g-${a.grade}`}>
              <span className="drill-hand">{a.q.label}</span> {a.q.prompt} You: <b>{a.choice.toUpperCase()}</b> · {a.q.rec.text}
            </li>
          ))}
        </ul>
        <button className="btn raise" onClick={restart}>
          New batch
        </button>
      </section>
    );
  }

  const unopened = !q.raiserPos;
  return (
    <section className="drill">
      <div className="drill-progress" aria-label={`Question ${answers.length + 1} of ${DRILL_BATCH}`}>
        {Array.from({ length: DRILL_BATCH }, (_, i) => (
          <span key={i} className={`dot${i < answers.length ? ` g-${answers[i].grade}` : i === answers.length ? ' now' : ''}`} />
        ))}
      </div>
      <p className="drill-prompt">{q.prompt}</p>
      <div className="drill-cards">
        {q.cards.map((c, i) => (
          <PlayingCard key={i} card={c} size="lg" fourColor={fourColor} />
        ))}
      </div>
      <div className="actions drill-actions">
        <button className="btn fold" disabled={!!current} onClick={() => choose('fold')}>
          Fold
        </button>
        <button className="btn call" disabled={!!current} onClick={() => choose('call')}>
          {unopened ? 'Limp' : 'Call'}
        </button>
        <button className="btn raise" disabled={!!current} onClick={() => choose('raise')}>
          {unopened ? 'Raise' : '3-bet'}
        </button>
      </div>
      {current ? (
        <div className={`drill-result g-${current.grade}`}>
          <p className="drill-verdict">
            {current.grade === 'correct' ? 'Correct' : current.grade === 'acceptable' ? 'Acceptable' : 'Wrong'} · {current.q.label}
          </p>
          <p>{current.q.rec.text}</p>
          <p className="muted">
            {current.q.rec.why}
            {current.choice === 'call' && unopened ? ' Never limp.' : ''}
          </p>
          <button className="btn check" onClick={next} autoFocus>
            {answers.length + 1 === DRILL_BATCH ? 'See score' : 'Next hand'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
