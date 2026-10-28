export type Rank = 'A' | 'K' | 'Q' | 'J' | 'T' | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2';
export type Suit = 's' | 'h' | 'd' | 'c';
export type Card = { rank: Rank; suit: Suit };

/** Ranks high to low, as used across the app (chart axes, labels). */
export const RANKS: Rank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
export const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export const SUIT_SYMBOL: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

/** 2..14 */
export function rankValue(r: Rank): number {
  return 14 - RANKS.indexOf(r);
}

export function cardToString(c: Card): string {
  return c.rank + c.suit;
}

export function cardPretty(c: Card): string {
  return c.rank + SUIT_SYMBOL[c.suit];
}

export function parseCard(s: string): Card {
  const rank = s[0].toUpperCase() as Rank;
  const suit = s[1].toLowerCase() as Suit;
  if (!RANKS.includes(rank) || !SUITS.includes(suit)) throw new Error(`Bad card ${s}`);
  return { rank, suit };
}

export function parseCards(s: string): Card[] {
  return s.trim().split(/\s+/).filter(Boolean).map(parseCard);
}

export function fullDeck(): Card[] {
  const d: Card[] = [];
  for (const rank of RANKS) for (const suit of SUITS) d.push({ rank, suit });
  return d;
}

function randomInt(n: number): number {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / n) * n;
    do crypto.getRandomValues(buf);
    while (buf[0] >= limit);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

export function shuffledDeck(): Card[] {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export { randomInt };
