import { domToBlob } from 'modern-screenshot';
import { toastBus } from './ui';

/**
 * Render a share card to a 1080px-wide PNG and hand it to the share sheet
 * (download fallback). Always borderless — the hairline border is a preview
 * affordance, not part of the artwork. A matte flattens + squares the corners;
 * matte: null keeps true transparency (the Clear skin's point).
 */
export async function exportCardPng(el: HTMLElement, matte: string | null, filename: string): Promise<void> {
  // the preview scaler shrinks the card's bounding rect, and the capture sizes
  // its canvas from that rect — neutralize the transform while rendering so
  // exports always come out at the full 1080px
  const scaler = el.closest<HTMLElement>('.cardscale');
  const prevTf = scaler ? scaler.style.transform : '';
  if (scaler) scaler.style.transform = 'none';
  let blob: Blob | null;
  try {
    blob = await domToBlob(el, {
      scale: 1080 / el.offsetWidth,
      type: 'image/png',
      style: { border: 'none', ...(matte ? { borderRadius: '0' } : {}) },
      ...(matte ? { backgroundColor: matte } : {}),
    });
  } finally {
    if (scaler) scaler.style.transform = prevTf;
  }
  if (!blob) throw new Error('render failed');
  const file = new File([blob], filename, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file] });
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    toastBus.show('✓ Card saved');
  }
}
