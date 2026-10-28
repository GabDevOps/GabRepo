import type { Card as CardT } from '../engine/cards';
import { SUIT_SYMBOL } from '../engine/cards';

const SUIT_NAME = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' } as const;

export function PlayingCard({ card, size = 'md', fourColor, deal }: { card?: CardT; size?: 'sm' | 'md' | 'lg'; fourColor: boolean; deal?: boolean }) {
  if (!card) return <div className={`card back ${size}`} aria-label="Face-down card" />;
  const suitClass = fourColor ? `s4-${card.suit}` : card.suit === 'h' || card.suit === 'd' ? 's2-red' : 's2-black';
  const rank = card.rank === 'T' ? '10' : card.rank;
  return (
    <div className={`card face ${size} ${suitClass}${deal ? ' deal' : ''}`} aria-label={`${rank} of ${SUIT_NAME[card.suit]}`}>
      <span className="corner">
        {rank}
        <span className="corner-suit">{SUIT_SYMBOL[card.suit]}</span>
      </span>
      <span className="pip">{SUIT_SYMBOL[card.suit]}</span>
      <span className="center-rank">{rank}</span>
    </div>
  );
}
