import type { Action, BotStyle, Position, Street } from './engine/table';
import type { Card } from './engine/cards';

export type ActionVerdict = 'correct' | 'acceptable' | 'wrong';
/** 'none' = the student gave no reasoning (only the action is graded). */
export type ReasoningVerdict = 'correct' | 'partly' | 'off' | 'none';

export type CoachNumbers = {
  price_pct?: number | null;
  outs?: number | null;
  hit_pct_next_card?: number | null;
  hit_pct_two_cards?: number | null;
};

export type CoachReply = {
  action_verdict: ActionVerdict;
  reasoning_verdict: ReasoningVerdict;
  headline: string;
  better_play: string | null;
  explanation: string;
  numbers?: CoachNumbers | null;
  leaks: string[];
  /** 'quick' = instant rule-based check in the browser; 'coach' = Claude. */
  source?: 'quick' | 'coach';
};

export type HeroDecision = {
  street: Street;
  situation: string;
  reasoning: string;
  action: Action;
  /** "CALL €0.15" etc., as sent to the coach. */
  actionText: string;
  /** Hand-state JSON sent to the coach (kept so an unavailable coach can be re-asked later). */
  handState: string;
  /** Instant rule-based grade, available the moment the action is taken. */
  quick: CoachReply;
  /** Claude's grade; replaces the quick check on the card when it arrives. */
  coach: CoachReply | null;
  /** 'pending' while waiting, 'unavailable' when the coach could not be reached. */
  coachStatus: 'pending' | 'done' | 'unavailable';
  coachError?: string;
};

export type SeatRecord = { seat: number; name: string; position: Position; stack: number; cards?: Card[]; style?: BotStyle };

export type HandRecord = {
  id: number;
  number: number;
  timestamp: string;
  sb: number;
  bb: number;
  seats: SeatRecord[];
  heroSeat: number;
  buttonSeat: number;
  board: Card[];
  actions: Action[];
  heroDecisions: HeroDecision[];
  /** Hero € net, in cents. */
  result: number;
  showdown: boolean;
  /** Seats whose cards were shown at showdown. */
  shownSeats: number[];
  winners: { seat: number; amount: number }[];
  scorecard?: string;
};

export type Review = { afterHand: number; timestamp: string; markdown: string };

export type Stats = {
  hands: number;
  decisions: number;
  correct: number;
  acceptable: number;
  wrong: number;
  /** cents */
  net: number;
  leakCounts: Record<string, number>;
  reviews: Review[];
  drill: { batches: number; questions: number; correct: number };
};

export const emptyStats = (): Stats => ({
  hands: 0,
  decisions: 0,
  correct: 0,
  acceptable: 0,
  wrong: 0,
  net: 0,
  leakCounts: {},
  reviews: [],
  drill: { batches: 0, questions: 0, correct: 0 },
});

export type Settings = {
  sb: number; // cents
  bb: number;
  startStack: number;
  resetStacks: boolean;
  fourColor: boolean;
  /** Skip hands with no real decision (walks, obvious folds). */
  interestingOnly: boolean;
  reviewEvery: number;
  showHint: boolean;
  currency: string;
};

export const defaultSettings: Settings = {
  sb: 2,
  bb: 5,
  startStack: 500,
  resetStacks: true,
  fourColor: true,
  interestingOnly: true,
  reviewEvery: 10,
  showHint: false,
  currency: '€',
};

/** The grade that counts for a decision: Claude's when present, else the instant check. */
export const gradeOf = (d: HeroDecision): CoachReply | null => d.coach ?? d.quick ?? null;
