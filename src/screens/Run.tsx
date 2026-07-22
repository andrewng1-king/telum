import { useRef, useState, useSyncExternalStore } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActiveRun } from '../db/db';
import type { Go } from '../App';
import { fmtClock, fmtKm, fmtPace } from '../lib/format';
import { currentPaceSec, resumeRun, runTrackerState, startRun, stopRun, subscribeRun } from '../lib/run';
import { useNow, useWakeLock } from '../lib/ui';

export function Run({ go }: { go: Go }) {
  const st = useSyncExternalStore(subscribeRun, runTrackerState);
  const now = useNow(1000);
  useWakeLock(st.status !== 'idle');
  const [locked, setLocked] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const orphan = useLiveQuery(getActiveRun);

  const finish = async (discard: boolean) => {
    const id = await stopRun(discard);
    setLocked(false);
    setConfirmEnd(false);
    if (id != null) go('runsummary', id);
    else go('today');
  };

  /* ---------- idle: start / resume ---------- */
  if (st.status === 'idle') {
    return (
      <section className="screen" aria-label="Run">
        <div className="head l">
          <button className="ic" aria-label="Back" onClick={() => go('today')}>
            <svg width="17" height="17" viewBox="0 0 17 17">
              <path d="M11 3L5.5 8.5 11 14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <span className="t">Run</span>
        </div>

        {orphan ? (
          <div className="empty">
            <div className="big">Run interrupted</div>
            <p>{fmtKm(orphan.distanceM)} km · {fmtClock(Math.round(orphan.movingSec))} on the clock. Pick it back up — the gap won’t count.</p>
            <button className="btn" onClick={() => resumeRun(orphan)}>Resume run</button>
            <div style={{ height: 10 }} />
            <button className="btn danger" onClick={async () => { resumeRun(orphan); await finish(orphan.distanceM < 50); }}>
              {orphan.distanceM < 50 ? 'Discard it' : 'End it now · save'}
            </button>
          </div>
        ) : (
          <div className="empty">
            <svg width="34" height="34" viewBox="0 0 22 22" style={{ color: 'var(--ember)', display: 'inline-block' }}>
              <circle cx="14.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.7" fill="none" />
              <path d="M8 8.5l3.5-2 3 3.5-3 2.5 1 5M11.5 6.5L8 6l-2.5 3M12.5 12.5L7 20M12.5 10l3.5 1.5 2.5-1" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <div className="big">GPS run</div>
            <p>
              Pace, distance and km splits, plus a route card for the feed.
              The screen stays on for the whole run — iOS stops GPS for web apps when it locks. Battery says hi.
            </p>
            <button className="btn" onClick={() => startRun()}>Start run</button>
          </div>
        )}
        {st.error && <p style={{ color: 'var(--ember-deep)', fontSize: 12.5, textAlign: 'center' }}>{st.error}</p>}
      </section>
    );
  }

  /* ---------- live telemetry ---------- */
  const acquiring = st.status === 'acquiring';
  const extra = !acquiring && !st.paused && st.lastMovingAt ? Math.min(30, (now - st.lastMovingAt) / 1000) : 0;
  const clockSec = Math.floor(st.movingSec + extra);
  const curPace = currentPaceSec();
  const avgPace = st.distanceM >= 100 ? (st.movingSec / st.distanceM) * 1000 : 0;

  return (
    <section className="screen" aria-label="Run live">
      <div className="lift-top">
        <span className="pill emb">
          {acquiring ? '◌ Acquiring GPS…' : st.paused ? '❚❚ Auto-paused' : '● Run · Live'}
        </span>
        <span className="pill">{st.accuracy != null ? `GPS ±${Math.round(st.accuracy)}m` : 'GPS —'}</span>
      </div>

      <div className="runhero">
        <div className="k">Distance</div>
        <div className="v"><span className="num disp">{fmtKm(st.distanceM)}</span><small> km</small></div>
      </div>

      <div className="prg" style={{ marginTop: 4 }}>
        <div className="prc"><div className="k">Pace · now</div><div className="v num">{fmtPace(curPace)} <u>/km</u></div></div>
        <div className="prc"><div className="k">Pace · avg</div><div className="v num">{fmtPace(avgPace)} <u>/km</u></div></div>
        <div className="prc"><div className="k">Moving time</div><div className="v num">{fmtClock(clockSec)}</div></div>
        <div className="prc"><div className="k">Splits</div><div className="v num">{st.splits.length} <u>km</u></div></div>
      </div>

      {st.splits.length > 0 && (
        <div className="chips" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
          {st.splits.slice(-4).map((s, i, arr) => (
            <div key={st.splits.length - arr.length + i} className="chip done" style={{ flex: '1 0 20%' }}>
              <span className="cn">KM {st.splits.length - arr.length + i + 1}</span>
              {fmtPace(s)}
            </div>
          ))}
        </div>
      )}

      <div className="lift-actions">
        <button className="btn ghost" onClick={() => setLocked(true)}>
          Lock screen
          <svg width="15" height="15" viewBox="0 0 15 15">
            <rect x="3" y="6.5" width="9" height="6" rx="1.6" stroke="currentColor" strokeWidth="1.7" fill="none" />
            <path d="M5 6.5V5a2.5 2.5 0 015 0v1.5" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" />
          </svg>
        </button>
        <button className={confirmEnd ? 'btn danger' : 'btn'} onClick={() => (confirmEnd ? finish(false) : setConfirmEnd(true))}>
          {confirmEnd ? 'Tap again to end' : 'End run'}
        </button>
      </div>
      {confirmEnd && (
        <button className="btn ghost" onClick={() => setConfirmEnd(false)}>Keep running</button>
      )}

      {st.error && <p style={{ color: 'var(--ember-deep)', fontSize: 12.5 }}>{st.error}</p>}

      {locked && (
        <LockOverlay
          distance={fmtKm(st.distanceM)}
          pace={fmtPace(curPace)}
          clock={fmtClock(clockSec)}
          paused={st.paused}
          onUnlock={() => setLocked(false)}
        />
      )}
    </section>
  );
}

/* ---------- pocket-proof lock overlay ---------- */
function LockOverlay({ distance, pace, clock, paused, onUnlock }: {
  distance: string; pace: string; clock: string; paused: boolean; onUnlock: () => void;
}) {
  const timer = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);
  const down = () => {
    setHolding(true);
    timer.current = window.setTimeout(onUnlock, 700);
  };
  const up = () => {
    setHolding(false);
    if (timer.current != null) { clearTimeout(timer.current); timer.current = null; }
  };
  return (
    <div className="lockov" role="dialog" aria-label="Locked run screen">
      <span className="eyebrow">{paused ? 'Auto-paused' : 'Run · live'}</span>
      <div className="d num disp">{distance}<small> km</small></div>
      <div className="p num">{pace} /km · {clock}</div>
      <button
        className={`holdbtn${holding ? ' holding' : ''}`}
        onPointerDown={down}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
      >
        Hold to unlock
      </button>
    </div>
  );
}
