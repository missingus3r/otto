// Generate placeholder PWA icons (192 and 512) using sharp.
// Black background, white "o" in Bodoni Moda italic. Idempotent — only
// regenerates if files don't exist (or always when called explicitly).

import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const IMG_DIR = path.join(__dirname, '..', '..', 'public', 'img');
if (!fs.existsSync(IMG_DIR)) fs.mkdirSync(IMG_DIR, { recursive: true });

function svgIcon(size) {
  // We can't ship Bodoni Moda inside SVG without embedding the font;
  // use the closest serif italic available in the renderer.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#0a0908"/>
  <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
        font-family="Bodoni Moda, Bodoni 72, Didot, serif" font-style="italic"
        font-weight="400" font-size="${Math.round(size * 0.7)}" fill="#f3efe6">o</text>
</svg>`;
}

export async function ensureIcons() {
  const targets = [
    { name: 'icon-192.png', size: 192 },
    { name: 'icon-512.png', size: 512 },
  ];
  for (const t of targets) {
    const out = path.join(IMG_DIR, t.name);
    if (fs.existsSync(out)) continue;
    try {
      await sharp(Buffer.from(svgIcon(t.size)))
        .png()
        .toFile(out);
      console.log(`[pwa] generated ${t.name}`);
    } catch (err) {
      console.error(`[pwa] icon ${t.name} failed:`, err.message);
    }
  }
}

// CLI usage: node src/scripts/generateIcons.js
if (import.meta.url === `file://${process.argv[1]}`) {
  ensureIcons().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

export default ensureIcons;
