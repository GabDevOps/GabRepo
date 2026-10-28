import { useEffect, useMemo, useState } from 'react';
import type { GameState, PlayerInput } from '../engine/table';
import { legalActions, potTotal } from '../engine/table';
import { fmt, toCents, currency } from '../engine/money';
import { situationLine } from '../engine/describe';

type Props = {
  game: GameState;
  requireReasoning: boolean;
  busy: boolean;
  onSubmit: (input: PlayerInput, reasoning: string) => void;
};

export function ActionPanel({ game, requireReasoning, busy, onSubmit }: Props) {
  const seat = game.heroSeat;
  const legal = legalActions(game, seat);
  const hero = game.players[seat];
  const pot = potTotal(game);
  const range = legal.bet ?? legal.raise;
  const isRaise = !!legal.raise;
  const [reasoning, setReasoning] = useState('');
  const [amount, setAmount] = useState('');
  const decisionKey = `${game.id}-${game.actions.length}`;

  const quick = useMemo(() => {
    if (!range) return [];
    const clamp = (x: number) => Math.max(range.min, Math.min(range.max, Math.round(x)));
    const out: { label: string; value: number }[] = [];
    if (game.street === 'preflop') {
      const limpers = game.actions.filter((a) => a.street === 'preflop' && a.type === 'call').length;
      const unopened = game.currentBet === game.bb && game.raisesThisStreet === 1;
      if (unopened) out.push({ label: limpers ? `3 BB +${limpers}` : '3 BB', value: clamp((3 + limpers) * game.bb) });
      else {
        out.push({ label: '3×', value: clamp(game.currentBet * 3) });
        out.push({ label: '4×', value: clamp(game.currentBet * 4) });
      }
    }
    const fr: [string, number][] = [
      ['1/3', 1 / 3],
      ['1/2', 1 / 2],
      ['2/3', 2 / 3],
      ['Pot', 1],
    ];
    for (const [label, f] of fr) {
      const v = isRaise ? game.currentBet + f * (pot + legal.toCall) : f * pot;
      out.push({ label, value: clamp(v) });
    }
    return out;
  }, [decisionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setReasoning('');
    setAmount(range ? ((quick[0]?.value ?? range.min) / 100).toFixed(2) : '');
  }, [decisionKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountCents = toCents(parseFloat(amount.replace(',', '.')) || 0);
  const amountOk = range ? amountCents >= range.min && amountCents <= range.max : false;
  const needText = requireReasoning && reasoning.trim().length < 3;
  const disabled = busy || needText;

  const submit = (input: PlayerInput) => {
    if (disabled) return;
    onSubmit(input, reasoning.trim());
  };
  const betOrRaise = () => {
    if (!range || !amountOk) return;
    if (amountCents >= range.max) submit({ type: 'allin' });
    else submit({ type: isRaise ? 'raise' : 'bet', amount: amountCents });
  };

  return (
    <section className="action-panel" aria-label="Your decision">
      <p className="situation">{situationLine(game, seat)}</p>
      <label className="reasoning-label" htmlFor="reasoning">
        Your reasoning{requireReasoning ? '' : ' (optional)'}
      </label>
      <textarea
        id="reasoning"
        className="reasoning"
        rows={3}
        value={reasoning}
        onChange={(e) => setReasoning(e.target.value)}
        placeholder="Your line of thinking (hand, board, his range, price, what you want the bet to do)"
      />
      <div className="actions">
        {legal.fold ? (
          <button className="btn fold" disabled={disabled} onClick={() => submit({ type: 'fold' })}>
            Fold
          </button>
        ) : null}
        {legal.check ? (
          <button className="btn check" disabled={disabled} onClick={() => submit({ type: 'check' })}>
            Check
          </button>
        ) : null}
        {legal.call !== null ? (
          <button className="btn call" disabled={disabled} onClick={() => submit({ type: 'call' })}>
            Call {fmt(legal.call)}
            {legal.call >= hero.stack ? ' (all-in)' : ''}
          </button>
        ) : null}
        {range ? (
          <button className="btn raise" disabled={disabled || !amountOk} onClick={betOrRaise}>
            {isRaise ? `Raise to ${fmt(amountCents)}` : `Bet ${fmt(amountCents)}`}
          </button>
        ) : null}
        {legal.allin > 0 && (legal.call === null || legal.allin > legal.call) ? (
          <button className="btn allin" disabled={disabled} onClick={() => submit({ type: 'allin' })}>
            All-in {fmt(legal.allin)}
          </button>
        ) : null}
      </div>
      {range ? (
        <div className="sizing">
          <label htmlFor="bet-amount" className="sizing-label">
            {isRaise ? 'Raise to' : 'Bet'} ({currency()})
          </label>
          <input
            id="bet-amount"
            className="amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && betOrRaise()}
          />
          <div className="quick">
            {quick.map((q) => (
              <button key={q.label} className={`chip-btn${q.value === amountCents ? ' on' : ''}`} onClick={() => setAmount((q.value / 100).toFixed(2))}>
                {q.label}
              </button>
            ))}
          </div>
          <span className="sizing-hint">
            min {fmt(range.min)} · max {fmt(range.max)}
          </span>
        </div>
      ) : null}
      {needText ? <p className="hint-line">Write your reasoning to unlock the action buttons.</p> : null}
    </section>
  );
}
