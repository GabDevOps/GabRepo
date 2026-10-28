import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { act, GameState, heroNet, PlayerInput } from '../engine/table';
import { dealHand } from '../engine/dealer';
import { setCurrency, fmt } from '../engine/money';
import { heroActionText, logLines, situationLine } from '../engine/describe';
import { cardPretty } from '../engine/cards';
import { decide } from '../bots/bot';
import { handLabel } from '../strategy/ranges';
import { recommend, situationFromState } from '../strategy/preflopAdvisor';
import { decisionPrompt, handStateJson, reviewPrompt, scorecardPrompt } from '../coach/prompt';
import { askDecision, askMarkdown, getSample } from '../coach/client';
import { quickCheck } from '../coach/quickCheck';
import { HistoryStore, loadSettings, localStore, openStore, saveFile, saveSettings } from '../store/persistence';
import { addHand, replaceGrade } from '../store/stats';
import { handsToText } from '../store/history';
import { emptyStats, gradeOf, HandRecord, HeroDecision, Settings, Stats } from '../types';
import { Table } from './Table';
import { ActionPanel } from './ActionPanel';
import { CoachPanel } from './CoachPanel';
import { RangeChart } from './RangeChart';
import { PreflopDrill } from './PreflopDrill';
import { SettingsPanel } from './SettingsPanel';
import { ReviewModal } from './ReviewModal';

const BOT_DELAY = 550;
const STREET_DELAY = 900;
/** Pause after a hero fold before the next hand is dealt automatically. */
const AUTO_DEAL_DELAY = 1200;

type Scorecard = { status: 'idle' | 'loading' | 'done' | 'unavailable'; text: string };
type ReviewState = { status: 'loading' | 'done' | 'unavailable'; text: string; afterHand: number };

function withTimeout<T>(p: Promise<T>, ms: number, fallback: () => T): Promise<T> {
  return Promise.race([p, new Promise<T>((res) => setTimeout(() => res(fallback()), ms))]);
}

export function App() {
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings());
  setCurrency(settings.currency);
  const [mode, setMode] = useState<'play' | 'drill'>('play');
  const [store, setStore] = useState<HistoryStore | null>(null);
  const [hands, setHandsState] = useState<HandRecord[]>([]);
  const [stats, setStatsState] = useState<Stats>(emptyStats());
  const [sessionStart, setSessionStart] = useState(0);
  const [game, setGameState] = useState<GameState | null>(null);
  const [dealtFrom, setDealtFrom] = useState(0);
  const [handNumber, setHandNumber] = useState(1);
  const [decisions, setDecisionsState] = useState<HeroDecision[]>([]);
  const [ended, setEnded] = useState<{ result: number; shown: Set<number>; heroFolded: boolean } | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard>({ status: 'idle', text: '' });
  const [chartOpen, setChartOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [coachOnline, setCoachOnline] = useState<boolean | null>(null);
  const [toast, setToast] = useState('');

  // Refs mirror state for async callbacks (coach replies can land after the hand moved on).
  const handsRef = useRef(hands);
  const statsRef = useRef(stats);
  const decisionsRef = useRef(decisions);
  const handIdRef = useRef<number>(0);
  const pendingRef = useRef(new Map<number, Promise<unknown>[]>());
  const storeRef = useRef<HistoryStore | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const gameRef = useRef<GameState | null>(null);
  gameRef.current = game;
  /** Pre-computed bot moves up to the hero's first decision (see dealHand). */
  const scriptRef = useRef<PlayerInput[]>([]);

  const setHands = (h: HandRecord[]) => {
    handsRef.current = h;
    setHandsState(h);
  };
  const setStats = (s: Stats) => {
    statsRef.current = s;
    setStatsState(s);
    storeRef.current?.saveStats(s).catch(() => undefined);
  };
  const setDecisions = (d: HeroDecision[]) => {
    decisionsRef.current = d;
    setDecisionsState(d);
  };
  const setSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(s);
  };
  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  };

  /* ------------------------------------------------ loading ------------------------------------------------ */

  useEffect(() => {
    getSample().then((s) => setCoachOnline(!!s));
    withTimeout(openStore(), 6000, () => localStore).then(async (resolved) => {
      storeRef.current = resolved;
      setStore(resolved);
      try {
        const data = await resolved.load();
        setHands(data.hands);
        statsRef.current = data.stats;
        setStatsState(data.stats);
        setSessionStart(data.hands.length);
      } catch {
        /* start empty */
      }
      startHand(statsRef.current.hands + 1);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------ hand flow ------------------------------------------------ */

  const startHand = useCallback((number?: number) => {
    const s = settingsRef.current;
    const n = number ?? statsRef.current.hands + 1;
    const prevGame = gameRef.current;
    let heroStack = s.startStack;
    if (!s.resetStacks && prevGame) {
      const prev = prevGame.players[prevGame.heroSeat].stack;
      heroStack = prev >= s.bb ? prev : s.startStack;
    }
    const stacks = Array(6).fill(s.startStack);
    stacks[0] = heroStack;
    const id = Date.now();
    handIdRef.current = id;
    const deal = dealHand({ id, sb: s.sb, bb: s.bb, stacks, heroSeat: 0, interesting: s.interestingOnly });
    const g = deal.state;
    scriptRef.current = deal.script;
    setHandNumber(n);
    setDecisions([]);
    setEnded(null);
    setScorecard({ status: 'idle', text: '' });
    setDealtFrom(0);
    setGameState(g);
  }, []);

  const updateGame = (next: GameState) => {
    setGameState((prev) => {
      setDealtFrom(prev && prev.id === next.id ? prev.board.length : 0);
      return next;
    });
  };

  // Bots act on their own, one at a time.
  useEffect(() => {
    if (!game || game.handOver || ended) return;
    if (game.toAct === game.heroSeat) return;
    const newStreet = game.actions.length > 0 && game.actions[game.actions.length - 1].street !== game.street;
    const t = setTimeout(() => {
      const input = scriptRef.current.shift() ?? decide(game, game.toAct!);
      updateGame(act(game, input));
    }, newStreet ? STREET_DELAY : BOT_DELAY);
    return () => clearTimeout(t);
  }, [game, ended]);

  // Hand finished in the engine.
  useEffect(() => {
    if (game?.handOver && !ended) finalize(game, false);
  }, [game]); // eslint-disable-line react-hooks/exhaustive-deps

  const patchDecision = (handId: number, idx: number, patch: Partial<HeroDecision>) => {
    if (handId === handIdRef.current) {
      const d = decisionsRef.current.slice();
      if (d[idx]) {
        d[idx] = { ...d[idx], ...patch };
        setDecisions(d);
      }
    }
    const rec = handsRef.current.find((h) => h.id === handId);
    if (rec && rec.heroDecisions[idx]) {
      const before = rec.heroDecisions[idx];
      const updated: HandRecord = { ...rec, heroDecisions: rec.heroDecisions.map((x, i) => (i === idx ? { ...x, ...patch } : x)) };
      setHands(handsRef.current.map((h) => (h.id === handId ? updated : h)));
      storeRef.current?.saveHand(updated).catch(() => undefined);
      if (patch.coach) setStats(replaceGrade(statsRef.current, gradeOf(before), patch.coach));
    }
  };

  const askCoach = (handId: number, idx: number, d: HeroDecision) => {
    const s = settingsRef.current;
    const prompt = decisionPrompt({
      sb: s.sb,
      bb: s.bb,
      stackBB: Math.round(s.startStack / s.bb),
      street: d.street,
      handState: d.handState,
      reasoning: d.reasoning,
      actionText: d.actionText,
      quick: d.quick,
    });
    patchDecision(handId, idx, { coachStatus: 'pending', coachError: undefined });
    const p = askDecision(prompt).then(
      (reply) => {
        setCoachOnline(true);
        patchDecision(handId, idx, { coach: reply, coachStatus: 'done' });
      },
      (err: Error) => patchDecision(handId, idx, { coachStatus: 'unavailable', coachError: err.message }),
    );
    const list = pendingRef.current.get(handId) ?? [];
    list.push(p);
    pendingRef.current.set(handId, list);
    return p;
  };

  const onHeroAction = (input: PlayerInput, reasoning: string) => {
    if (!game) return;
    const before = game;
    let next: GameState;
    try {
      next = act(before, input);
    } catch (e) {
      flash((e as Error).message);
      return;
    }
    const action = next.actions[before.actions.length];
    const decision: HeroDecision = {
      street: before.street,
      situation: situationLine(before, before.heroSeat),
      reasoning,
      action,
      actionText: heroActionText(action),
      handState: handStateJson(before, handNumber),
      quick: quickCheck(before, action),
      coach: null,
      coachStatus: 'pending',
    };
    const handId = before.id;
    const idx = decisionsRef.current.length;
    setDecisions([...decisionsRef.current, decision]);
    // Claude's comment arrives in the background; the table never waits for it.
    void askCoach(handId, idx, decision);

    if (input.type === 'fold') {
      // The hand is over for the hero: finish it silently (villain cards stay hidden) and deal the next one.
      let s = next;
      while (!s.handOver) s = act(s, decide(s, s.toAct!));
      finalize(s, true);
      updateGame(s);
      setTimeout(() => {
        if (handIdRef.current === handId) startHand();
      }, AUTO_DEAL_DELAY);
      return;
    }
    updateGame(next);
  };

  const finalize = (g: GameState, heroFolded: boolean) => {
    if (ended && handIdRef.current === g.id) return;
    const shown = new Set<number>(!heroFolded && g.showdown ? g.players.filter((p) => !p.folded).map((p) => p.seat) : []);
    const result = heroNet(g);
    setEnded({ result, shown, heroFolded });
    if (handsRef.current.some((h) => h.id === g.id)) return;

    const record: HandRecord = {
      id: g.id,
      number: handNumber,
      timestamp: new Date().toISOString(),
      sb: g.sb,
      bb: g.bb,
      seats: g.players.map((p) => ({ seat: p.seat, name: p.name, position: p.position, stack: p.startStack, cards: p.cards, style: p.style })),
      heroSeat: g.heroSeat,
      buttonSeat: g.buttonSeat,
      board: g.board,
      actions: g.actions,
      heroDecisions: decisionsRef.current,
      result,
      showdown: !heroFolded && g.showdown,
      shownSeats: [...shown],
      winners: g.winners.map((w) => ({ seat: w.seat, amount: w.amount })),
    };
    setHands([...handsRef.current, record]);
    storeRef.current?.saveHand(record).catch(() => undefined);
    const newStats = addHand(statsRef.current, record);
    setStats(newStats);

    // A scorecard is worth it once the hero played past a single preflop decision.
    const playedOn = record.heroDecisions.length > 1 || record.heroDecisions.some((d) => d.street !== 'preflop');
    if (playedOn) void writeScorecard(record.id);
    const every = settingsRef.current.reviewEvery;
    if (newStats.hands > 0 && newStats.hands % every === 0) void runReview(true, record.id);
  };

  const writeScorecard = async (handId: number) => {
    setScorecard({ status: 'loading', text: '' });
    await Promise.allSettled(pendingRef.current.get(handId) ?? []);
    const rec = handsRef.current.find((h) => h.id === handId);
    if (!rec) return;
    const s = settingsRef.current;
    try {
      const md = await askMarkdown(scorecardPrompt({ sb: s.sb, bb: s.bb, stackBB: Math.round(s.startStack / s.bb), hand: rec }), (t) => {
        if (handIdRef.current === handId) setScorecard({ status: 'loading', text: t });
      });
      if (handIdRef.current === handId) setScorecard({ status: 'done', text: md });
      const latest = handsRef.current.find((h) => h.id === handId)!;
      const updated = { ...latest, scorecard: md };
      setHands(handsRef.current.map((h) => (h.id === handId ? updated : h)));
      storeRef.current?.saveHand(updated).catch(() => undefined);
    } catch {
      if (handIdRef.current === handId) setScorecard({ status: 'unavailable', text: '' });
    }
  };

  const runReview = async (auto: boolean, afterHandId?: number) => {
    // Offline: don't pop up an empty review; the user can still ask for one from Progress.
    if (auto && !(await getSample())) return;
    if (afterHandId) await Promise.allSettled(pendingRef.current.get(afterHandId) ?? []);
    const s = settingsRef.current;
    const st = statsRef.current;
    const last = handsRef.current.filter((h) => h.heroDecisions.length).slice(-s.reviewEvery);
    if (!last.length) return;
    const afterHand = handsRef.current[handsRef.current.length - 1]?.number ?? st.hands;
    setReview({ status: 'loading', text: '', afterHand });
    if (auto) setReviewOpen(true);
    try {
      const md = await askMarkdown(
        reviewPrompt({ sb: s.sb, bb: s.bb, stackBB: Math.round(s.startStack / s.bb), hands: last, stats: st, previous: st.reviews[st.reviews.length - 1] }),
        (t) => setReview({ status: 'loading', text: t, afterHand }),
      );
      setReview({ status: 'done', text: md, afterHand });
      const cur = statsRef.current;
      setStats({ ...cur, reviews: [...cur.reviews, { afterHand, timestamp: new Date().toISOString(), markdown: md }].slice(-30) });
    } catch {
      setReview({ status: 'unavailable', text: '', afterHand });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setSettingsOpen(false);
      setReviewOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ------------------------------------------------ export ------------------------------------------------ */

  const [canDownload, setCanDownload] = useState(false);
  useEffect(() => {
    if (window.claude?.use) window.claude.use('downloads').then((d) => setCanDownload(!!d)).catch(() => undefined);
  }, []);

  const onExport = async (kind: 'txt' | 'json' | 'stats') => {
    const date = new Date().toISOString().slice(0, 10);
    const h = handsRef.current;
    const [name, data] =
      kind === 'txt'
        ? [`poker-trainer-hands-${date}.txt`, handsToText(h)]
        : kind === 'json'
          ? [`poker-trainer-hands-${date}.json`, JSON.stringify(h, null, 2)]
          : [`poker-trainer-stats-${date}.json`, JSON.stringify(statsRef.current, null, 2)];
    const r = await saveFile(name, data);
    flash(r === 'saved' ? `Saved ${name}` : r === 'declined' ? 'Download cancelled' : 'Downloads are not available here');
  };

  const onClear = async () => {
    await storeRef.current?.clear(handsRef.current).catch(() => undefined);
    setHands([]);
    setSessionStart(0);
    setStats(emptyStats());
    setReview(null);
    flash('All hands and stats deleted');
  };

  /* ------------------------------------------------ derived ------------------------------------------------ */

  const session = hands.slice(sessionStart);
  const tally = useMemo(() => {
    const ds = [...session.filter((h) => h.id !== game?.id).flatMap((h) => h.heroDecisions), ...decisions];
    return {
      decisions: ds.length,
      correct: ds.filter((d) => gradeOf(d)?.action_verdict === 'correct').length,
      net: session.reduce((t, h) => t + h.result, 0),
    };
  }, [session, decisions, game?.id]);

  const previous = useMemo(() => {
    const done = hands.filter((h) => h.id !== game?.id);
    return done.length > sessionStart ? done[done.length - 1] : null;
  }, [hands, game?.id, sessionStart]);

  const highlight = useMemo(() => {
    if (!settings.showHint || !game || mode !== 'play') return null;
    const hero = game.players[game.heroSeat];
    const label = handLabel(hero.cards);
    if (game.street === 'preflop' && game.toAct === game.heroSeat && !game.handOver) {
      return { label, text: recommend(situationFromState(game, game.heroSeat)).text };
    }
    return { label, text: 'Your current hand' };
  }, [settings.showHint, game, mode]);

  const log = useMemo(() => {
    if (!game) return [];
    const lines = logLines(game.players, game.actions, game.board);
    if (game.handOver && ended) {
      for (const seat of ended.shown) {
        const p = game.players[seat];
        if (!p.isHero) lines.push(`${p.position}: shows [${p.cards.map(cardPretty).join(' ')}]`);
      }
      if (ended.heroFolded) lines.push('You folded — the rest of the hand is hidden.');
      else for (const w of game.winners) lines.push(`${game.players[w.seat].isHero ? 'You' : game.players[w.seat].position} collected ${fmt(w.amount)}`);
    }
    return lines;
  }, [game, ended]);

  const heroTurn = !!game && !game.handOver && !ended && game.toAct === game.heroSeat;

  /* ------------------------------------------------ render ------------------------------------------------ */

  return (
    <div className={`app${chartOpen ? ' with-chart' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            ♠
          </span>
          <span className="brand-name">Poker Trainer</span>
          <span className="stakes">
            {fmt(settings.sb)}/{fmt(settings.bb)} · 6-max
          </span>
        </div>
        <nav className="tabs" aria-label="Mode">
          <button className={mode === 'play' ? 'on' : ''} onClick={() => setMode('play')}>
            Play
          </button>
          <button className={mode === 'drill' ? 'on' : ''} onClick={() => setMode('drill')}>
            Preflop drill
          </button>
        </nav>
        <div className="top-actions">
          <button className={`top-btn${chartOpen ? ' on' : ''}`} onClick={() => setChartOpen(!chartOpen)} aria-pressed={chartOpen}>
            Chart
          </button>
          <button className="top-btn" onClick={() => setReviewOpen(true)}>
            Progress
          </button>
          <button className="top-btn" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
        </div>
      </header>

      {coachOnline === false ? (
        <p className="banner">Coach unavailable here: hands still deal and your decisions are logged. Open the app in claude.ai to get coaching.</p>
      ) : null}

      <main className="layout">
        {chartOpen ? <RangeChart onClose={() => setChartOpen(false)} highlight={highlight} /> : null}

        {mode === 'drill' ? (
          <div className="center">
            <PreflopDrill
              fourColor={settings.fourColor}
              onBatchDone={(correct, total) => {
                const cur = statsRef.current;
                setStats({ ...cur, drill: { batches: cur.drill.batches + 1, questions: cur.drill.questions + total, correct: cur.drill.correct + correct } });
              }}
            />
          </div>
        ) : (
          <>
            <div className="center">
              {game ? (
                <Table game={game} fourColor={settings.fourColor} shown={ended?.shown ?? new Set()} ended={!!ended} dealtFrom={dealtFrom} />
              ) : (
                <div className="loading">Shuffling up and dealing…</div>
              )}
              {game && heroTurn ? (
                <ActionPanel game={game} onSubmit={onHeroAction} />
              ) : null}
              {game && ended && ended.heroFolded ? <p className="waiting">You folded. Dealing the next hand…</p> : null}
              {game && ended && !ended.heroFolded ? (
                <div className="hand-end">
                  <p>
                    Hand complete.{' '}
                    <b className={ended.result >= 0 ? 'pos' : 'neg'}>
                      {ended.result >= 0 ? '+' : ''}
                      {fmt(ended.result)}
                    </b>
                  </p>
                  <button className="btn raise" onClick={() => startHand()} autoFocus>
                    Next hand
                  </button>
                </div>
              ) : null}
              {game && !heroTurn && !ended ? <p className="waiting">Villains are acting…</p> : null}
              <details className="log">
                <summary>Hand history</summary>
                <pre>{log.join('\n')}</pre>
              </details>
            </div>
            <CoachPanel
              handNumber={handNumber}
              decisions={decisions}
              scorecard={scorecard}
              result={ended && !ended.heroFolded ? ended.result : null}
              previous={previous}
              tally={tally}
              onRetry={(handId, i) => {
                if (handId === null) askCoach(handIdRef.current, i, decisionsRef.current[i]);
                else {
                  const rec = handsRef.current.find((h) => h.id === handId);
                  if (rec) askCoach(handId, i, rec.heroDecisions[i]);
                }
              }}
            />
          </>
        )}
      </main>

      {settingsOpen ? (
        <SettingsPanel
          settings={settings}
          storeKind={store?.kind ?? 'local'}
          canDownload={canDownload}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
          onExport={onExport}
          onClear={onClear}
        />
      ) : null}
      {reviewOpen ? <ReviewModal stats={stats} review={review} onRequest={() => runReview(false)} onClose={() => setReviewOpen(false)} /> : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
