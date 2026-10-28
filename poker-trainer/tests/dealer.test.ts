import { dealHand, classifySpot } from '../src/engine/dealer';
import { act } from '../src/engine/table';

const opts = { sb: 2, bb: 5, stacks: Array(6).fill(500), heroSeat: 0 };

describe('dealer', () => {
  it('never deals walks or obvious folds and mostly deals playable spots', () => {
    let cont = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const d = dealHand({ ...opts, id: i, interesting: true });
      expect(['continue', 'borderline']).toContain(d.kind);
      let s = d.state;
      for (const input of d.script) s = act(s, input);
      expect(s.toAct).toBe(0);
      if (d.kind === 'continue') cont++;
    }
    expect(cont / N).toBeGreaterThan(0.6);
    expect(cont / N).toBeLessThan(0.9);
  });

  it('replaying the script reproduces the spot the dealer chose', () => {
    for (let i = 0; i < 50; i++) {
      const d = dealHand({ ...opts, id: i, interesting: true });
      let s = d.state;
      for (const input of d.script) s = act(s, input);
      expect(s.toAct).toBe(s.heroSeat);
      expect(classifySpot(s)).toBe(d.kind);
    }
  });

  it('deals anything when interesting is off', () => {
    const kinds = new Set<string>();
    for (let i = 0; i < 300; i++) kinds.add(dealHand({ ...opts, id: i, interesting: false }).kind);
    expect(kinds.has('trivial')).toBe(true);
  });
});
