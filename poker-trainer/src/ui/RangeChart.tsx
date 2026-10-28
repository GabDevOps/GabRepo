import { RANKS } from '../engine/cards';
import {
  cellLabel,
  tierOf,
  outlineOf,
  COLORS,
  OUTLINE_RULES,
  TIER_RULES,
  THREE_BET,
  SIZES_TEXT,
  Outline,
  Tier,
} from '../strategy/ranges';

type Props = {
  onClose: () => void;
  highlight: { label: string; text: string } | null;
};

const TIERS: Tier[] = ['green', 'blue', 'orange', 'fold'];
const OUTLINES: Outline[] = ['red', 'yellow', 'black'];

export function RangeChart({ onClose, highlight }: Props) {
  return (
    <aside className="chart-panel" aria-label="Starting-hand chart">
      <header className="chart-head">
        <h2>Starting hands</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close chart">
          ✕
        </button>
      </header>
      <div className="chart-scroll">
        <div className="grid13" role="grid" aria-label="13 by 13 hand chart, suited above the diagonal">
          {RANKS.map((_, r) =>
            RANKS.map((__, c) => {
              const label = cellLabel(r, c);
              const tier = tierOf(label);
              const outline = outlineOf(label);
              const hl = highlight?.label === label;
              return (
                <div
                  key={label}
                  role="gridcell"
                  className={`cell${outline ? ` ol-${outline}` : ''}${hl ? ' hl' : ''}`}
                  style={{ background: COLORS[tier] }}
                  title={`${label}: ${tier}${outline ? `, ${outline} outline` : ''}`}
                >
                  {label}
                </div>
              );
            }),
          )}
        </div>
        {highlight ? (
          <p className="hint-card">
            <b>{highlight.label}</b> · {highlight.text}
          </p>
        ) : null}
        <div className="legend">
          <h3>Opening (nobody raised)</h3>
          <ul>
            {TIERS.map((t) => (
              <li key={t}>
                <span className="sw" style={{ background: COLORS[t] }} />
                <b>{t === 'fold' ? 'Lilac' : t[0].toUpperCase() + t.slice(1)}</b> {TIER_RULES[t]}
              </li>
            ))}
          </ul>
          <p className="muted small">UTG, HJ: green + blue · CO, BTN, SB: + orange · BB: check</p>
          <h3>After a raise (outlines)</h3>
          <ul>
            {OUTLINES.map((o) => (
              <li key={o}>
                <span className={`sw sw-ol ol-${o}`} />
                <b>{o[0].toUpperCase() + o.slice(1)}</b> {OUTLINE_RULES[o]}
              </li>
            ))}
          </ul>
          <p className="muted small">
            Small pairs 22–66: call only when cheap (≤ 3.5 BB) and others are in. SB: 3-bet or fold. BB: defend wider vs ≤ 3 BB (plus suited connectors and
            suited aces).
          </p>
        </div>
        <div className="lists">
          <h3>3-bet</h3>
          <p>
            <b>vs UTG/HJ:</b> {THREE_BET.vsEarly.join(' ')}
          </p>
          <p>
            <b>vs CO/BTN:</b> {THREE_BET.vsLate.join(' ')}
          </p>
          <p className="muted small">3× the raise in position, 4× from the blinds.</p>
          <h3>Facing a 3-bet</h3>
          <p>AA KK → 4-bet (2.2–2.5×) · QQ AK → 4-bet or call · JJ TT AQs KQs → call in position only · rest → fold</p>
          <h3>Facing a 4-bet</h3>
          <p>AA KK → all-in · QQ AK → call · rest → fold</p>
          <h3>Sizes</h3>
          <ul className="sizes">
            {SIZES_TEXT.split('\n').map((l) => (
              <li key={l}>{l.replace(/^- /, '')}</li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
