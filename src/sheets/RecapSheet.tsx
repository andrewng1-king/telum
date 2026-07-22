import { useLayoutEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { fmtTonnes, fmtW, monthName } from '../lib/format';
import { monthRecap } from '../lib/stats';
import { exportCardPng } from '../lib/exportCard';
import { toastBus } from '../lib/ui';
import { Sheet } from '../components/Sheet';

const MO3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
/** Preview cap — the card is an illustrative example; exports render at 1080 px. */
const PREVIEW_MAX_H = 360;

export function RecapSheet({ onClose }: { onClose: () => void }) {
  const [monthOffset, setMonthOffset] = useState(0);
  const [exporting, setExporting] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const base = new Date();
  base.setDate(1);
  base.setMonth(base.getMonth() + monthOffset);
  const year = base.getFullYear();
  const month = base.getMonth();

  const recap = useLiveQuery(() => monthRecap(year, month), [year, month]);

  // same callback-ref measurement as the Summary preview
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
  const naturalH = wrapW * (5 / 4);
  const scale = wrapW > 0 ? Math.min(1, PREVIEW_MAX_H / naturalH) : 1;

  const exportImage = async () => {
    const el = cardRef.current;
    if (!el || exporting) return;
    setExporting(true);
    try {
      await exportCardPng(el, '#050403', `telum-recap-${MO3[month].toLowerCase()}-${year}.png`);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') toastBus.show('Export failed — try again');
    } finally {
      setExporting(false);
    }
  };

  const maxWeek = recap ? Math.max(1, ...recap.weeks) : 1;
  const bwDelta = recap && recap.bwStart != null && recap.bwEnd != null
    ? Math.round((recap.bwEnd - recap.bwStart) * 10) / 10
    : null;

  return (
    <Sheet title="Monthly recap" onClose={onClose}>
      <div className="head l" style={{ padding: '0 0 6px' }}>
        <button className="ic" aria-label="Previous month" onClick={() => setMonthOffset((v) => v - 1)}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <span className="t" style={{ fontSize: 24 }}>{monthName(base.getTime())} {year}</span>
        <button className="ic" aria-label="Next month" style={{ marginLeft: 'auto' }} disabled={monthOffset >= 0} onClick={() => setMonthOffset((v) => Math.min(0, v + 1))}>
          <svg width="16" height="16" viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
      </div>

      {recap === undefined ? null : recap === null ? (
        <div className="empty">
          <div className="big">Nothing this month</div>
          <p>No finished sessions in {monthName(base.getTime())} — flip back a month.</p>
        </div>
      ) : (
        <>
          <div className="cardwrap" ref={setWrapEl} style={wrapW > 0 ? { height: naturalH * scale } : undefined}>
            <div className="cardscale" style={{ transform: `scale(${scale})` }}>
              <div className="scard recap" ref={cardRef}>
                <div className="brand">
                  <span className="wm">TE<b>L</b>UM</span>
                  <span className="dt">{MO3[month]} {year}</span>
                </div>
                <h3>{monthName(base.getTime())} recap</h3>
                <p className="loc">
                  {recap.sessions} session{recap.sessions === 1 ? '' : 's'} · {(recap.durationSec / 3600).toFixed(1)} h under load
                  {bwDelta != null && bwDelta !== 0 ? ` · bw ${bwDelta > 0 ? '+' : '−'}${Math.abs(bwDelta)} kg` : ''}
                </p>
                <div className="mbars" aria-label="Sessions per week">
                  {recap.weeks.map((n, i) => (
                    <div key={i} className={`mb${n === 0 ? ' zero' : ''}`}>
                      <i style={{ height: `${Math.max(6, (n / maxWeek) * 100)}%` }} />
                      <span>W{i + 1}</span>
                    </div>
                  ))}
                </div>
                {recap.topGains.length > 0 && (
                  <div className="gains">
                    {recap.topGains.map((g) => (
                      <div key={g.name} className="g">
                        <span className="gn">{g.name}</span>
                        <span className="gv">▲ +{fmtW(g.deltaKg)} kg e1RM</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="sstats">
                  <div><div className="k">Volume</div><div className="v num">{fmtTonnes(recap.volumeKg)}<u>t</u></div></div>
                  <div><div className="k">PRs</div><div className="v num">{recap.prCount}</div></div>
                  <div><div className="k">Sessions</div><div className="v num">{recap.sessions}</div></div>
                </div>
              </div>
            </div>
          </div>

          <button className="btn" onClick={exportImage} disabled={exporting}>
            {exporting ? 'Rendering…' : 'Export recap'}
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M8 1v9M4.5 6.5L8 10l3.5-3.5M2 11v3h12v-3" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}
    </Sheet>
  );
}
