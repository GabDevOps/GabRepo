import { normalizeReply } from '../src/coach/client';
import { decisionPrompt, handStateJson } from '../src/coach/prompt';
import { newHand } from '../src/engine/table';

describe('coach', () => {
  it('normalizes replies', () => {
    const r = normalizeReply({ action_verdict: 'WRONG', reasoning_verdict: 'x', headline: 'h', explanation: ['a', '- b'], leaks: ['ODDS-MATH', 'NOPE'] });
    expect(r.action_verdict).toBe('wrong');
    expect(r.reasoning_verdict).toBe('partly');
    expect(r.explanation).toBe('- a\n- b');
    expect(r.leaks).toEqual(['ODDS-MATH']);
  });
  it('builds a prompt with rule set, leak codes and hand state', () => {
    const s = newHand({ id: 1, sb: 2, bb: 5, stacks: Array(6).fill(500), styles: ['tag', 'tag', 'tag', 'tag', 'tag'], heroSeat: 0, buttonSeat: 3 });
    const p = decisionPrompt({ sb: 2, bb: 5, stackBB: 100, street: 'preflop', handState: handStateJson(s, 1), reasoning: 'r', actionText: 'FOLD' });
    expect(p).toContain('GREEN (premium / early): AA KK QQ');
    expect(p).toContain('PF-LIMP');
    expect(p).not.toContain('POSTFLOP RULES OF THUMB');
    expect(p).toContain('"hero_position": "UTG"');
    expect(p).toContain('rule_book_preflop');
  });
  it('asks for a full explanation when the student gives no reasoning', () => {
    const p = decisionPrompt({ sb: 2, bb: 5, stackBB: 100, street: 'flop', handState: '{}', reasoning: '  ', actionText: 'CHECK' });
    expect(p).toContain('"reasoning_verdict" to "none"');
    expect(p).toContain('explain WHY');
    expect(p).toContain('POSTFLOP RULES OF THUMB');
    expect(p).toContain('STACKOFF');
  });
});
