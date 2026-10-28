import { useState } from 'react';
import type { Settings } from '../types';

type Props = {
  settings: Settings;
  storeKind: 'cloud' | 'local';
  canDownload: boolean;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onExport: (kind: 'txt' | 'json' | 'stats') => void;
  onClear: () => void;
};

export function SettingsPanel({ settings, storeKind, canDownload, onChange, onClose, onExport, onClear }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => onChange({ ...settings, [k]: v });
  const money = (k: 'sb' | 'bb' | 'startStack', label: string) => (
    <label className="field" htmlFor={`set-${k}`}>
      <span>{label}</span>
      <input
        id={`set-${k}`}
        inputMode="decimal"
        defaultValue={(settings[k] / 100).toFixed(2)}
        onBlur={(e) => {
          const v = Math.round(parseFloat(e.target.value.replace(',', '.')) * 100);
          if (v > 0) set(k, v);
          else e.target.value = (settings[k] / 100).toFixed(2);
        }}
      />
    </label>
  );
  const toggle = (k: 'resetStacks' | 'fourColor' | 'interestingOnly' | 'showHint', label: string) => (
    <label className="toggle" htmlFor={`set-${k}`}>
      <input id={`set-${k}`} type="checkbox" checked={settings[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}</span>
    </label>
  );
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal" role="dialog" aria-label="Settings" onClick={(e) => e.stopPropagation()}>
        <header className="modal-head">
          <h2>Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </header>
        <div className="settings-grid">
          <fieldset>
            <legend>Table</legend>
            {money('sb', 'Small blind')}
            {money('bb', 'Big blind')}
            {money('startStack', 'Starting stack')}
            <label className="field" htmlFor="set-currency">
              <span>Currency symbol</span>
              <input id="set-currency" maxLength={3} value={settings.currency} onChange={(e) => set('currency', e.target.value)} />
            </label>
            {toggle('resetStacks', 'Reset stacks every hand')}
            <p className="muted small">Blind and stack changes apply from the next hand.</p>
          </fieldset>
          <fieldset>
            <legend>Training</legend>
            {toggle('interestingOnly', 'Interesting hands only (skip obvious folds and walks)')}
            {toggle('showHint', 'Show hint on the chart')}
            {toggle('fourColor', 'Four-colour deck')}
            <label className="field" htmlFor="set-review">
              <span>Progress review every</span>
              <input
                id="set-review"
                type="number"
                min={3}
                max={100}
                value={settings.reviewEvery}
                onChange={(e) => set('reviewEvery', Math.max(3, Math.min(100, parseInt(e.target.value) || 10)))}
              />
              <span className="unit">hands</span>
            </label>
          </fieldset>
          <fieldset>
            <legend>Data</legend>
            <p className="muted small">
              {storeKind === 'cloud'
                ? 'Hand history and stats are saved privately to your claude.ai account.'
                : 'Hand history and stats are saved in this browser only.'}
            </p>
            {canDownload ? (
              <div className="row-btns">
                <button className="btn ghost" onClick={() => onExport('txt')}>
                  Export hands (.txt)
                </button>
                <button className="btn ghost" onClick={() => onExport('json')}>
                  Export hands (.json)
                </button>
                <button className="btn ghost" onClick={() => onExport('stats')}>
                  Export stats (.json)
                </button>
              </div>
            ) : (
              <p className="muted small">Exports are available when the app runs inside claude.ai.</p>
            )}
            {confirmClear ? (
              <div className="row-btns">
                <span>Delete all hands and stats?</span>
                <button
                  className="btn fold"
                  onClick={() => {
                    onClear();
                    setConfirmClear(false);
                  }}
                >
                  Delete everything
                </button>
                <button className="btn ghost" onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </div>
            ) : (
              <button className="btn ghost danger" onClick={() => setConfirmClear(true)}>
                Clear data…
              </button>
            )}
          </fieldset>
        </div>
      </section>
    </div>
  );
}
