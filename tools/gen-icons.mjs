// Generate icons/icon-{16,48,128}.png by rendering a small SVG in chromium.
// No design-tool dependency: we already have Playwright's chromium for the gates.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// A rounded indigo tile with a bold white "turn" arrow (reroute = change direction).
const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6366f1"/>
      <stop offset="1" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="128" height="128" rx="28" fill="url(#g)"/>
  <g fill="none" stroke="#ffffff" stroke-width="13" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 88 H78 V52"/>
  </g>
  <path d="M78 30 L62 54 H94 Z" fill="#ffffff"/>
</svg>`;

const sizes = [16, 48, 128];
const browser = await chromium.launch();
try {
  for (const size of sizes) {
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;padding:0">
       <div style="width:${size}px;height:${size}px">${svg.replace('viewBox', `width="${size}" height="${size}" viewBox`)}</div>
       </body></html>`,
      { waitUntil: 'load' }
    );
    await page.screenshot({ path: join(root, 'icons', `icon-${size}.png`), omitBackground: true });
    await page.close();
    console.log(`wrote icons/icon-${size}.png`);
  }
} finally {
  await browser.close();
}
