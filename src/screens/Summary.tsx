import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exportBackup } from '../db/backup';
import { exportCardPng } from '../lib/exportCard';
import type { Go } from '../App';
import type { SetRow } from '../types';
import { DAY_MS, fmtCardDate, fmtShortDate, fmtTonnes, fmtW } from '../lib/format';
import { prLabel } from '../lib/stats';
import { toastBus } from '../lib/ui';

type Layout = 'ember' | 'minimal' | 'bold' | 'clear';
const LAYOUTS: { id: Layout; cap: string; th: string }[] = [
  { id: 'ember', cap: 'Ember', th: 'd1' },
  { id: 'minimal', cap: 'Minimal', th: 'd2' },
  { id: 'bold', cap: 'Bold', th: 'd3' },
  { id: 'clear', cap: 'Clear · transparent', th: 'd4' },
];

type Orient = 'portrait' | 'landscape' | 'story';
const ORIENTS: { id: Orient; cap: string; hint: string }[] = [
  { id: 'portrait', cap: 'Portrait', hint: '4:5' },
  { id: 'landscape', cap: 'Landscape', hint: '1.91:1' },
  { id: 'story', cap: 'Story', hint: '9:16' },
];
/** height ÷ width per format — must mirror the .o-* aspect-ratio rules */
const RATIO: Record<Orient, number> = { portrait: 5 / 4, landscape: 100 / 191, story: 16 / 9 };
/** the on-screen card is an illustrative example — cap its height, never its export */
const PREVIEW_MAX_H = 380;

/** Solid matte behind each skin so exports never have a transparent frame (Clear excepted). */
const MATTE: Record<Layout, string | null> = {
  ember: '#050403',
  minimal: '#070606',
  bold: '#d33800',
  clear: null,
};

export function Summary({ go, workoutId }: { go: Go; workoutId: number }) {
  const [layout, setLayout] = useState<Layout>('ember');
  const [orient, setOrient] = useState<Orient>('portrait');
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  // callback ref: the wrap mounts after the data-loading early return, so a
  // plain ref + mount effect would never see it
  const [wrapEl, setWrapEl] = useState<HTMLDivElement | null>(null);
  const [wrapW, setWrapW] = useState(0);

  useLayoutEffect(() => {
    if (!wrapEl) return;
    const measure = () => setWrapW(wrapEl.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [wrapEl]);

  const workout = useLiveQuery(() => db.workouts.get(workoutId), [workoutId]);
  const sets = useLiveQuery(
    async () => (await db.sets.where('workoutId').equals(workoutId).toArray()).sort((a, b) => a.loggedAt - b.loggedAt),
    [workoutId],
  );
  const settings = useLiveQuery(() => db.settings.get(1));

  // "vs last {day}" — the stated win: compare against the previous finished
  // session of the same program day
  const cmp = useLiveQuery(async () => {
    const w = await db.workouts.get(workoutId);
    if (!w?.finishedAt) return null;
    const all = await db.workouts.orderBy('startedAt').reverse().toArray();
    const prev = all.find((p) => p.id !== w.id && p.dayId === w.dayId && p.finishedAt != null && p.finishedAt < w.finishedAt!);
    if (!prev) return { first: true as const };
    const [curSets, prevSets] = await Promise.all([
      db.sets.where('workoutId').equals(w.id!).toArray(),
      db.sets.where('workoutId').equals(prev.id!).toArray(),
    ]);
    const best = (rows: SetRow[]) => {
      const m = new Map<string, number>();
      for (const s of rows) {
        if (s.type !== 'working') continue;
        const v = s.e1rm > 0 ? s.e1rm : s.weightKg * s.reps;
        m.set(s.exerciseId, Math.max(m.get(s.exerciseId) ?? 0, v));
      }
      return m;
    };
    const cur = best(curSets);
    const old = best(prevSets);
    let up = 0;
    let comparable = 0;
    for (const [id, v] of cur) {
      const pv = old.get(id);
      if (pv !== undefined) { comparable++; if (v > pv) up++; }
    }
    const volPct = prev.volumeKg > 0 ? ((w.volumeKg - prev.volumeKg) / prev.volumeKg) * 100 : 0;
    const minDelta = Math.round((w.durationSec - prev.durationSec) / 60);
    return { first: false as const, prevAt: prev.finishedAt!, volPct, up, comparable, minDelta };
  }, [workoutId]);

  const prSets = useMemo(() => (sets ?? []).filter((s) => s.prs.length > 0), [sets]);

  // backup nudge — the moment right after training is when the log is most
  // valuable and iOS storage eviction would hurt the most (risk reversal)
  const backupDue = useLiveQuery(async () => {
    const s = await db.settings.get(1);
    const finished = (await db.workouts.toArray()).filter((w) => w.finishedAt != null);
    const last = s?.lastBackupAt ?? 0;
    const since = finished.filter((w) => w.finishedAt! > last).length;
    if (!last) return finished.length >= 5 ? { since, never: true } : null;
    const days = (Date.now() - last) / DAY_MS;
    return since >= 5 || (days > 14 && since > 0) ? { since, never: false } : null;
  });
  const [backingUp, setBackingUp] = useState(false);
  const doBackup = async () => {
    if (backingUp) return;
    setBackingUp(true);
    try {
      if (await exportBackup()) toastBus.show('🛡 Backup saved');
    } catch {
      toastBus.show('Backup failed — try again');
    } finally {
      setBackingUp(false);
    }
  };

  if (!workout || !sets) return <section className="screen" />;

  const durMin = Math.max(1, Math.round(workout.durationSec / 60));
  const tonnes = fmtTonnes(workout.volumeKg);
  const kcal = workout.kcal ?? 0;
  const firstPR = prSets[0];

  const exportImage = async () => {
    const el = cardRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      const slug = workout.dayName.toLowerCase().replace(/\s+/g, '-');
      await exportCardPng(el, MATTE[layout], `telum-${slug}-${orient}.png`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastBus.show('Export failed — try again');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="screen" aria-label="Session summary">
      <div className="head l">
        <button className="ic" aria-label="Back" onClick={() => go('history')}>
          <svg width="17" height="17" viewBox="0 0 17 17">
            <path d="M11 3L5.5 8.5 11 14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="t">Summary</span>
      </div>
      <span className="eyebrow subline">{workout.dayName} · {fmtShortDate(workout.finishedAt ?? workout.startedAt)} · Complete</span>

      {prSets.map((s) => (
        <div className="ribbon" key={s.id}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 7-9H9l1-5z" fill="#FFB25A" /></svg>
          <div>
            <div className="k">{prLabel(s.prs.includes('weight') ? 'weight' : s.prs.includes('e1rm') ? 'e1rm' : 'rep')}</div>
            <div className="v">
              {s.exerciseName} · {s.prs.includes('e1rm') && !s.prs.includes('weight')
                ? `${fmtW(s.e1rm)} kg estimated`
                : `${fmtW(s.weightKg)} kg × ${s.reps}`}
            </div>
          </div>
        </div>
      ))}

      {cmp && (cmp.first ? (
        <div className="winline">
          <div>
            <div className="k">Baseline set</div>
            <div className="v">First {workout.dayName} logged — the next one has numbers to beat.</div>
          </div>
        </div>
      ) : (
        <div className="winline">
          <div>
            <div className="k">Vs last {workout.dayName} · {fmtShortDate(cmp.prevAt)}</div>
            <div className="v">
              {[
                `${cmp.volPct >= 0 ? '▲' : '▼'} Volume ${cmp.volPct >= 0 ? '+' : '−'}${Math.abs(cmp.volPct).toFixed(0)}%`,
                cmp.comparable > 0 ? `${cmp.up}/${cmp.comparable} lifts up` : null,
                cmp.minDelta < 0 ? `${-cmp.minDelta} min faster` : cmp.minDelta > 0 ? `${cmp.minDelta} min longer` : null,
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
        </div>
      ))}

      <div className="prg" style={{ marginTop: 6 }}>
        <div className="prc"><div className="k">Volume</div><div className="v num">{tonnes} <u>t</u></div></div>
        <div className="prc"><div className="k">Sets</div><div className="v num">{workout.setCount}</div></div>
        <div className="prc"><div className="k">Time</div><div className="v num">{durMin} <u>min</u></div></div>
        <div className="prc">
          <div className="k">Est. burn</div>
          <div className="v num">{kcal > 0 ? <>{kcal} <u>kcal</u></> : <>— <u>log bodyweight</u></>}</div>
        </div>
      </div>

      {backupDue && (
        <button className="bkline" onClick={doBackup} disabled={backingUp}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M9 1.5l6 2.5v4c0 3.6-2.4 6.6-6 8-3.6-1.4-6-4.4-6-8V4l6-2.5z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
            <path d="M6.4 9l1.8 1.8 3.4-3.6" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <div className="k">Protect the log</div>
            <div className="v">{backupDue.never ? 'Never backed up' : `${backupDue.since} session${backupDue.since === 1 ? '' : 's'} since last backup`} — iOS can evict PWA storage</div>
          </div>
          <span className="go">{backingUp ? 'Saving…' : 'Back up'}</span>
        </button>
      )}

      <span className="lt eyebrow">Your card · preview at reduced size · exports at 1080 px</span>
      {(() => {
        const naturalH = wrapW * RATIO[orient];
        const scale = wrapW > 0 ? Math.min(1, PREVIEW_MAX_H / naturalH) : 1;
        return (
      <div className="cardwrap" ref={setWrapEl} style={wrapW > 0 ? { height: naturalH * scale } : undefined}>
        <div
          className={`cardscale${layout === 'clear' ? ' clear' : ''}`}
          style={{ transform: `scale(${scale})` }}
        >
        <div className={`scard lay-${layout} o-${orient}`} ref={cardRef}>
          <div className="brand">
            <span className="wm">TE<b>L</b>UM</span>
            <span className="dt">{fmtCardDate(workout.finishedAt ?? workout.startedAt)}</span>
          </div>
          <h3>{workout.dayName}</h3>
          <p className="loc">{settings?.gymName ? `${settings.gymName} · ` : ''}{durMin} min</p>
          <Trace sets={sets} bold={layout === 'bold'} />
          <div className="sstats">
            <div><div className="k">Volume</div><div className="v num">{tonnes}<u>t</u></div></div>
            <div><div className="k">Sets</div><div className="v num">{workout.setCount}</div></div>
            <div><div className="k">Time</div><div className="v num">{durMin}<u>m</u></div></div>
            {orient === 'landscape' && firstPR && (
              <div><div className="k">⚡ New PR</div><div className="v num">{fmtW(firstPR.weightKg)}<u>×{firstPR.reps}</u></div></div>
            )}
          </div>
          {firstPR && orient !== 'landscape' && (
            <div className="cardpr">
              <svg width="16" height="16" viewBox="0 0 16 16"><path d="M9 1L3 9h4l-1 6 7-9H9l1-5z" fill="#FFB25A" /></svg>
              <div>
                <div className="k">New PR</div>
                <div className="v">{firstPR.exerciseName} · {fmtW(firstPR.weightKg)} kg × {firstPR.reps}</div>
              </div>
            </div>
          )}
        </div>
        </div>
      </div>
        );
      })()}

      <span className="lt eyebrow">Layout</span>
      <div className="layouts" role="listbox" aria-label="Card layouts">
        {LAYOUTS.map((l) => (
          <button key={l.id} className={`lay${layout === l.id ? ' sel' : ''}`} onClick={() => setLayout(l.id)} role="option" aria-selected={layout === l.id}>
            <div className={`th ${l.th}`}>
              <span className="tt" /><span className="nn">{tonnes}t</span><span className="ll" />
            </div>
            <div className="cap">{l.cap}</div>
          </button>
        ))}
      </div>

      <span className="lt eyebrow">Format</span>
      <div className="segbtns" role="listbox" aria-label="Card format">
        {ORIENTS.map((o) => (
          <button key={o.id} className={orient === o.id ? 'sel' : ''} onClick={() => setOrient(o.id)} role="option" aria-selected={orient === o.id}>
            {o.cap} · {o.hint}
          </button>
        ))}
      </div>

      <button className="btn" onClick={exportImage} disabled={exporting}>
        {exporting ? 'Rendering…' : 'Export image'}
        <svg width="16" height="16" viewBox="0 0 16 16">
          <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2 11v3h12v-3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </section>
  );
}

/* ---------- set-by-set intensity trace ---------- */
function Trace({ sets, bold }: { sets: SetRow[]; bold: boolean }) {
  const working = sets.filter((s) => s.type === 'working');
  const stroke = bold ? '#170800' : '#FF5A1F';
  if (working.length < 2) {
    return (
      <svg className="trace" viewBox="0 0 300 118" preserveAspectRatio="none" aria-label="Session intensity trace">
        <path d="M0,60 L300,60" fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" opacity=".5" />
      </svg>
    );
  }
  const vals = working.map((s) => (s.e1rm > 0 ? s.e1rm : s.weightKg * s.reps));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = Math.max(1, hi - lo);
  const x = (i: number) => (i / (working.length - 1)) * 300;
  const y = (v: number) => 96 - ((v - lo) / span) * 78;
  const pts = vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L300,118 L0,118 Z`;

  // amber dot: the PR set if any, else the peak
  let hlIdx = vals.indexOf(hi);
  const prIdx = working.findIndex((s) => s.prs.length > 0);
  if (prIdx >= 0) hlIdx = prIdx;

  return (
    <svg className="trace" viewBox="0 0 300 118" preserveAspectRatio="none" aria-label="Session intensity trace">
      <defs>
        <linearGradient id="tr" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={bold ? '#170800' : '#FF5A1F'} stopOpacity=".42" />
          <stop offset="1" stopColor={bold ? '#170800' : '#FF5A1F'} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={area} fill="url(#tr)" />
      <path d={line} fill="none" stroke={stroke} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(hlIdx)} cy={y(vals[hlIdx])} r="4" fill="#FFB25A" />
    </svg>
  );
}
