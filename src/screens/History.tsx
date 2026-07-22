import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Go } from '../App';
import type { Run, Workout } from '../types';
import { dayOfMonth, fmtKm, fmtPace, fmtTonnes, monthName, startOfDay, weekday3 } from '../lib/format';
import { weekStreak } from '../lib/stats';
import { Sheet } from '../components/Sheet';
import { RecapSheet } from '../sheets/RecapSheet';

export function History({ go }: { go: Go }) {
  const [showCal, setShowCal] = useState(false);
  const [showRecap, setShowRecap] = useState(false);

  const finished = useLiveQuery(async () =>
    (await db.workouts.orderBy('startedAt').reverse().toArray()).filter((w) => w.finishedAt !== null),
  );
  const runs = useLiveQuery(async () =>
    (await db.runs.orderBy('startedAt').reverse().toArray()).filter((r) => r.finishedAt !== null),
  );

  const streak = useMemo(() => weekStreak((finished ?? []).map((w) => w.finishedAt!)), [finished]);

  type Entry = { at: number } & ({ kind: 'workout'; w: Workout } | { kind: 'run'; r: Run });
  const months = useMemo(() => {
    const entries: Entry[] = [
      ...(finished ?? []).map((w) => ({ kind: 'workout' as const, at: w.finishedAt!, w })),
      ...(runs ?? []).map((r) => ({ kind: 'run' as const, at: r.finishedAt!, r })),
    ].sort((a, b) => b.at - a.at);
    const out: { key: string; label: string; items: Entry[] }[] = [];
    for (const e of entries) {
      const d = new Date(e.at);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      let m = out[out.length - 1];
      if (!m || m.key !== key) {
        m = { key, label: monthName(e.at), items: [] };
        out.push(m);
      }
      m.items.push(e);
    }
    return out;
  }, [finished, runs]);

  if (finished === undefined) return <section className="screen" />;

  return (
    <section className="screen" aria-label="History">
      <div className="head">
        <span className="t">History</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="ic" aria-label="Monthly recap" onClick={() => setShowRecap(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path d="M3 14.5V9M9 14.5V3.5M15 14.5V6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
            </svg>
          </button>
          <button className="ic" aria-label="Calendar" onClick={() => setShowCal(true)}>
            <svg width="18" height="18" viewBox="0 0 18 18">
              <rect x="2" y="3.5" width="14" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.6" fill="none" />
              <path d="M2 7.5h14M6 2v3M12 2v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>

      {finished.length === 0 && (runs ?? []).length === 0 ? (
        <div className="empty">
          <svg width="34" height="34" viewBox="0 0 22 22" style={{ color: 'var(--ember)', display: 'inline-block' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="1.7" fill="none" />
            <path d="M11 6.5V11l3 2" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="big">Nothing logged yet</div>
          <p>Every finished session lands here — with its share card one tap away.</p>
          <button className="btn" onClick={() => go('today')}>Start your first</button>
        </div>
      ) : (
        months.map((m, mi) => (
          <div key={m.key}>
            <div className="hmeta" style={mi > 0 ? { marginTop: 18 } : undefined}>
              <span className="eyebrow">
                {m.label} · {m.items.length} session{m.items.length === 1 ? '' : 's'}
                {mi === 0 && streak > 1 ? ` · ${streak}-week streak` : ''}
              </span>
            </div>
            <div className="hlist">
              {m.items.map((e) => e.kind === 'workout' ? (
                <button key={`w${e.w.id}`} className="hitem" onClick={() => go('summary', e.w.id)}>
                  <div className="hd">
                    <span className="dw">{weekday3(e.at)}</span>
                    <span className="dn num">{dayOfMonth(e.at)}</span>
                  </div>
                  <div className="hi">
                    <div className="nm">{e.w.dayName}</div>
                    <div className="mu">{Math.round(e.w.durationSec / 60)}m · {fmtTonnes(e.w.volumeKg)}t · {e.w.setCount} sets</div>
                  </div>
                  <div className="right">
                    {e.w.prCount > 0 && <span className="hpr">⚡ {e.w.prCount > 1 ? `${e.w.prCount} PR` : 'PR'}</span>}
                    <span className="chev">
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </button>
              ) : (
                <button key={`r${e.r.id}`} className="hitem" onClick={() => go('runsummary', e.r.id)}>
                  <div className="hd">
                    <span className="dw">{weekday3(e.at)}</span>
                    <span className="dn num">{dayOfMonth(e.at)}</span>
                  </div>
                  <div className="hi">
                    <div className="nm">Run</div>
                    <div className="mu">{fmtKm(e.r.distanceM)} km · {fmtPace(e.r.avgPaceSec)}/km · {Math.round(e.r.movingSec / 60)}m</div>
                  </div>
                  <div className="right">
                    <span className="chev">
                      <svg width="14" height="14" viewBox="0 0 14 14">
                        <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))
      )}

      {showCal && <CalendarSheet workouts={finished} go={go} onClose={() => setShowCal(false)} />}
      {showRecap && <RecapSheet onClose={() => setShowRecap(false)} />}
    </section>
  );
}

/* ---------- month calendar ---------- */
function CalendarSheet({ workouts, go, onClose }: { workouts: Workout[]; go: Go; onClose: () => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWd = (new Date(year, month, 1).getDay() + 6) % 7; // Mon=0

  const byDay = new Map<number, Workout[]>();
  for (const w of workouts) {
    const d = new Date(w.finishedAt!);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const arr = byDay.get(d.getDate()) ?? [];
      arr.push(w);
      byDay.set(d.getDate(), arr);
    }
  }
  const todayKey = startOfDay(Date.now());

  return (
    <Sheet onClose={onClose}>
      <div className="head l" style={{ padding: '0 0 6px' }}>
        <button className="ic" aria-label="Previous month" onClick={() => setMonthOffset((v) => v - 1)}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="t" style={{ fontSize: 24 }}>{monthName(base.getTime())} {year}</span>
        <button className="ic" aria-label="Next month" style={{ marginLeft: 'auto' }} onClick={() => setMonthOffset((v) => Math.min(0, v + 1))}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>
      <div className="calgrid">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <span key={i} className="wd">{d}</span>)}
        {Array.from({ length: firstWd }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = i + 1;
          const items = byDay.get(day);
          const isToday = startOfDay(new Date(year, month, day).getTime()) === todayKey;
          const hasPR = items?.some((w) => w.prCount > 0);
          return (
            <button
              key={day}
              className={`calday${items ? ' has' : ''}${isToday ? ' today' : ''}${hasPR ? ' pr' : ''}`}
              disabled={!items}
              onClick={() => { if (items) { onClose(); go('summary', items[0].id); } }}
            >
              {day}
              {items && <span className="dot" />}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
