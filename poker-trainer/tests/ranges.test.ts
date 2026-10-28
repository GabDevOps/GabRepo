import { allLabels, tierOf, outlineOf, TIER_HANDS, OUTLINE_HANDS, handLabel, cellLabel } from '../src/strategy/ranges';
import { recommend, PreflopSituation } from '../src/strategy/preflopAdvisor';
import { parseCards } from '../src/engine/cards';

const sit = (o: Partial<PreflopSituation>): PreflopSituation => ({
  heroPos: 'CO', label: 'AKs', raisers: [], lastRaiseToBB: 1, toCallBB: 1, limpers: 0,
  callersAfterLastRaise: 0, heroRaised: false, heroInPosition: false, playersBehind: 2, ...o,
});

describe('ranges', () => {
  it('has 169 unique labels and every listed hand is a real label', () => {
    const labels = allLabels();
    expect(new Set(labels).size).toBe(169);
    for (const h of [...Object.values(TIER_HANDS).flat(), ...Object.values(OUTLINE_HANDS).flat()]) expect(labels).toContain(h);
  });
  it('lays out suited above, offsuit below the diagonal', () => {
    expect(cellLabel(0, 1)).toBe('AKs');
    expect(cellLabel(1, 0)).toBe('AKo');
    expect(cellLabel(12, 12)).toBe('22');
  });
  it('labels hands', () => {
    expect(handLabel(parseCards('Kd As'))).toBe('AKo');
    expect(handLabel(parseCards('7h 7c'))).toBe('77');
    expect(handLabel(parseCards('Js Qs'))).toBe('QJs');
    expect(tierOf('QJo')).toBe('orange');
    expect(outlineOf('AJo')).toBe('black');
  });
});

describe('preflop advisor', () => {
  it('opens per seat', () => {
    expect(recommend(sit({ heroPos: 'UTG', label: 'A5s' })).action).toBe('fold');
    expect(recommend(sit({ heroPos: 'CO', label: 'A5s' })).action).toBe('raise');
    expect(recommend(sit({ heroPos: 'BTN', label: 'KTo' })).action).toBe('fold');
    expect(recommend(sit({ heroPos: 'HJ', label: '22', limpers: 1 })).sizeBB).toBe(4);
  });
  it('continues by outline', () => {
    const vsHJ = sit({ heroPos: 'BTN', raisers: ['HJ'], lastRaiseToBB: 3, toCallBB: 3 });
    expect(recommend({ ...vsHJ, label: 'KQo' }).action).toBe('fold');
    expect(recommend({ ...vsHJ, label: 'AKo' }).action).toBe('raise');
    expect(recommend({ ...vsHJ, label: 'T9s' }).action).toBe('call');
    const vsCO = { ...vsHJ, raisers: ['CO' as const] };
    expect(recommend({ ...vsCO, label: 'KQo' }).action).toBe('call');
    expect(recommend({ ...vsCO, label: 'AJo' }).action).toBe('call');
    expect(recommend({ ...vsCO, label: 'AQo' }).action).toBe('raise');
    expect(recommend({ ...vsCO, heroPos: 'SB', label: 'AJo', toCallBB: 2.6 }).action).toBe('fold');
  });
  it('handles 3-bets and 4-bets', () => {
    const f3 = sit({ raisers: ['CO', 'BTN'], heroRaised: true, lastRaiseToBB: 9, toCallBB: 6 });
    expect(recommend({ ...f3, label: 'KK' }).action).toBe('raise');
    expect(recommend({ ...f3, label: 'JJ', heroInPosition: false }).action).toBe('fold');
    expect(recommend({ ...f3, label: 'JJ', heroInPosition: true }).action).toBe('call');
    expect(recommend({ ...f3, label: 'AJs' }).action).toBe('fold');
    const f4 = sit({ raisers: ['CO', 'BTN', 'CO'], heroRaised: true, lastRaiseToBB: 22 });
    expect(recommend({ ...f4, label: 'AA' }).action).toBe('allin');
    expect(recommend({ ...f4, label: 'AKo' }).action).toBe('call');
  });
});
