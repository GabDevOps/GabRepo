let symbol = '€';

export function setCurrency(s: string) {
  symbol = s || '€';
}

export function currency(): string {
  return symbol;
}

/** Format integer cents as e.g. "€0.15" (negative: "-€0.15"). */
export function fmt(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${symbol}${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function signed(cents: number): string {
  return cents > 0 ? `+${fmt(cents)}` : fmt(cents);
}

export function toCents(euros: number): number {
  return Math.round(euros * 100);
}
