"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CubeSize, generateScramble } from "./lib/scrambles";

type TimerState = "idle" | "holding" | "armed" | "running" | "stopped";
type Solve = { id: string; size: CubeSize; timeMs: number; scramble: string; createdAt: number };

const STORAGE_KEY = "cubedesk.solves.v1";
const SIZE_KEY = "cubedesk.size.v1";
const HOLD_MS = 1000;
const sizes: CubeSize[] = [3, 4, 5, 6, 7];

function formatTime(ms: number) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${minutes ? `${minutes}:` : ""}${minutes ? String(seconds).padStart(2, "0") : seconds}.${String(hundredths).padStart(2, "0")}`;
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function rollingAverage(values: number[], count: number) {
  if (values.length < count) return null;
  const window = values.slice(-count).sort((a, b) => a - b);
  return average(window.slice(1, -1));
}

function TrendChart({ solves }: { solves: Solve[] }) {
  const values = solves.slice(-30).reverse();
  if (values.length < 2) return <div className="chart-empty">Complete two solves to reveal your trend.</div>;
  const min = Math.min(...values.map((solve) => solve.timeMs));
  const max = Math.max(...values.map((solve) => solve.timeMs));
  const range = Math.max(max - min, 1000);
  const points = values.map((solve, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 12 + ((max - solve.timeMs) / range) * 72;
    return `${x},${y}`;
  }).join(" ");
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Solve time trend from ${formatTime(values[0].timeMs)} to ${formatTime(values.at(-1)!.timeMs)}`}>
        <line x1="0" y1="84" x2="100" y2="84" className="grid-line" />
        <line x1="0" y1="48" x2="100" y2="48" className="grid-line" />
        <polyline points={points} className="trend-area" />
        <polyline points={points} className="trend-line" />
      </svg>
      <div className="chart-labels"><span>{formatTime(min)} best</span><span>last {values.length} solves</span></div>
    </div>
  );
}

export default function Home() {
  const [size, setSize] = useState<CubeSize>(3);
  const [scramble, setScramble] = useState("");
  const [solves, setSolves] = useState<Solve[]>([]);
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [displayMs, setDisplayMs] = useState(0);
  const [ready, setReady] = useState(false);
  const [undoSolve, setUndoSolve] = useState<Solve | null>(null);
  const stateRef = useRef<TimerState>("idle");
  const startRef = useRef(0);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const pointerRef = useRef<number | null>(null);

  const updateState = useCallback((next: TimerState) => {
    stateRef.current = next;
    setTimerState(next);
  }, []);

  useEffect(() => {
    let storedSolves: Solve[] = [];
    let storedSize: CubeSize | null = null;
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) storedSolves = stored.filter((item) => item && sizes.includes(item.size) && Number.isFinite(item.timeMs));
      const savedSize = Number(localStorage.getItem(SIZE_KEY));
      if (sizes.includes(savedSize as CubeSize)) storedSize = savedSize as CubeSize;
    } catch { /* Ignore malformed local data and start clean. */ }
    queueMicrotask(() => {
      setSolves(storedSolves);
      if (storedSize) setSize(storedSize);
      setScramble(generateScramble(storedSize || 3));
      setReady(true);
    });
  }, []);

  useEffect(() => { if (ready) try { localStorage.setItem(STORAGE_KEY, JSON.stringify(solves)); } catch { /* Storage may be unavailable in private browsing. */ } }, [solves, ready]);
  useEffect(() => { if (ready) try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* Keep the timer usable without persistence. */ } }, [size, ready]);

  const cancelHold = useCallback(() => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    holdTimerRef.current = null;
    if (stateRef.current === "holding" || stateRef.current === "armed") updateState("idle");
  }, [updateState]);

  const beginHold = useCallback(() => {
    if (stateRef.current !== "idle" && stateRef.current !== "stopped") return;
    updateState("holding");
    holdTimerRef.current = setTimeout(() => {
      if (stateRef.current === "holding") updateState("armed");
    }, HOLD_MS);
  }, [updateState]);

  const startTimer = useCallback(() => {
    if (stateRef.current !== "armed") { cancelHold(); return; }
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    startRef.current = performance.now();
    setDisplayMs(0);
    updateState("running");
    const tick = () => {
      setDisplayMs(performance.now() - startRef.current);
      animationRef.current = requestAnimationFrame(tick);
    };
    animationRef.current = requestAnimationFrame(tick);
  }, [cancelHold, updateState]);

  const stopTimer = useCallback(() => {
    if (stateRef.current !== "running") return;
    const finalMs = Math.max(10, Math.round(performance.now() - startRef.current));
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    setDisplayMs(finalMs);
    const solve: Solve = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, size, timeMs: finalMs, scramble, createdAt: Date.now() };
    setSolves((previous) => [solve, ...previous]);
    updateState("stopped");
    setScramble(generateScramble(size));
  }, [scramble, size, updateState]);

  useEffect(() => {
    const isControl = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("button, select, input, textarea, [contenteditable=true]"));
    const down = (event: KeyboardEvent) => {
      if (event.code !== "Space" || event.repeat || isControl(event.target)) return;
      event.preventDefault();
      if (stateRef.current === "running") stopTimer(); else beginHold();
    };
    const up = (event: KeyboardEvent) => {
      if (event.code !== "Space" || isControl(event.target)) return;
      event.preventDefault();
      if (stateRef.current === "armed") startTimer(); else if (stateRef.current === "holding") cancelHold(); else if (stateRef.current === "stopped") updateState("idle");
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", cancelHold);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", cancelHold); };
  }, [beginHold, cancelHold, startTimer, stopTimer, updateState]);

  useEffect(() => () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, []);

  useEffect(() => {
    const visibility = () => { if (document.hidden) cancelHold(); };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (stateRef.current === "running") { event.preventDefault(); event.returnValue = ""; }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("beforeunload", beforeUnload);
    return () => { document.removeEventListener("visibilitychange", visibility); window.removeEventListener("beforeunload", beforeUnload); };
  }, [cancelHold]);

  const currentSolves = useMemo(() => solves.filter((solve) => solve.size === size), [solves, size]);
  const times = currentSolves.map((solve) => solve.timeMs).reverse();
  const best = times.length ? Math.min(...times) : null;
  const mean = average(times);
  const ao5 = rollingAverage(times, 5);
  const ao12 = rollingAverage(times, 12);

  const deleteSolve = (solve: Solve) => { setSolves((all) => all.filter((item) => item.id !== solve.id)); setUndoSolve(solve); };
  const undoDelete = () => { if (undoSolve) { setSolves((all) => [undoSolve, ...all]); setUndoSolve(null); } };
  const status = timerState === "holding" ? "Keep holding…" : timerState === "armed" ? "Ready — release to start" : timerState === "running" ? "Press Space to stop" : timerState === "stopped" ? "Saved — hold Space for the next solve" : "Hold Space for 1 second";

  const pointerDown = (event: React.PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    pointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    if (stateRef.current === "running") stopTimer(); else beginHold();
  };
  const pointerUp = (event: React.PointerEvent) => {
    if (pointerRef.current !== event.pointerId) return;
    pointerRef.current = null;
    if (stateRef.current === "armed") startTimer(); else if (stateRef.current === "holding") cancelHold(); else if (stateRef.current === "stopped") updateState("idle");
  };

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#timer" aria-label="CubeDesk home"><span className="mark"><i /><i /><i /></span><span>Cube<span>Desk</span></span></a>
        <nav className="event-picker" aria-label="Cube size">
          {sizes.map((cubeSize) => <button key={cubeSize} className={size === cubeSize ? "active" : ""} disabled={timerState === "running"} onClick={() => { setSize(cubeSize); setScramble(generateScramble(cubeSize)); }}>{cubeSize}×{cubeSize}</button>)}
        </nav>
        <div className="local-badge"><span /> Saved locally</div>
      </header>

      <section id="timer" className="timer-shell">
        <div className="scramble-row">
          <div><span className="eyebrow">CURRENT SCRAMBLE</span><span className="event-label">{size}×{size} CUBE</span></div>
          <button className="icon-button" disabled={timerState === "running"} onClick={() => setScramble(generateScramble(size))} aria-label="Generate new scramble">↻</button>
        </div>
        <p className="scramble">{scramble}</p>
        <div className={`timer-pad state-${timerState}`} onPointerDown={pointerDown} onPointerUp={pointerUp} onPointerCancel={cancelHold}>
          <div className="timer-glow" />
          <div className="timer-value">{formatTime(displayMs)}</div>
          <div className="timer-status"><span className="status-dot" /> {status}</div>
          <div className="hold-track"><div /></div>
        </div>
        <button className="alternate-button" onClick={() => { if (stateRef.current === "running") stopTimer(); else { updateState("armed"); startTimer(); } }}>{timerState === "running" ? "Stop timer" : "Start without holding"}</button>
        <div className="key-hint"><kbd>SPACE</kbd><span>Hold to ready</span><span className="sep">•</span><kbd>SPACE</kbd><span>Stop instantly</span></div>
      </section>

      <section className="dashboard">
        <div className="stats-panel panel">
          <div className="section-heading"><div><span className="eyebrow">SESSION OVERVIEW</span><h2>Your pace</h2></div><span className="solve-count">{currentSolves.length} SOLVES</span></div>
          <div className="stat-grid">
            <div className="stat featured"><span>BEST SINGLE</span><strong>{best === null ? "—" : formatTime(best)}</strong><small>{best === null ? "Set your benchmark" : "Session record"}</small></div>
            <div className="stat"><span>SESSION MEAN</span><strong>{mean === null ? "—" : formatTime(mean)}</strong><small>All solves</small></div>
            <div className="stat"><span>CURRENT AO5</span><strong>{ao5 === null ? "—" : formatTime(ao5)}</strong><small>Trimmed average</small></div>
            <div className="stat"><span>CURRENT AO12</span><strong>{ao12 === null ? "—" : formatTime(ao12)}</strong><small>Trimmed average</small></div>
          </div>
          <div className="chart-heading"><span>TIME TREND</span><span>lower is faster</span></div>
          <TrendChart solves={currentSolves} />
        </div>

        <div className="history-panel panel">
          <div className="section-heading"><div><span className="eyebrow">RECENT SOLVES</span><h2>History</h2></div>{currentSolves.length > 0 && <button className="text-button" onClick={() => confirm(`Delete all ${size}×${size} solves?`) && setSolves((all) => all.filter((solve) => solve.size !== size))}>Clear all</button>}</div>
          <div className="history-list">
            {currentSolves.length === 0 ? <div className="empty-history"><span>◎</span><strong>No solves yet</strong><p>Your completed times will appear here.</p></div> : currentSolves.slice(0, 8).map((solve, index) => (
              <article className="solve-row" key={solve.id}>
                <span className="solve-rank">{String(currentSolves.length - index).padStart(2, "0")}</span>
                <div><strong>{formatTime(solve.timeMs)}</strong><time dateTime={new Date(solve.createdAt).toISOString()}>{new Date(solve.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</time></div>
                <details><summary aria-label="Show scramble">Scramble</summary><p>{solve.scramble}</p></details>
                <button className="delete-button" onClick={() => deleteSolve(solve)} aria-label={`Delete solve ${formatTime(solve.timeMs)}`}>×</button>
              </article>
            ))}
          </div>
        </div>
      </section>
      <footer><span>CubeDesk <b>•</b> Your data stays on this device</span><span>{size}×{size} session</span></footer>
      <div className="sr-only" aria-live="polite">{status}</div>
      {undoSolve && <div className="toast">Solve deleted <button onClick={undoDelete}>Undo</button><button aria-label="Dismiss" onClick={() => setUndoSolve(null)}>×</button></div>}
    </main>
  );
}
