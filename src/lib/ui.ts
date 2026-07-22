import { useEffect, useRef, useState } from 'react';

// ---------- toast pubsub ----------
type ToastFn = (msg: string) => void;
let toastListener: ToastFn | null = null;

export const toastBus = {
  show(msg: string) { toastListener?.(msg); },
  bind(fn: ToastFn): () => void {
    toastListener = fn;
    return () => { if (toastListener === fn) toastListener = null; };
  },
};

// ---------- count-up (mockup fidelity) ----------
export function useCountUp(to: number, dec = 0, dur = 900): string {
  const [txt, setTxt] = useState('0');
  const raf = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTxt(to.toFixed(dec));
      return;
    }
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const e = 1 - Math.pow(1 - t, 3);
      setTxt((to * e).toFixed(dec));
      if (t < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [to, dec, dur]);
  return txt;
}

// ---------- ticking clock ----------
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

// ---------- screen wake lock ----------
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let dead = false;
    const acquire = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
        if (dead) lock.release().catch(() => {});
      } catch { /* low battery / not visible — fine */ }
    };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

// ---------- rest-over chime ----------
let audioCtx: AudioContext | null = null;

/** Call from a user gesture (Log Set) so iOS lets us play later. */
export function primeAudio(): void {
  try {
    audioCtx ??= new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch { /* no audio — fine */ }
}

export function restChime(): void {
  try {
    navigator.vibrate?.([120, 80, 120]);
    if (!audioCtx || audioCtx.state !== 'running') return;
    const t0 = audioCtx.currentTime;
    [880, 1174.7].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = t0 + i * 0.18;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch { /* silent gyms exist */ }
}
