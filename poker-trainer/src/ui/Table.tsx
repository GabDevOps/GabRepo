import type { GameState } from '../engine/table';
import { potTotal, SEATS } from '../engine/table';
import { fmt } from '../engine/money';
import { PlayingCard } from './Card';

type Props = {
  game: GameState;
  fourColor: boolean;
  /** Seats whose cards are face up (showdown). */
  shown: Set<number>;
  /** Hand has ended for the hero (folded or finished). */
  ended: boolean;
  /** Cards dealt since the last render get the deal animation. */
  dealtFrom: number;
};

export function Table({ game, fourColor, shown, ended, dealtFrom }: Props) {
  const pot = potTotal(game);
  const winners = new Map(game.handOver ? game.winners.map((w) => [w.seat, w.amount]) : []);
  return (
    <div className="table-wrap">
      <div className="felt">
        <div className="felt-inner">
          <div className="pot" aria-live="polite">
            <span className="pot-label">Pot</span> <span className="pot-amount">{fmt(pot)}</span>
          </div>
          <div className="board">
            {Array.from({ length: 5 }, (_, i) =>
              game.board[i] ? (
                <PlayingCard key={i + game.board[i].rank + game.board[i].suit} card={game.board[i]} fourColor={fourColor} size="md" deal={i >= dealtFrom} />
              ) : (
                <div key={`slot${i}`} className="card slot md" />
              ),
            )}
          </div>
        </div>
        {game.players.map((p) => {
          const v = (p.seat - game.heroSeat + SEATS) % SEATS;
          const toAct = game.toAct === p.seat && !game.handOver;
          const faceUp = p.isHero || shown.has(p.seat);
          const won = winners.get(p.seat);
          return (
            <div key={p.seat} className={`seat v${v}${p.folded ? ' folded' : ''}${toAct ? ' to-act' : ''}${p.isHero ? ' hero' : ''}${won ? ' winner' : ''}`}>
              <div className="seat-cards">
                {p.folded && !p.isHero ? null : p.cards.map((c, i) => (
                  <PlayingCard key={i} card={faceUp ? c : undefined} fourColor={fourColor} size={p.isHero ? 'lg' : 'sm'} />
                ))}
              </div>
              <div className="seat-plate">
                <div className="seat-top">
                  <span className="seat-name">{p.name}</span>
                  <span className={`pos-badge pos-${p.position}`}>{p.position}</span>
                </div>
                <div className="seat-stack">{p.allIn && !ended ? 'All-in' : fmt(p.stack)}</div>
                {won ? <div className="seat-won">wins {fmt(won)}</div> : null}
              </div>
              {p.position === 'BTN' ? <span className="dealer-btn" title="Dealer button">D</span> : null}
              {p.streetBet > 0 && !game.handOver ? (
                <div className="bet-chip">
                  <span className="chip-dot" />
                  {fmt(p.streetBet)}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
