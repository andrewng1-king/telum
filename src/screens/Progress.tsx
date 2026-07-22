import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Go } from '../App';
import { ALL_EXERCISES, EQUIP_LABEL, FAMILY_LABEL, familyVariants } from '../db/exercises';
import { DAY_MS, agoLabel, fmtDayMonth, fmtKm, fmtPace, fmtW, startOfWeek } from '../lib/format';
import { BAR_GROUPS, clubStates, setVolume, weeklyHardSets } from '../lib/stats';
import { useCountUp } from '../lib/ui';
import { Sheet } from '../components/Sheet';

type Range = '4w' | '8w' | '12w' | 'all';
const RANGE_LABEL: Record<Range, string> = { '4w': 'past 4 weeks', '8w': 'past 8 weeks', '12w': 'past 12 weeks', all: 'all time' };
const RANGE_DAYS: Record<Range, number> = { '4w': 28, '8w': 56, '12w': 84, all: Infinity };
const MO3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

interface SessionPoint { at: number; best: number; volume: number; }

export function Progress({ go }: { go: Go }) {
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [range, setRange] = useState<Range>('4w');
  const [scope, setScope] = useState<'variant' | 'family'>('variant');
  const [showPicker, setShowPicker] = useState(false);
  const [showRange, setShowRange] = useState(false);

  const hardSets = useLiveQuery(async () => {
    await db.sets.count();
    return weeklyHardSets();
  });

  const clubs = useLiveQuery(async () => {
    await db.sets.count();
    return clubStates();
  });

  // exercises that actually have finished working sets, most recent first
  const trained = useLiveQuery(async () => {
    const finished = new Map<number, number>();
    await db.workouts.each((w) => { if (w.id != null && w.finishedAt) finished.set(w.id, w.finishedAt); });
    const last = new Map<string, number>();
    await db.sets.each((s) => {
      if (s.type !== 'working' || !finished.has(s.workoutId)) return;
      if (s.loggedAt > (last.get(s.exerciseId) ?? 0)) last.set(s.exerciseId, s.loggedAt);
    });
    return [...last.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  });

  const bodylog = useLiveQuery(() => db.bodylog.orderBy('at').toArray());

  const selectedId = exerciseId ?? trained?.[0] ?? null;
  const selected = ALL_EXERCISES.find((e) => e.id === selectedId) ?? null;
  const variants = useMemo(() => (selectedId ? familyVariants(selectedId) : []), [selectedId]);
  const familyMode = scope === 'family' && variants.length > 1;

  const data = useLiveQuery(async (): Promise<{ points: SessionPoint[]; bestSet: { w: number; r: number } | null; bestE1: number; topVol: number; count: number } | null> => {
    if (!selectedId) return null;
    const chartIds = familyMode ? familyVariants(selectedId).map((v) => v.id) : [selectedId];
    const finished = new Map<number, number>();
    await db.workouts.each((w) => { if (w.id != null && w.finishedAt) finished.set(w.id, w.finishedAt); });
    const rows = (await db.sets.where('exerciseId').anyOf(chartIds).toArray())
      .filter((s) => s.type === 'working' && finished.has(s.workoutId));
    if (rows.length === 0) return { points: [], bestSet: null, bestE1: 0, topVol: 0, count: 0 };

    const byWorkout = new Map<number, { at: number; best: number; volume: number }>();
    let bestE1 = 0; let bestSet: { w: number; r: number } | null = null; let topVol = 0;
    for (const s of rows) {
      const at = finished.get(s.workoutId)!;
      const p = byWorkout.get(s.workoutId) ?? { at, best: 0, volume: 0 };
      p.best = Math.max(p.best, s.e1rm);
      p.volume += setVolume(s);
      byWorkout.set(s.workoutId, p);
      if (s.e1rm > bestE1) { bestE1 = s.e1rm; bestSet = { w: s.weightKg, r: s.reps }; }
    }
    for (const p of byWorkout.values()) topVol = Math.max(topVol, p.volume);
    const points = [...byWorkout.values()].sort((a, b) => a.at - b.at);
    return { points, bestSet, bestE1, topVol, count: points.length };
  }, [selectedId, familyMode]);

  const inRange = useMemo(() => {
    if (!data) return [];
    const cutoff = RANGE_DAYS[range] === Infinity ? 0 : Date.now() - RANGE_DAYS[range] * DAY_MS;
    return data.points.filter((p) => p.at >= cutoff);
  }, [data, range]);

  const latest = inRange.length ? inRange[inRange.length - 1].best : 0;
  const first = inRange.length ? inRange[0].best : 0;
  const deltaPct = first > 0 ? ((latest - first) / first) * 100 : 0;
  const latestTxt = useCountUp(latest, 1);

  // forward-looking proof: least-squares fit over the visible range, projected
  // 4 weeks out. Only shown while the trend is actually climbing.
  const projection = useMemo(() => {
    if (inRange.length < 3) return null;
    const n = inRange.length;
    const mx = inRange.reduce((a, p) => a + p.at, 0) / n;
    const my = inRange.reduce((a, p) => a + p.best, 0) / n;
    let num = 0;
    let den = 0;
    for (const p of inRange) { num += (p.at - mx) * (p.best - my); den += (p.at - mx) ** 2; }
    if (den === 0) return null;
    const slope = num / den;
    if (slope <= 0) return null;
    const at = inRange[n - 1].at + 28 * DAY_MS;
    const v = Math.round((my + slope * (at - mx)) * 2) / 2; // nearest 0.5 kg
    return v > inRange[n - 1].best ? { at, v } : null;
  }, [inRange]);

  const empty = data !== null && data !== undefined && data.count === 0;
  const nothingYet = trained !== undefined && trained.length === 0;

  return (
    <section className="screen" aria-label="Progress">
      <div className="head">
        <span className="t">Progress</span>
        <button className="ic" aria-label="Range" onClick={() => setShowRange(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M2 4h14M4 9h10M7 14h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {nothingYet ? (
        <div className="empty">
          <svg width="34" height="34" viewBox="0 0 22 22" style={{ color: 'var(--ember)', display: 'inline-block' }}>
            <path d="M3 16l5-5 3 3 7-8" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 6h4v4" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="big">Progress lives here</div>
          <p>Finish your first session and Telum starts charting e1RM trends, PRs and weekly hard sets per muscle.</p>
          <button className="btn" onClick={() => go('today')}>Start today’s workout</button>
        </div>
      ) : (
        <>
          <button className="selector" onClick={() => setShowPicker(true)}>
            <div>
              <div className="mu">{selected ? `${EQUIP_LABEL[selected.equipment]} · e1RM trend` : 'Exercise · e1RM trend'}</div>
              <div className="nm">{selected?.name ?? '—'}</div>
            </div>
            <span className="a">
              <svg width="16" height="16" viewBox="0 0 16 16">
                <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>

          {variants.length > 1 && selected?.family && (
            <div className="segbtns">
              <button className={scope === 'variant' ? 'sel' : ''} onClick={() => setScope('variant')}>
                This variant
              </button>
              <button className={scope === 'family' ? 'sel' : ''} onClick={() => setScope('family')}>
                All {FAMILY_LABEL[selected.family] ?? 'variants'}
              </button>
            </div>
          )}

          <div className="bigstat">
            <div className="k">Estimated 1RM{familyMode ? ' · best across variants' : ''}</div>
            <div className="v"><span className="num disp">{empty ? '—' : latestTxt}</span><small> kg</small></div>
            <div className={`delta${deltaPct < 0 ? ' down' : ''}`}>
              {inRange.length >= 2
                ? <>{deltaPct >= 0 ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}% <span>· {RANGE_LABEL[range]}</span></>
                : <span>Not enough sessions in {RANGE_LABEL[range]}</span>}
            </div>
            {projection && !empty && (
              <div className="proj">◇ On pace for {fmtW(projection.v)} kg by {fmtDayMonth(projection.at)}</div>
            )}
            <TrendChart points={inRange} projected={projection?.v ?? null} />
          </div>

          <div className="prg">
            <div className="prc hl">
              <div className="k">★ Best set</div>
              <div className="v num">{data?.bestSet ? <>{fmtW(data.bestSet.w)} <u>kg ×</u> {data.bestSet.r}</> : '—'}</div>
            </div>
            <div className="prc">
              <div className="k">Best e1RM</div>
              <div className="v num">{data?.bestE1 ? <>{fmtW(data.bestE1)} <u>kg</u></> : '—'}</div>
            </div>
            <div className="prc">
              <div className="k">Top volume</div>
              <div className="v num">{data?.topVol ? <>{Math.round(data.topVol).toLocaleString()} <u>kg</u></> : '—'}</div>
            </div>
            <div className="prc">
              <div className="k">Logged</div>
              <div className="v num">{data?.count ?? 0} <u>session{data?.count === 1 ? '' : 's'}</u></div>
            </div>
          </div>
        </>
      )}

      {clubs && clubs.length > 0 && (
        <>
          <div className="vt">
            <span className="eyebrow">Clubs · top working set</span>
          </div>
          <div className="chipsrow clubrow">
            {clubs.map((c) => (
              <span key={c.label} className={`rchip${c.reached ? ' gold' : ' c'}`}>
                <i />
                {c.reached
                  ? <>{c.label} · {c.reached} kg{c.next ? <em> · {c.next} next</em> : null}</>
                  : <>{c.label} · {c.next} kg next</>}
              </span>
            ))}
          </div>
        </>
      )}

      <div className="vt">
        <span className="eyebrow">Hard sets per muscle · this week</span>
        <span className="zone">▮ 10–20 zone</span>
      </div>
      <VolumeBars hardSets={hardSets ?? null} />

      <RunningBlock />

      <BodyweightTrend bodylog={bodylog ?? []} />

      {showPicker && trained && (
        <Sheet title="Exercise" onClose={() => setShowPicker(false)}>
          {buildPickerGroups().map((g) => (
            <div key={g.key}>
              {g.label && (
                <span className="eyebrow" style={{ display: 'block', margin: '10px 2px 8px' }}>{g.label}</span>
              )}
              {g.members.map((e) => {
                const has = trained.includes(e.id);
                return (
                  <button
                    key={e.id}
                    className={`opt${e.id === selectedId ? ' sel' : ''}`}
                    onClick={() => { setExerciseId(e.id); setShowPicker(false); }}
                  >
                    <div>
                      <div className="nm">{e.name}</div>
                      <div className="mu">{e.label} · {EQUIP_LABEL[e.equipment]}</div>
                    </div>
                    <span className="r">{has ? 'Logged' : 'No data'}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </Sheet>
      )}

      {showRange && (
        <Sheet title="Time range" onClose={() => setShowRange(false)}>
          <div className="segbtns">
            {(['4w', '8w', '12w', 'all'] as Range[]).map((rg) => (
              <button key={rg} className={rg === range ? 'sel' : ''} onClick={() => { setRange(rg); setShowRange(false); }}>
                {rg === 'all' ? 'All' : rg.toUpperCase()}
              </button>
            ))}
          </div>
        </Sheet>
      )}
    </section>
  );
}

/** Catalog in order, movement families grouped under a shared header. */
function buildPickerGroups(): { key: string; label: string | null; members: typeof ALL_EXERCISES }[] {
  const out: { key: string; label: string | null; members: typeof ALL_EXERCISES }[] = [];
  const seen = new Set<string>();
  for (const e of ALL_EXERCISES) {
    if (e.family) {
      if (seen.has(e.family)) continue;
      seen.add(e.family);
      out.push({ key: e.family, label: FAMILY_LABEL[e.family] ?? e.family, members: ALL_EXERCISES.filter((x) => x.family === e.family) });
    } else {
      out.push({ key: e.id, label: null, members: [e] });
    }
  }
  return out;
}

/* ---------- e1RM trend chart ---------- */
function TrendChart({ points, emptyText, projected }: { points: SessionPoint[]; emptyText?: string; projected?: number | null }) {
  if (points.length < 2) {
    return (
      <svg className="chart" viewBox="0 0 300 140" preserveAspectRatio="none" aria-label="trend">
        <line x1="0" y1="40" x2="300" y2="40" stroke="var(--hair)" />
        <line x1="0" y1="80" x2="300" y2="80" stroke="var(--hair)" />
        <text className="ax" x="150" y="75" textAnchor="middle">{emptyText ?? 'LOG MORE SESSIONS TO DRAW THE TREND'}</text>
      </svg>
    );
  }
  const hasProj = projected != null;
  const lo = Math.min(...points.map((p) => p.best));
  const hi = Math.max(hasProj ? projected : 0, ...points.map((p) => p.best));
  const pad = Math.max(1, (hi - lo) * 0.15);
  const y = (v: number) => 118 - ((v - (lo - pad)) / (hi + pad - (lo - pad))) * 94;
  // real sessions keep the left ~85% when a projection borrows the right edge
  const x = (i: number) => 4 + (i / (points.length - 1)) * (hasProj ? 240 : 282);
  const pts = points.map((p, i) => `${x(i).toFixed(1)},${y(p.best).toFixed(1)}`);
  const line = `M${pts.join(' L')}`;
  const area = `${line} L${x(points.length - 1).toFixed(1)},132 L4,132 Z`;
  const lx = x(points.length - 1);
  const ly = y(points[points.length - 1].best);
  const mid = points[Math.floor((points.length - 1) / 2)];

  return (
    <svg className="chart" viewBox="0 0 300 140" preserveAspectRatio="none" aria-label="rising trend">
      <defs>
        <linearGradient id="ar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ember)" stopOpacity=".34" />
          <stop offset="1" stopColor="var(--ember)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1="0" y1="40" x2="300" y2="40" stroke="var(--hair)" />
      <line x1="0" y1="80" x2="300" y2="80" stroke="var(--hair)" />
      <path d={area} fill="url(#ar)" />
      <path d={line} fill="none" stroke="var(--ember)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {hasProj && (
        <>
          <path d={`M${lx.toFixed(1)},${ly.toFixed(1)} L290,${y(projected).toFixed(1)}`} fill="none" stroke="var(--ember)"
            strokeWidth="2" strokeDasharray="5 5" strokeLinecap="round" opacity=".55" />
          <circle cx="290" cy={y(projected)} r="4" fill="none" stroke="var(--ember)" strokeWidth="2" opacity=".7" />
        </>
      )}
      <circle cx={lx} cy={ly} r="4.5" fill="var(--ember)" />
      <circle cx={lx} cy={ly} r="9" fill="var(--ember)" fillOpacity=".2" />
      <text className="ax" x="4" y="138">{MO3[new Date(points[0].at).getMonth()]}</text>
      <text className="ax" x="150" y="138" textAnchor="middle">{MO3[new Date(mid.at).getMonth()]}</text>
      <text className="ax" x="296" y="138" textAnchor="end">{MO3[new Date(points[points.length - 1].at).getMonth()]}</text>
    </svg>
  );
}

/* ---------- running ---------- */
function RunningBlock() {
  const runs = useLiveQuery(async () =>
    (await db.runs.orderBy('startedAt').toArray()).filter((r) => r.finishedAt !== null),
  );
  if (!runs || runs.length === 0) return null;

  const weekFrom = startOfWeek();
  const thisWeekM = runs.filter((r) => r.finishedAt! >= weekFrom).reduce((a, r) => a + r.distanceM, 0);
  const lastWeekM = runs
    .filter((r) => r.finishedAt! >= weekFrom - 7 * DAY_MS && r.finishedAt! < weekFrom)
    .reduce((a, r) => a + r.distanceM, 0);
  const last = runs[runs.length - 1];
  const points = runs.map((r) => ({ at: r.finishedAt!, best: r.distanceM / 1000, volume: 0 }));
  const deltaKm = (thisWeekM - lastWeekM) / 1000;

  return (
    <>
      <div className="vt">
        <span className="eyebrow">Running</span>
        <span className="zone">last · {agoLabel(last.finishedAt!)}</span>
      </div>
      <div className="bigstat">
        <div className="k">This week</div>
        <div className="v"><span className="num disp">{fmtKm(thisWeekM)}</span><small> km</small></div>
        <div className={`delta${deltaKm < 0 ? ' down' : ''}`}>
          {lastWeekM > 0 || thisWeekM > 0
            ? <>{deltaKm >= 0 ? '▲' : '▼'} {fmtKm(Math.abs(deltaKm * 1000))} km <span>· vs last week</span></>
            : <span>First running week</span>}
        </div>
        <TrendChart points={points} emptyText="RUN MORE TO DRAW THE TREND" />
      </div>
      <div className="prg">
        <div className="prc"><div className="k">Last run</div><div className="v num">{fmtKm(last.distanceM)} <u>km</u></div></div>
        <div className="prc"><div className="k">Last pace</div><div className="v num">{fmtPace(last.avgPaceSec)} <u>/km</u></div></div>
      </div>
    </>
  );
}

/* ---------- bodyweight trend ---------- */
function BodyweightTrend({ bodylog }: { bodylog: { at: number; kg: number }[] }) {
  const latest = bodylog.length ? bodylog[bodylog.length - 1] : null;
  const first = bodylog.length ? bodylog[0] : null;
  const delta = latest && first ? latest.kg - first.kg : 0;
  const points = bodylog.map((b) => ({ at: b.at, best: b.kg, volume: 0 }));
  return (
    <>
      <div className="vt">
        <span className="eyebrow">Bodyweight</span>
        <span className="zone">{latest ? `last · ${agoLabel(latest.at)}` : 'log it from Today'}</span>
      </div>
      <div className="bigstat" style={{ marginBottom: 24 }}>
        <div className="k">Current</div>
        <div className="v"><span className="num disp">{latest ? fmtW(latest.kg) : '—'}</span><small> kg</small></div>
        <div className={`delta${delta < 0 ? ' down' : ''}`}>
          {bodylog.length >= 2
            ? <>{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)} kg <span>· since first log</span></>
            : <span>Log weigh-ins to draw the trend</span>}
        </div>
        <TrendChart points={points} emptyText="LOG WEIGH-INS FROM TODAY TO DRAW THE TREND" />
      </div>
    </>
  );
}

/* ---------- weekly hard-set bars ---------- */
function VolumeBars({ hardSets }: { hardSets: Record<string, number> | null }) {
  const [fill, setFill] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setFill(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const SCALE = 24; // bar maxes at 24 sets; the 10–20 band sits at 41.6%–83.3%
  return (
    <div className="vol">
      {BAR_GROUPS.map((g) => {
        const n = hardSets?.[g] ?? 0;
        const low = n < 10;
        const pct = Math.min(100, (n / SCALE) * 100);
        return (
          <div key={g} className={`vb${low ? ' low' : ''}`}>
            <span className="nm">{g}</span>
            <span className="tk">
              <span className="band" />
              <i style={{ width: fill ? `${pct}%` : 0 }} />
            </span>
            <span className="n num">{n}{low && n > 0 ? ' · low' : ''}</span>
          </div>
        );
      })}
    </div>
  );
}
