import { evaluate, HandCategory } from '../src/engine/evaluator';
import { parseCards } from '../src/engine/cards';

const ev = (s: string) => evaluate(parseCards(s));

describe('evaluator', () => {
  it('detects categories', () => {
    expect(ev('As Ks Qs Js Ts 2d 3c').category).toBe(HandCategory.StraightFlush);
    expect(ev('9s 9h 9d 9c 2d 3c 4h').category).toBe(HandCategory.Quads);
    expect(ev('9s 9h 9d 2c 2d 3c 4h').category).toBe(HandCategory.FullHouse);
    expect(ev('9s 9h 9d 2c 2d 2h 4h').category).toBe(HandCategory.FullHouse);
    expect(ev('As 9s 7s 4s 2s Kd Qc').category).toBe(HandCategory.Flush);
    expect(ev('Ah 2d 3c 4s 5h 9d Kc').category).toBe(HandCategory.Straight);
    expect(ev('9h Td Jc Qs Kh 2d 3c').category).toBe(HandCategory.Straight);
    expect(ev('9h 9d 9c Qs Kh 2d 3c').category).toBe(HandCategory.Trips);
    expect(ev('9h 9d Qc Qs Kh 2d 3c').category).toBe(HandCategory.TwoPair);
    expect(ev('9h 9d Ac Qs Kh 2d 3c').category).toBe(HandCategory.Pair);
    expect(ev('9h 8d Ac Qs Kh 2d 3c').category).toBe(HandCategory.HighCard);
  });
  it('four to a straight or flush is not a made hand', () => {
    expect(ev('Ah Kh Qh Jh 2c 3d 7s').category).toBe(HandCategory.HighCard);
    expect(ev('9c Td Jh Qs 2c 3d 4s').category).toBe(HandCategory.HighCard);
  });
  it('orders hands correctly', () => {
    expect(ev('Ah 2d 3c 4s 5h').score).toBeLessThan(ev('2h 3d 4c 5s 6h').score);
    expect(ev('As Ad Kc Qh 9s').score).toBeGreaterThan(ev('As Ad Kc Qh 8s').score);
    expect(ev('Kh Kd 2c 2s 9h').score).toBeGreaterThan(ev('Qh Qd Jc Js Ah').score);
    expect(ev('As Kd Qc Jh 9s 2c 3d').score).toBe(ev('Ac Kh Qd Js 9h 2s 3h').score);
  });
});
