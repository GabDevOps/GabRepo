import { newHand, act } from '../src/engine/table';
import { decide, randomStyles } from '../src/bots/bot';
import { classify, drawInfo } from '../src/bots/handStrength';
import { parseCards } from '../src/engine/cards';

describe('hand strength', () => {
  it('buckets hands', () => {
    expect(classify(parseCards('Ah Kd'), parseCards('Ks 7d 2c')).bucket).toBe('top_pair');
    expect(classify(parseCards('Qh Qd'), parseCards('Js 7d 2c')).bucket).toBe('overpair');
    expect(classify(parseCards('7h 7c'), parseCards('Js 7d 2c')).bucket).toBe('two_pair_plus');
    expect(classify(parseCards('Ah 5h'), parseCards('Kh 9h 2c')).bucket).toBe('strong_draw');
    expect(classify(parseCards('Ah 5d'), parseCards('Kh 9h 2c')).bucket).toBe('nothing');
    expect(classify(parseCards('9h 8d'), parseCards('Ts 7c 2d')).bucket).toBe('strong_draw');
  });
  it('counts outs', () => {
    expect(drawInfo(parseCards('9h 8h'), parseCards('Th 7c 2h')).outs).toBe(15);
    expect(drawInfo(parseCards('9h 6d'), parseCards('Th 7c 2s')).straightDraw).toBe('gutshot');
  });
});

describe('bots', () => {
  it('play 300 random hands to completion without illegal actions', () => {
    for (let i = 0; i < 300; i++) {
      let s = newHand({ id: i, sb: 2, bb: 5, stacks: Array(6).fill(500), styles: randomStyles(6), heroSeat: -1 });
      let guard = 0;
      while (!s.handOver) {
        s = act(s, decide(s, s.toAct!));
        if (++guard > 200) throw new Error('loop');
      }
      expect(s.players.reduce((t, p) => t + p.stack, 0)).toBe(3000);
    }
  });
});
