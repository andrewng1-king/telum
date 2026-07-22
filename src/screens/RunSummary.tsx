import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { Go } from '../App';
import type { RunPoint } from '../types';
import { fmtCardDate, fmtClock, fmtKm, fmtPace, fmtShortDate } from '../lib/format';
import { exportCardPng } from '../lib/exportCard';
import { toastBus } from '../lib/ui';

type Orient = 'portrait' | 'story';
const RATIO: Record<Orient, number> = { portrait: 5 / 4, story: 16 / 9 };
const PREVIEW_MAX_H = 380;

export function RunSummary({ go, runId }: { go: Go; runId: number }) {
  const [orient, setOrient] = useState<Orient>('portrait');
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const run = useLiveQuery(() => db.runs.get(runId), [runId]);

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

  if (!run) return <section className="screen" />;

  const naturalH = wrapW * RATIO[orient];
  const scale = wrapW > 0 ? Math.min(1, PREVIEW_MAX_H / naturalH) : 1;
  const durMin = Math.max(1, Math.round(run.movingSec / 60));
  const bestSplit = run.splits.length ? Math.min(...run.splits) : 0;

  const exportImage = async () => {
    const el = cardRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      await exportCardPng(el, '#050403', `telum-run-${orient}.png`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastBus.show('Export failed — try again');
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="screen" aria-label="Run summary">
      <div className="head l">
        <button className="ic" aria-label="Back" onClick={() => go('history')}>
          <svg width="17" height="17" viewBox="0 0 17 17">
            <path d="M11 3L5.5 8.5 11 14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="t">Run</span>
      </div>
      <span className="eyebrow subline">{fmtShortDate(run.finishedAt ?? run.startedAt)} · Complete</span>

      <div className="prg" style={{ marginTop: 6 }}>
        <div className="prc"><div className="k">Distance</div><div className="v num">{fmtKm(run.distanceM)} <u>km</u></div></div>
        <div className="prc"><div className="k">Moving time</div><div className="v num">{fmtClock(Math.round(run.movingSec))}</div></div>
        <div className="prc"><div className="k">Avg pace</div><div className="v num">{fmtPace(run.avgPaceSec)} <u>/km</u></div></div>
        <div className="prc">
          <div className="k">Est. burn</div>
          <div className="v num">{run.kcal > 0 ? <>{run.kcal} <u>kcal</u></> : <>— <u>log bodyweight</u></>}</div>
        </div>
      </div>

      {run.splits.length > 0 && (
        <>
          <span className="lt eyebrow">Splits{bestSplit ? ` · best ${fmtPace(bestSplit)}` : ''}</span>
          <div className="chips" style={{ marginBottom: 4, flexWrap: 'wrap' }}>
            {run.splits.map((s, i) => (
              <div key={i} className={`chip${s === bestSplit ? ' cur' : ' done'}`} style={{ flex: '1 0 20%' }}>
                <span className="cn">KM {i + 1}</span>
                {fmtPace(s)}
              </div>
            ))}
          </div>
        </>
      )}

      <span className="lt eyebrow">Your card · preview at reduced size · exports at 1080 px</span>
      <div className="cardwrap" ref={setWrapEl} style={wrapW > 0 ? { height: naturalH * scale } : undefined}>
        <div className="cardscale" style={{ transform: `scale(${scale})` }}>
          <div className={`scard runcard o-${orient === 'story' ? 'story' : 'portrait'}`} ref={cardRef}>
            <div className="brand">
              <span className="wm">TE<b>L</b>UM</span>
              <span className="dt">{fmtCardDate(run.finishedAt ?? run.startedAt)}</span>
            </div>
            <h3>Run</h3>
            <p className="loc">{fmtKm(run.distanceM)} km · {fmtPace(run.avgPaceSec)} /km</p>
            <RouteTrace points={run.points} />
            <div className="sstats">
              <div><div className="k">Distance</div><div className="v num">{fmtKm(run.distanceM)}<u>km</u></div></div>
              <div><div className="k">Pace</div><div className="v num">{fmtPace(run.avgPaceSec)}<u>/km</u></div></div>
              <div><div className="k">Time</div><div className="v num">{durMin}<u>m</u></div></div>
            </div>
          </div>
        </div>
      </div>

      <span className="lt eyebrow">Format</span>
      <div className="segbtns" role="listbox" aria-label="Card format">
        {(['portrait', 'story'] as Orient[]).map((o) => (
          <button key={o} className={orient === o ? 'sel' : ''} onClick={() => setOrient(o)} role="option" aria-selected={orient === o}>
            {o === 'portrait' ? 'Portrait · 4:5' : 'Story · 9:16'}
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

/* ---------- abstract route polyline — no map tiles, all brand ---------- */
function RouteTrace({ points }: { points: RunPoint[] }) {
  if (points.length < 2) {
    return (
      <svg className="trace" viewBox="0 0 300 170" aria-label="Route">
        <path d="M20,85 L280,85" fill="none" stroke="#FF5A1F" strokeWidth="2.6" strokeLinecap="round" opacity=".5" />
      </svg>
    );
  }
  // downsample long runs so the path stays light
  const step = Math.max(1, Math.floor(points.length / 300));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  const lats = pts.map((p) => p.lat);
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * kx);
  const ys = pts.map((p) => -p.lat); // north up
  const minX = Math.min(...xs); const maxX = Math.max(...xs);
  const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const W = 300; const H = 170; const PAD = 16;
  const s = Math.min((W - 2 * PAD) / Math.max(1e-9, maxX - minX), (H - 2 * PAD) / Math.max(1e-9, maxY - minY));
  const ox = (W - (maxX - minX) * s) / 2;
  const oy = (H - (maxY - minY) * s) / 2;
  const X = (i: number) => ox + (xs[i] - minX) * s;
  const Y = (i: number) => oy + (ys[i] - minY) * s;
  const d = `M${pts.map((_, i) => `${X(i).toFixed(1)},${Y(i).toFixed(1)}`).join(' L')}`;

  return (
    <svg className="trace" viewBox="0 0 300 170" aria-label="Route">
      <path d={d} fill="none" stroke="#FF5A1F" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={X(0)} cy={Y(0)} r="4" fill="none" stroke="#978f86" strokeWidth="2" />
      <circle cx={X(pts.length - 1)} cy={Y(pts.length - 1)} r="4.5" fill="#FFB25A" />
    </svg>
  );
}
