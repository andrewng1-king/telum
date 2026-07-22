import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getActiveRun, getActiveWorkout } from '../db/db';
import type { Go } from '../App';
import type { ProgramDay } from '../types';
import { agoLabel, DAY_MS, fmtGreetDate, fmtW, startOfDay, startOfWeek, upcomingLabel } from '../lib/format';
import { estimateMinutes, muscleReadiness } from '../lib/stats';
import { dayToWorkoutExercises, startWorkout } from '../lib/workout';
import { toastBus, useCountUp } from '../lib/ui';
import { Sheet } from '../components/Sheet';
import { SettingsSheet } from '../sheets/SettingsSheet';

export function Today({ go }: { go: Go }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBw, setShowBw] = useState(false);
  const bw = useLiveQuery(() => db.bodylog.orderBy('at').last());

  const settings = useLiveQuery(() => db.settings.get(1));
  const program = useLiveQuery(
    async () => (settings ? db.programs.get(settings.activeProgramId) : undefined),
    [settings?.activeProgramId],
  );
  const active = useLiveQuery(() => getActiveWorkout());
  const activeRun = useLiveQuery(() => getActiveRun());
  const finished = useLiveQuery(async () =>
    (await db.workouts.orderBy('startedAt').reverse().toArray()).filter((w) => w.finishedAt !== null),
  );
  const readiness = useLiveQuery(async () => {
    await db.sets.count(); // establish dependency so chips refresh after logging
    return muscleReadiness();
  });

  if (!settings || !program || finished === undefined) return <section className="screen" />;

  // ---- week data ----
  const weekStart = startOfWeek();
  const weekSessions = finished.filter((w) => (w.finishedAt ?? 0) >= weekStart);
  const sessionsCount = weekSessions.length;
  const target = Math.max(1, settings.weeklyTarget);
  const trainedDays = new Set(weekSessions.map((w) => Math.floor((startOfDay(w.finishedAt!) - weekStart) / DAY_MS)));
  const todayIdx = Math.floor((startOfDay(Date.now()) - weekStart) / DAY_MS);
  const expected = (target * (todayIdx + 1)) / 7;
  const paceLabel =
    sessionsCount >= target ? '▲ target hit'
    : sessionsCount >= Math.floor(expected) ? '▲ on pace'
    : `${target - sessionsCount} to go`;

  // ---- suggested day ----
  const lastDayId = finished[0]?.dayId;
  const days = program.days;
  let suggested: ProgramDay = days[0];
  if (settings.nextDayId) {
    suggested = days.find((d) => d.id === settings.nextDayId) ?? suggested;
  } else if (lastDayId) {
    const i = days.findIndex((d) => d.id === lastDayId);
    if (i >= 0) suggested = days[(i + 1) % days.length];
  }
  const dayIdxInSplit = days.findIndex((d) => d.id === suggested.id);
  const lastTimeThisDay = finished.find((w) => w.dayId === suggested.id);
  const estMin = estimateMinutes(dayToWorkoutExercises(suggested));

  const startOrResume = async () => {
    if (active) { go('lift'); return; }
    await startWorkout(suggested);
    go('lift');
  };

  return (
    <section className="screen" aria-label="Today">
      <div className="greet">
        <div>
          <div className="d">{fmtGreetDate(Date.now())}</div>
          <h2>
            {active ? 'Back at it, ' : 'Ready, '}
            <b>{settings.name || 'lifter'}.</b>
          </h2>
        </div>
        <button className="ic" aria-label="Settings" onClick={() => setShowSettings(true)}>
          <svg width="18" height="18" viewBox="0 0 18 18">
            <circle cx="9" cy="9" r="2.6" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M9 1.8v2.4M9 13.8v2.4M1.8 9h2.4M13.8 9h2.4M3.9 3.9l1.7 1.7M12.4 12.4l1.7 1.7M14.1 3.9l-1.7 1.7M5.6 12.4l-1.7 1.7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <WeekRings trainedDays={trainedDays} todayIdx={todayIdx} />
      <HeroRing count={sessionsCount} target={target} pace={paceLabel} />

      <div className="start-card">
        <div className="row">
          <span className="pill amb">{active ? '● Session live' : 'Today · Hypertrophy'}</span>
          <span className="pill">{active ? active.subtitle : `${suggested.name.split(' ')[0]} · Day ${dayIdxInSplit + 1}`}</span>
        </div>
        <h3>{active ? active.dayName : suggested.name}</h3>
        <p className="sub">{active ? 'Session in progress — jump back in.' : suggested.subtitle}</p>
        <div className="meta">
          <span className="pill">{(active ? active.exercises.length : suggested.exercises.length)} exercises</span>
          <span className="pill">~{estMin} min</span>
          <span className="pill">Last · {lastTimeThisDay ? agoLabel(lastTimeThisDay.finishedAt!) : 'first time'}</span>
        </div>
        <button className="btn" onClick={startOrResume}>
          {active ? 'Resume workout' : 'Start workout'}
          <svg width="17" height="17" viewBox="0 0 17 17">
            <path d="M5 3l6 5.5L5 14" stroke="currentColor" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <button className="runentry" onClick={() => go('run')}>
        <svg width="20" height="20" viewBox="0 0 22 22">
          <circle cx="14.5" cy="4" r="2" stroke="currentColor" strokeWidth="1.7" fill="none" />
          <path d="M8 8.5l3.5-2 3 3.5-3 2.5 1 5M11.5 6.5L8 6l-2.5 3M12.5 12.5L7 20M12.5 10l3.5 1.5 2.5-1" stroke="currentColor" strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <div className="nm">{activeRun ? `Resume run · ${(activeRun.distanceM / 1000).toFixed(2)} km` : 'Go for a run'}</div>
          <div className="mu">{activeRun ? 'GPS session waiting' : 'GPS pace · splits · route card'}</div>
        </div>
        <span className="a">
          <svg width="18" height="18" viewBox="0 0 18 18">
            <path d="M6 4l6 5-6 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <div className="ready">
        <div className="rh">
          <span className="eyebrow">Muscle readiness</span>
          <span className="eyebrow" style={{ color: 'var(--txt-3)' }}>72h window</span>
        </div>
        <div className="chipsrow">
          {(readiness ?? []).map((c) => (
            <span key={c.label} className={`rchip ${c.state === 'fresh' ? 'f' : c.state === 'ready' ? 'r' : 'c'}`}>
              <i />{c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="split-h">
        <span className="eyebrow">
          Bodyweight{bw ? ` · ${fmtW(bw.kg)} kg · ${agoLabel(bw.at)}` : ' · feeds the calorie estimate'}
        </span>
        <a onClick={() => setShowBw(true)}>{bw ? 'Log' : 'Log weight'}</a>
      </div>

      <div className="split-h">
        <span className="eyebrow">Your split · {program.splitLabel}</span>
        <a onClick={() => setShowEdit(true)}>Edit</a>
      </div>
      <div className="split">
        {days.map((d, i) => {
          const offset = (i - dayIdxInSplit + days.length) % days.length;
          return (
            <div key={d.id} className={`sitem${d.id === suggested.id ? ' on' : ''}`}>
              <span className="n">{i + 1}</span>
              <div>
                <div className="nm">{d.name}</div>
                <div className="mu">{d.subtitle}</div>
              </div>
              <span className="r">{upcomingLabel(offset)}</span>
            </div>
          );
        })}
      </div>

      {showEdit && (
        <ProgramSheet
          activeProgramId={settings.activeProgramId}
          suggestedId={suggested.id}
          onClose={() => setShowEdit(false)}
        />
      )}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
      {showBw && <BodyweightSheet initial={bw?.kg ?? 75} onClose={() => setShowBw(false)} />}
    </section>
  );
}

/* ---------- bodyweight quick-log ---------- */
function BodyweightSheet({ initial, onClose }: { initial: number; onClose: () => void }) {
  const [kg, setKg] = useState(initial);
  const clamp = (v: number) => Math.min(250, Math.max(30, +v.toFixed(1)));
  return (
    <Sheet title="Bodyweight" onClose={onClose}>
      <span className="eyebrow" style={{ display: 'block', margin: '0 2px 4px' }}>
        Morning weigh-ins keep the trend honest
      </span>
      <div className="bigset" style={{ justifyContent: 'center', margin: '18px 0 4px' }}>
        <span className="w num disp" style={{ fontSize: 64 }}>{kg.toFixed(1)}</span>
        <span className="u">kg</span>
      </div>
      <div className="steppers" aria-label="Adjust bodyweight">
        <div className="stp">
          <button aria-label="minus 1 kg" onClick={() => setKg((v) => clamp(v - 1))}>−</button>
          <span className="k">KG<br />±1</span>
          <button aria-label="plus 1 kg" onClick={() => setKg((v) => clamp(v + 1))}>+</button>
        </div>
        <div className="stp">
          <button aria-label="minus 0.1 kg" onClick={() => setKg((v) => clamp(v - 0.1))}>−</button>
          <span className="k">KG<br />±0.1</span>
          <button aria-label="plus 0.1 kg" onClick={() => setKg((v) => clamp(v + 0.1))}>+</button>
        </div>
      </div>
      <button
        className="btn"
        onClick={async () => {
          await db.bodylog.add({ at: Date.now(), kg });
          toastBus.show(`✓ Bodyweight · ${kg.toFixed(1)} kg`);
          onClose();
        }}
      >
        Save {kg.toFixed(1)} kg
      </button>
    </Sheet>
  );
}

/* ---------- week mini-rings ---------- */
function WeekRings({ trainedDays, todayIdx }: { trainedDays: Set<number>; todayIdx: number }) {
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const C = 75.4;
  return (
    <div className="weekrings" aria-hidden="true">
      {labels.map((d, i) => {
        const done = trainedDays.has(i);
        const today = i === todayIdx;
        return (
          <div key={i} className={`wr${today ? ' today' : ''}`}>
            <svg width="30" height="30" viewBox="0 0 30 30">
              <circle cx="15" cy="15" r="12" fill="none" stroke="rgba(var(--ember-rgb), .16)" strokeWidth="3.4" />
              {done && (
                <circle cx="15" cy="15" r="12" fill="none" stroke="var(--ember)" strokeWidth="3.4" strokeLinecap="round"
                  transform="rotate(-90 15 15)" strokeDasharray={C} strokeDashoffset={0} />
              )}
              {today && <circle cx="15" cy="15" r="2.4" fill="var(--ember)" />}
            </svg>
            <span className="lab">{d}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- hero ring ---------- */
function HeroRing({ count, target, pace }: { count: number; target: number; pace: string }) {
  const C = 578;
  const [offset, setOffset] = useState(C);
  const countTxt = useCountUp(count);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setOffset(C * (1 - Math.min(1, count / target))),
    );
    return () => cancelAnimationFrame(id);
  }, [count, target]);

  return (
    <div className="hero-ring">
      <svg width="230" height="230" viewBox="0 0 230 230" aria-label={`${count} of ${target} sessions this week`}>
        <defs>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="var(--grad-a)" /><stop offset="1" stopColor="var(--grad-b)" />
          </linearGradient>
        </defs>
        <circle cx="115" cy="115" r="92" fill="none" stroke="rgba(var(--ember-rgb), .14)" strokeWidth="20" />
        <circle className="ringfg" cx="115" cy="115" r="92" fill="none" stroke="url(#ring)" strokeWidth="20" strokeLinecap="round"
          transform="rotate(-90 115 115)" strokeDasharray={C} strokeDashoffset={offset} />
      </svg>
      <div className="center">
        <div className="k">This week</div>
        <div className="v"><span className="num disp">{countTxt}</span><small>/{target}</small></div>
        <div className="s">Sessions · {pace}</div>
      </div>
    </div>
  );
}

/* ---------- edit split sheet ---------- */
function ProgramSheet({ activeProgramId, suggestedId, onClose }: { activeProgramId: string; suggestedId: string; onClose: () => void }) {
  const programs = useLiveQuery(() => db.programs.toArray());
  const program = programs?.find((p) => p.id === activeProgramId);

  return (
    <Sheet title="Your split" onClose={onClose}>
      <span className="eyebrow" style={{ display: 'block', margin: '0 2px 10px' }}>Program</span>
      {(programs ?? []).map((p) => (
        <button
          key={p.id}
          className={`opt${p.id === activeProgramId ? ' sel' : ''}`}
          onClick={async () => {
            await db.settings.update(1, { activeProgramId: p.id, nextDayId: null });
          }}
        >
          <div>
            <div className="nm">{p.name}</div>
            <div className="mu">{p.days.length} days · {p.days.map((d) => d.name.split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i).join(' / ')}</div>
          </div>
          <span className="r">{p.id === activeProgramId ? 'Active' : 'Switch'}</span>
        </button>
      ))}

      <span className="eyebrow" style={{ display: 'block', margin: '16px 2px 10px' }}>Next session</span>
      {(program?.days ?? []).map((d) => (
        <button
          key={d.id}
          className={`opt${d.id === suggestedId ? ' sel' : ''}`}
          onClick={async () => {
            await db.settings.update(1, { nextDayId: d.id });
            onClose();
          }}
        >
          <div>
            <div className="nm">{d.name}</div>
            <div className="mu">{d.subtitle}</div>
          </div>
          <span className="r">{d.id === suggestedId ? 'Up next' : 'Do next'}</span>
        </button>
      ))}
    </Sheet>
  );
}
