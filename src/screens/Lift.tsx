import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getActiveWorkout } from '../db/db';
import type { Go } from '../App';
import type { SetRow, Workout, WorkoutExercise } from '../types';
import { fmtClock, fmtRest, fmtTonnes, fmtW } from '../lib/format';
import { getExerciseHistory, prToastText, setVolume, targetFor } from '../lib/stats';
import { addSet, discardWorkout, finishWorkout, logSet, platesFor, skipToNext, swapVariant } from '../lib/workout';
import { EQUIP_LABEL, FAMILY_LABEL, familyVariants } from '../db/exercises';
import { primeAudio, restChime, toastBus, useNow, useWakeLock } from '../lib/ui';
import { Sheet } from '../components/Sheet';

export function Lift({ go }: { go: Go }) {
  // null = confirmed no active session; undefined = still loading
  const workout = useLiveQuery(async () => (await getActiveWorkout()) ?? null);
  useWakeLock(!!workout);

  if (workout === undefined) return <section className="screen" />;
  if (workout === null) return <NoSession go={go} />;
  return <LiveSession workout={workout} go={go} />;
}

/* ---------- idle state ---------- */
function NoSession({ go }: { go: Go }) {
  return (
    <section className="screen" aria-label="Workout">
      <div className="head">
        <span className="t">Lift</span>
      </div>
      <div className="empty">
        <svg width="34" height="34" viewBox="0 0 22 22" style={{ color: 'var(--ember)', display: 'inline-block' }}>
          <path d="M5 8v6M3 9v4M17 8v6M19 9v4M6.5 11h9" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" />
        </svg>
        <div className="big">No live session</div>
        <p>Start today’s workout and this screen becomes your set-by-set cockpit — big numbers, rest timer, PR alerts.</p>
        <button className="btn" onClick={() => go('today')}>
          Go to Today
          <svg width="17" height="17" viewBox="0 0 17 17">
            <path d="M5 3l6 5.5L5 14" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </section>
  );
}

/* ---------- live session ---------- */
function LiveSession({ workout, go }: { workout: Workout; go: Go }) {
  const now = useNow(1000);
  const [showFinish, setShowFinish] = useState(false);
  const [showPlates, setShowPlates] = useState(false);
  const [showVariants, setShowVariants] = useState(false);

  const sets = useLiveQuery(
    () => db.sets.where('workoutId').equals(workout.id!).toArray(),
    [workout.id],
  );

  const ex = workout.exercises[Math.min(workout.curExIdx, workout.exercises.length - 1)];

  const hist = useLiveQuery(
    () => getExerciseHistory(ex.exerciseId, workout.id),
    [ex.exerciseId, workout.id],
  );

  const settings = useLiveQuery(() => db.settings.get(1));

  // per-exercise logged counts
  const counts = useMemo(() => {
    const m = new Map<string, { warm: number; work: number }>();
    for (const s of sets ?? []) {
      const c = m.get(s.exerciseId) ?? { warm: 0, work: 0 };
      if (s.type === 'warmup') c.warm++; else c.work++;
      m.set(s.exerciseId, c);
    }
    return m;
  }, [sets]);

  const exSets = useMemo(
    () => (sets ?? []).filter((s) => s.exerciseId === ex.exerciseId).sort((a, b) => a.loggedAt - b.loggedAt),
    [sets, ex.exerciseId],
  );
  const warmDone = exSets.filter((s) => s.type === 'warmup').length;
  const workDone = exSets.filter((s) => s.type === 'working').length;
  const isWarm = warmDone < ex.warmupSets;
  const setIdx = isWarm ? warmDone : workDone;
  const exComplete = !isWarm && workDone >= ex.workingSets;

  // target for the coming set
  const target = useMemo(() => {
    if (!hist) return null;
    if (isWarm) return null;
    return targetFor(hist, setIdx, ex, ex.incrementKg);
  }, [hist, isWarm, setIdx, ex]);

  // ---- steppers, prefilled per set-slot ----
  const [w, setW] = useState(0);
  const [r, setR] = useState(0);
  const slotKey = `${workout.id}:${ex.exerciseId}:${isWarm ? 'w' : 's'}${setIdx}`;
  const prefilled = useRef('');
  useEffect(() => {
    if (!hist || prefilled.current === slotKey) return;
    prefilled.current = slotKey;
    if (isWarm) {
      const base = targetFor(hist, 0, ex, ex.incrementKg).w
        ?? exSets.find((s) => s.type === 'working')?.weightKg ?? 40;
      const half = Math.max(ex.equipment === 'barbell' ? (settings?.barKg ?? 20) : ex.incrementKg,
        Math.round((base * 0.5) / ex.incrementKg) * ex.incrementKg);
      setW(half);
      setR(12);
    } else {
      const lastWorking = [...exSets].reverse().find((s) => s.type === 'working');
      setW(target?.w ?? lastWorking?.weightKg ?? (ex.equipment === 'barbell' ? (settings?.barKg ?? 20) : 10));
      setR(target?.r ?? ex.repMin);
    }
  }, [hist, slotKey, isWarm, target, ex, exSets, settings?.barKg]);

  // ---- rest timer ----
  const restLeft = workout.restEndsAt ? (workout.restEndsAt - now) / 1000 : null;
  const chimed = useRef<number>(0);
  useEffect(() => {
    if (workout.restEndsAt && workout.restEndsAt <= now && chimed.current !== workout.restEndsAt) {
      chimed.current = workout.restEndsAt;
      restChime();
      void db.workouts.update(workout.id!, { restEndsAt: null });
    }
  }, [now, workout.restEndsAt, workout.id]);

  const onLog = async () => {
    primeAudio();
    const res = await logSet(workout, w, r);
    // a club crossing outranks the PR toast — it's the rarer milestone
    if (res.club) toastBus.show(`🏛 ${res.club.step} kg club · ${res.club.label}`);
    else if (res.prs.length > 0) toastBus.show(prToastText(res.prs, w, r));
  };

  const doneCount = workout.exercises.filter((e) => {
    const c = counts.get(e.exerciseId) ?? { warm: 0, work: 0 };
    return c.warm >= e.warmupSets && c.work >= e.workingSets;
  }).length;

  // next-up card: next incomplete exercise after current
  const nextEx = (() => {
    const n = workout.exercises.length;
    for (let step = 1; step < n; step++) {
      const i = (workout.curExIdx + step) % n;
      const e = workout.exercises[i];
      const c = counts.get(e.exerciseId) ?? { warm: 0, work: 0 };
      if (c.warm < e.warmupSets || c.work < e.workingSets) return { e, i };
    }
    return null;
  })();

  const totalVolume = (sets ?? []).filter((s) => s.type === 'working').reduce((a, s) => a + setVolume(s), 0);
  const elapsed = Math.floor((now - workout.startedAt) / 1000);

  return (
    <section className="screen" aria-label="Workout">
      <div className="lift-top">
        <span className="pill emb">● {workout.dayName} · Live</span>
        <span className="clock num">{fmtClock(elapsed)}</span>
      </div>

      <div className="seg" aria-label="progress">
        {workout.exercises.map((e, i) => {
          const c = counts.get(e.exerciseId) ?? { warm: 0, work: 0 };
          const complete = c.warm >= e.warmupSets && c.work >= e.workingSets;
          return <span key={i} className={i === workout.curExIdx ? 'cur' : complete ? 'done' : ''} />;
        })}
      </div>

      <div className="now">
        <div className="toprow">
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
            <span className="pill amb">{ex.label}</span>
            {familyVariants(ex.exerciseId).length > 1 && (
              <button className="pill eqp" onClick={() => setShowVariants(true)} aria-label="Switch equipment variant">
                {EQUIP_LABEL[ex.equipment]} ⌄
              </button>
            )}
          </div>
          <span className="eyebrow">Exercise {workout.curExIdx + 1} / {workout.exercises.length}</span>
        </div>
        <h3>{ex.name}</h3>
        <div className="target">
          <span>Range <b>{ex.workingSets} × {ex.repMin}–{ex.repMax}</b></span>
          <span>Rest <b>{ex.restSec}s</b></span>
          {ex.warmupSets > 0 && (
            <span>Warm-up <b>{warmDone >= ex.warmupSets ? 'done' : `${warmDone}/${ex.warmupSets}`}</b></span>
          )}
        </div>

        <div
          className="bigset"
          onClick={() => { if (ex.equipment === 'barbell') setShowPlates(true); }}
          role={ex.equipment === 'barbell' ? 'button' : undefined}
          aria-label={ex.equipment === 'barbell' ? 'Plate math' : undefined}
        >
          <span className="w num disp">{fmtW(w)}</span>
          <span className="u">kg{ex.perHand ? ' · each' : ''}</span>
          <span className="x num">× {r}</span>
        </div>

        <div className="steppers" aria-label="Adjust weight and reps">
          <div className="stp">
            <button aria-label={`minus ${ex.incrementKg} kg`} onClick={() => setW((v) => Math.max(0, +(v - ex.incrementKg).toFixed(2)))}>−</button>
            <span className="k">KG<br />±{fmtW(ex.incrementKg)}</span>
            <button aria-label={`plus ${ex.incrementKg} kg`} onClick={() => setW((v) => +(v + ex.incrementKg).toFixed(2))}>+</button>
          </div>
          <div className="stp">
            <button aria-label="minus 1 rep" onClick={() => setR((v) => Math.max(0, v - 1))}>−</button>
            <span className="k">Reps<br />±1</span>
            <button aria-label="plus 1 rep" onClick={() => setR((v) => v + 1)}>+</button>
          </div>
        </div>

        {isWarm ? (
          <span className="pill tgt">Warm-up {warmDone + 1} of {ex.warmupSets} · light & crisp</span>
        ) : target ? (
          <span className="pill tgt">
            {target.w != null ? `Target ${fmtW(target.w)} × ${target.r} · ${target.note}` : target.note}
          </span>
        ) : null}

        <SetChips ex={ex} exSets={exSets} curW={w} curR={r} isWarm={isWarm} setIdx={setIdx} exComplete={exComplete} />
      </div>

      {restLeft !== null && restLeft > 0 && (
        <div className="rest" aria-live="polite">
          <div className="rc">
            <svg width="52" height="52" viewBox="0 0 52 52">
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--hair-2)" strokeWidth="4" />
              <circle cx="26" cy="26" r="22" fill="none" stroke="var(--ember)" strokeWidth="4" strokeLinecap="round"
                transform="rotate(-90 26 26)" strokeDasharray="138"
                strokeDashoffset={138 * (1 - Math.max(0, Math.min(1, restLeft / workout.restTotalSec)))} />
            </svg>
            <span className="t num">{fmtRest(restLeft)}</span>
          </div>
          <div className="info">
            <div className="k">{workout.restLabel || 'Rest'}</div>
            <div className="v">{isWarm ? `Warm-ups rest ${ex.warmupRestSec}s only` : 'Shake it out · breathe'}</div>
          </div>
          <button className="add" onClick={() => db.workouts.update(workout.id!, { restEndsAt: workout.restEndsAt! + 15_000 })}>+15s</button>
          <button className="add" onClick={() => db.workouts.update(workout.id!, { restEndsAt: null })}>Skip</button>
        </div>
      )}

      <div className="lift-actions">
        <button className={`btn${exComplete ? ' logged' : ''}`} onClick={onLog} disabled={r <= 0}>
          {exComplete ? `Log extra set ${workDone + 1}` : isWarm ? `Log Warm-up ${warmDone + 1}` : `Log Set ${workDone + 1}`}
        </button>
        <button className="btn ghost" onClick={() => skipToNext(workout)}>
          Next
          <svg width="15" height="15" viewBox="0 0 15 15">
            <path d="M5 3l5 4.5L5 12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {nextEx && (
        <div className="nextup">
          <div>
            <div className="np">
              {nextEx.e.supersetGroup && nextEx.e.supersetGroup === ex.supersetGroup
                ? `Up next · superset ${nextEx.e.supersetGroup}2`
                : 'Up next'}
            </div>
            <div className="nm">{nextEx.e.name}</div>
            <div className="mu">
              {nextEx.e.workingSets} × {nextEx.e.repMin}–{nextEx.e.repMax}
              {nextEx.e.supersetGroup && nextEx.e.supersetGroup === ex.supersetGroup ? ` · linked with ${ex.name}` : ` · ${nextEx.e.label}`}
            </div>
          </div>
          <span className="a">
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M6 4l6 5-6 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      )}

      <button className="btn ghost finish" onClick={() => setShowFinish(true)}>
        Finish workout · Summary
        <svg width="15" height="15" viewBox="0 0 15 15">
          <path d="M3 13V2h8l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <div className="fabrail" aria-label="Quick actions">
        <button className="fab" aria-label="Add set" onClick={() => addSet(workout)}>
          <svg width="22" height="22" viewBox="0 0 22 22">
            <path d="M11 5v12M5 11h12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {showFinish && (
        <FinishSheet
          workout={workout}
          elapsed={elapsed}
          volume={totalVolume}
          setCount={(sets ?? []).length}
          doneCount={doneCount}
          onClose={() => setShowFinish(false)}
          go={go}
        />
      )}
      {showPlates && settings && (
        <PlatesSheet totalKg={w} barKg={settings.barKg} onClose={() => setShowPlates(false)} />
      )}
      {showVariants && (
        <VariantSheet workout={workout} curId={ex.exerciseId} onClose={() => setShowVariants(false)} />
      )}
    </section>
  );
}

/* ---------- equipment variant picker ---------- */
function VariantSheet({ workout, curId, onClose }: { workout: Workout; curId: string; onClose: () => void }) {
  const variants = familyVariants(curId);
  const fam = variants[0]?.family;
  return (
    <Sheet title={fam ? FAMILY_LABEL[fam] ?? 'Variants' : 'Variants'} onClose={onClose}>
      <span className="eyebrow" style={{ display: 'block', margin: '0 2px 10px' }}>
        Each variant keeps its own history, targets and PRs
      </span>
      {variants.map((v) => (
        <button
          key={v.id}
          className={`opt${v.id === curId ? ' sel' : ''}`}
          onClick={async () => {
            if (v.id !== curId) await swapVariant(workout, v.id);
            onClose();
          }}
        >
          <div>
            <div className="nm">{v.name}</div>
            <div className="mu">{EQUIP_LABEL[v.equipment]}{v.perHand ? ' · weight per hand' : ''}</div>
          </div>
          <span className="r">{v.id === curId ? 'Current' : 'Switch'}</span>
        </button>
      ))}
    </Sheet>
  );
}

/* ---------- set chips ---------- */
function SetChips({ ex, exSets, curW, curR, isWarm, setIdx, exComplete }: {
  ex: WorkoutExercise; exSets: SetRow[]; curW: number; curR: number;
  isWarm: boolean; setIdx: number; exComplete: boolean;
}) {
  const warm = exSets.filter((s) => s.type === 'warmup');
  const work = exSets.filter((s) => s.type === 'working');
  const chips: { key: string; cls: string; cn: string; body: string }[] = [];

  for (let i = 0; i < ex.warmupSets; i++) {
    const s = warm[i];
    const cur = isWarm && i === setIdx;
    chips.push({
      key: `w${i}`,
      cls: cur ? 'chip warm cur' : 'chip warm',
      cn: ex.warmupSets > 1 ? `W${i + 1}` : 'W',
      body: s ? `${fmtW(s.weightKg)}×${s.reps}` : cur ? `${fmtW(curW)}×${curR}` : '—',
    });
  }
  const totalWork = Math.max(ex.workingSets, work.length);
  for (let i = 0; i < totalWork; i++) {
    const s = work[i];
    const cur = !isWarm && !exComplete && i === setIdx;
    chips.push({
      key: `s${i}`,
      cls: s ? 'chip done' : cur ? 'chip cur' : 'chip',
      cn: `S${i + 1}`,
      body: s ? `${fmtW(s.weightKg)}×${s.reps}` : cur ? `${fmtW(curW)}×${curR}` : '—',
    });
  }

  return (
    <div className="chips">
      {chips.map((c) => (
        <div key={c.key} className={c.cls}>
          <span className="cn">{c.cn}</span>
          {c.body}
        </div>
      ))}
    </div>
  );
}

/* ---------- finish sheet ---------- */
function FinishSheet({ workout, elapsed, volume, setCount, doneCount, onClose, go }: {
  workout: Workout; elapsed: number; volume: number; setCount: number; doneCount: number;
  onClose: () => void; go: Go;
}) {
  const remaining = workout.exercises.length - doneCount;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  return (
    <Sheet title={`Finish ${workout.dayName}?`} onClose={onClose}>
      <div className="prg" style={{ marginTop: 0 }}>
        <div className="prc"><div className="k">Time</div><div className="v num">{Math.round(elapsed / 60)} <u>min</u></div></div>
        <div className="prc"><div className="k">Volume</div><div className="v num">{fmtTonnes(volume)} <u>t</u></div></div>
        <div className="prc"><div className="k">Sets logged</div><div className="v num">{setCount}</div></div>
        <div className="prc"><div className="k">Exercises</div><div className="v num">{doneCount} <u>/ {workout.exercises.length}</u></div></div>
      </div>
      {remaining > 0 && setCount > 0 && (
        <p style={{ color: 'var(--txt-2)', fontSize: 12.5, margin: '0 2px 14px' }}>
          {remaining} exercise{remaining > 1 ? 's' : ''} still {remaining > 1 ? 'have' : 'has'} unlogged sets — they’ll be skipped.
        </p>
      )}
      {setCount === 0 ? (
        <button
          className="btn danger"
          onClick={async () => { await discardWorkout(workout); onClose(); go('today'); }}
        >
          Discard empty workout
        </button>
      ) : (
        <>
          <button
            className="btn"
            onClick={async () => {
              const id = await finishWorkout(workout);
              onClose();
              go('summary', id);
            }}
          >
            Finish workout
            <svg width="15" height="15" viewBox="0 0 15 15">
              <path d="M3 13V2h8l-2 3 2 3H4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div style={{ height: 10 }} />
          <button className="btn ghost" onClick={onClose}>Keep lifting</button>
          <div style={{ height: 10 }} />
          <button
            className="btn danger"
            onClick={async () => {
              if (!confirmDiscard) { setConfirmDiscard(true); return; }
              await discardWorkout(workout);
              onClose();
              go('today');
            }}
          >
            {confirmDiscard ? 'Tap again — session and sets are deleted' : 'Discard workout'}
          </button>
        </>
      )}
    </Sheet>
  );
}

/* ---------- plate calculator ---------- */
function PlatesSheet({ totalKg, barKg, onClose }: { totalKg: number; barKg: number; onClose: () => void }) {
  const plates = platesFor(totalKg, barKg);
  const loadable = totalKg >= barKg;
  return (
    <Sheet title="Plate math" onClose={onClose}>
      <span className="eyebrow">{fmtW(totalKg)} kg total · {fmtW(barKg)} kg bar · per side</span>
      {loadable ? (
        <>
          <div className="platesrow">
            <span className="bar" />
            {plates.map((p, i) => (
              <span
                key={i}
                className={`plate${p < 5 ? ' small' : ''}`}
                style={{ width: p >= 20 ? 26 : p >= 10 ? 22 : p >= 5 ? 18 : 14, height: 24 + p * 2.4 }}
              >
                {fmtW(p)}
              </span>
            ))}
            {plates.length === 0 && <span className="eyebrow" style={{ alignSelf: 'center' }}>Empty bar</span>}
            <span className="bar" style={{ flex: 0.3 }} />
          </div>
          <p style={{ color: 'var(--txt-2)', fontSize: 12.5, margin: '4px 2px 0' }}>
            {plates.length > 0 ? `Load ${plates.map(fmtW).join(' + ')} each side.` : 'Just the bar — smooth reps.'}
            {(() => {
              const loaded = barKg + plates.reduce((a, b) => a + b, 0) * 2;
              return loaded !== totalKg ? ` Closest loadable: ${fmtW(loaded)} kg.` : '';
            })()}
          </p>
        </>
      ) : (
        <p style={{ color: 'var(--txt-2)', fontSize: 12.5, margin: '14px 2px 0' }}>
          Below bar weight ({fmtW(barKg)} kg) — no plates needed.
        </p>
      )}
    </Sheet>
  );
}
