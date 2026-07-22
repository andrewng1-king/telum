import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const svg = await readFile(resolve(root, 'public/icon.svg'));

const jobs = [
  { file: 'pwa-192.png', size: 192 },
  { file: 'pwa-512.png', size: 512 },
  { file: 'pwa-maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180 },
];

for (const { file, size, maskable } of jobs) {
  let img = sharp(svg, { density: 300 }).resize(size, size);
  if (maskable) {
    // shrink art into the 80% safe zone on a black field
    const inner = Math.round(size * 0.8);
    const art = await sharp(svg, { density: 300 }).resize(inner, inner).png().toBuffer();
    img = sharp({ create: { width: size, height: size, channels: 4, background: '#000000' } })
      .composite([{ input: art, gravity: 'center' }]);
  }
  await img.png().toFile(resolve(root, 'public', file));
  console.log('✓', file);
}
