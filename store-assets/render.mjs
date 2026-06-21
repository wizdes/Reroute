// Renders all Chrome Web Store images into store-assets/images/.
//
// Every marketing frame composites the REAL product UI — the shipped screenshots
// in ../docs/screenshots/ — onto the brand background, so the art is pixel-faithful
// to what users actually see. The icon is the shipped ../icons/icon-128.png.
//
// Screenshots are PNG (crisp UI); the two promo tiles are JPEG (the store wants
// 24-bit, no-alpha for promo art). Run with: npm run store-assets
//
// No extension load needed — we render the HTML frames directly in headless
// Chromium, so none of the MV3 `--load-extension` flakiness applies.

import { chromium } from 'playwright';
import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const OUT = join(here, 'images');
mkdirSync(OUT, { recursive: true });

// --- reused real assets -----------------------------------------------------

const SHOTS = join(ROOT, 'docs', 'screenshots');
const dataUri = (p, mime = 'image/png') =>
  `data:${mime};base64,` + readFileSync(p).toString('base64');

const iconDataUri = dataUri(join(ROOT, 'icons', 'icon-128.png'));
const img = {
  editor: dataUri(join(SHOTS, '01-editor.png')),
  advanced: dataUri(join(SHOTS, '02-advanced.png')),
  debugger: dataUri(join(SHOTS, '03-debugger.png')),
  popup: dataUri(join(SHOTS, '04-popup.png')),
  empty: dataUri(join(SHOTS, '05-empty.png')),
};

const REPO = 'github.com/wizdes/Reroute';
const ABOUT = 'https://yili.dev/projects/url_reroute/';

// --- brand tokens -----------------------------------------------------------
// Accent indigo #4f46e5 (hover #4338ca). Promo bg = deep indigo/navy gradient
// #1e1b4b → #111016 so the indigo icon pops; headline text light.

const ACCENT = '#6366f1'; // a touch brighter than #4f46e5 for legibility on dark
const BADGE = '#a5b4fc'; // indigo-300 — the "Open Source · MIT" pill text on dark

// --- shared CSS -------------------------------------------------------------
// Scoped to .shot / .marq / .smtile so frames never collide.

const BASE_CSS = `
  *{margin:0;padding:0;box-sizing:border-box;}
  html,body{background:#0d0c1a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;}
  .mono{font-family:ui-monospace,SFMono-Regular,'SF Mono',Menlo,Consolas,monospace;}

  /* ---- 1280×800 captioned screenshot frame ---- */
  .shot{width:1280px;height:800px;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center;padding:56px 70px 0;
    background:radial-gradient(125% 120% at 50% -10%, #2a2363 0%, #1e1b4b 42%, #111016 100%);}
  .shot-head{text-align:center;max-width:1080px;display:flex;flex-direction:column;align-items:center;}
  .shot-headline{font-size:42px;line-height:1.1;font-weight:800;letter-spacing:-0.8px;color:#f4f4fb;}
  .shot-headline em{font-style:normal;color:${ACCENT};}
  .shot-sub{margin-top:13px;font-size:19px;line-height:1.4;font-weight:400;color:#b9b6d6;max-width:760px;}
  .shot-badge{margin-top:18px;display:inline-flex;align-items:center;gap:9px;padding:7px 16px;border-radius:999px;
    border:1.5px solid rgba(129,140,248,.5);background:rgba(99,102,241,.12);color:${BADGE};font-size:14px;font-weight:700;letter-spacing:.2px;}
  .shot-badge .dot{width:8px;height:8px;border-radius:50%;background:${ACCENT};box-shadow:0 0 0 3px rgba(99,102,241,.25);}

  /* the product "window" panel that holds a real screenshot */
  .shot-window{margin-top:34px;width:1140px;border-radius:14px;overflow:hidden;
    border:1px solid rgba(255,255,255,.10);box-shadow:0 32px 80px rgba(8,6,30,.6);background:#f6f6f8;}
  .shot-bar{height:34px;display:flex;align-items:center;gap:8px;padding:0 14px;background:#e9e9ef;border-bottom:1px solid #dededf;}
  .shot-bar i{width:11px;height:11px;border-radius:50%;display:block;}
  .shot-bar .r{background:#ff5f57;} .shot-bar .y{background:#febc2e;} .shot-bar .g{background:#28c840;}
  .shot-shot{display:block;width:100%;background:#f6f6f8;}
  /* the source captures are 2360×1800; frame the meaningful region. */
  .shot-shot--top{height:442px;object-fit:cover;object-position:top center;}      /* editor: show the form top */
  .shot-shot--debug{height:520px;object-fit:cover;object-position:top center;}    /* the empty/debug capture: verdict sits high, top-crop fits it */
  .shot-shot--full{height:524px;object-fit:contain;object-position:center;}        /* whole capture in frame (editor + verdict together) */

  /* a centered popup card (the 460×300 popup shot) on its own */
  .shot-pop-wrap{margin-top:40px;display:flex;align-items:center;justify-content:center;width:100%;}
  .shot-pop{width:430px;border-radius:16px;overflow:hidden;background:#fff;
    border:1px solid rgba(255,255,255,.12);box-shadow:0 30px 70px rgba(8,6,30,.55);}
  .shot-pop img{display:block;width:100%;}

  /* ---- 1400×560 marquee ---- */
  .marq{width:1400px;height:560px;position:relative;overflow:hidden;display:flex;align-items:center;
    background:radial-gradient(130% 130% at 8% 6%, #2c2566 0%, #1e1b4b 46%, #100f15 100%);}
  .marq-left{width:600px;flex:none;padding:0 0 0 84px;}
  .marq-brand{display:flex;align-items:center;gap:16px;}
  .marq-icon{width:60px;height:60px;border-radius:14px;box-shadow:0 8px 22px rgba(0,0,0,.45);}
  .marq-word{font-size:30px;font-weight:800;letter-spacing:-.5px;color:#f4f4fb;}
  .marq-kicker{margin-top:6px;font-size:15px;font-weight:600;letter-spacing:.4px;color:#a5b4fc;}
  .marq-title{margin-top:26px;font-size:46px;line-height:1.08;font-weight:800;letter-spacing:-1px;color:#f4f4fb;}
  .marq-title em{font-style:normal;color:${ACCENT};}
  .marq-sub{margin-top:18px;font-size:19px;line-height:1.45;color:#bcb9da;max-width:470px;}
  .marq-row{display:flex;align-items:center;gap:18px;margin-top:30px;}
  .marq-badge{display:inline-flex;align-items:center;gap:8px;padding:7px 15px;border-radius:999px;
    border:1.5px solid rgba(129,140,248,.5);background:rgba(99,102,241,.12);color:${BADGE};font-size:13.5px;font-weight:700;}
  .marq-badge .dot{width:8px;height:8px;border-radius:50%;background:${ACCENT};}
  .marq-url{font-size:15px;color:#9aa0e8;font-weight:500;}
  .marq-right{flex:1;display:flex;align-items:center;justify-content:center;height:100%;}
  .marq-card{width:560px;border-radius:14px;overflow:hidden;transform:translateY(8px) rotate(-1deg);
    border:1px solid rgba(255,255,255,.10);box-shadow:0 36px 80px rgba(6,4,24,.7);background:#f6f6f8;}
  .marq-card .shot-bar{height:30px;}
  .marq-card .shot-bar i{width:10px;height:10px;}
  .marq-card img{display:block;width:100%;height:430px;object-fit:cover;object-position:top center;}

  /* ---- 440×280 small tile ---- */
  .smtile{width:440px;height:280px;position:relative;overflow:hidden;padding:30px 30px 0;
    background:radial-gradient(140% 130% at 18% 0%, #2c2566 0%, #1e1b4b 50%, #100f15 100%);}
  .smtile-top{display:flex;align-items:center;gap:14px;}
  .smtile-icon{width:52px;height:52px;border-radius:13px;box-shadow:0 6px 16px rgba(0,0,0,.45);}
  .smtile-word{font-size:25px;font-weight:800;letter-spacing:-.4px;color:#f4f4fb;line-height:1.05;}
  .smtile-tag{margin-top:16px;font-size:15.5px;line-height:1.4;color:#bcb9da;max-width:330px;}
  .smtile-badge{position:absolute;top:24px;right:24px;display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:999px;
    border:1.4px solid rgba(129,140,248,.5);background:rgba(99,102,241,.14);color:${BADGE};font-size:11px;font-weight:800;letter-spacing:.3px;}
  .smtile-badge .dot{width:6px;height:6px;border-radius:50%;background:${ACCENT};}
  .smtile-chip{position:absolute;left:30px;right:30px;bottom:26px;border-radius:10px;padding:13px 16px;
    background:rgba(255,255,255,.06);border:1px solid rgba(129,140,248,.28);}
  .smtile-chip .from{font-size:13px;color:#cfd0f5;}
  .smtile-chip .arrow{color:${ACCENT};font-weight:800;}
`;

const doc = (body) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${BASE_CSS}</style></head><body>${body}</body></html>`;

const badge = () => `<span class="shot-badge"><span class="dot"></span>Open Source · MIT</span>`;

// the macOS-style window chrome bar
const bar = () => `<div class="shot-bar"><i class="r"></i><i class="y"></i><i class="g"></i></div>`;

// a 1280×800 captioned frame holding one real screenshot in a window panel.
// crop = 'top' (editor) or 'debug' (taller, fits the DEBUG-ANY-URL verdict).
const shotWindow = (headline, sub, src, crop = 'top') =>
  doc(`<div class="shot">
    <div class="shot-head">
      <div class="shot-headline">${headline}</div>
      <div class="shot-sub">${sub}</div>
      ${badge()}
    </div>
    <div class="shot-window">
      ${bar()}
      <img class="shot-shot shot-shot--${crop}" src="${src}" alt="">
    </div>
  </div>`);

// a 1280×800 frame featuring the small popup card on its own
const shotPopup = (headline, sub, src) =>
  doc(`<div class="shot">
    <div class="shot-head">
      <div class="shot-headline">${headline}</div>
      <div class="shot-sub">${sub}</div>
      ${badge()}
    </div>
    <div class="shot-pop-wrap"><div class="shot-pop">${bar()}<img src="${src}" alt=""></div></div>
  </div>`);

// --- asset specs ------------------------------------------------------------

const assets = [
  {
    name: 'screenshot-1-editor.png',
    w: 1280, h: 800,
    html: shotWindow(
      'Redirect any URL with one simple <em>*</em> rule',
      'Write a From pattern with <span class="mono">*</span> and a To target with <span class="mono">$1</span>. That is the whole language.',
      img.editor,
    ),
  },
  {
    name: 'screenshot-2-debugger.png',
    w: 1280, h: 800,
    html: shotWindow(
      'See exactly which rule fires <em>before</em> you save',
      'The reverse "Debug any URL" tester shows where a URL lands — or why no rule matched. No more save-and-pray.',
      img.debugger,
      'full',
    ),
  },
  {
    name: 'screenshot-3-empty.png',
    w: 1280, h: 800,
    html: shotWindow(
      'What you debug is <em>exactly</em> what ships',
      'The debugger and the live redirect run the same compiler — its verdict is the production verdict.',
      img.empty,
      'debug',
    ),
  },
  {
    name: 'screenshot-4-advanced.png',
    w: 1280, h: 800,
    html: shotWindow(
      'Priority by drag-order, with per-rule scope',
      'Reorder rules so the topmost match wins; under Advanced, target top-level pages, iframes, or both.',
      img.advanced,
    ),
  },
  {
    name: 'screenshot-5-popup.png',
    w: 1280, h: 800,
    html: shotPopup(
      'One toolbar switch. No backend. No tracking.',
      'Toggle every rule on or off from the popup, with a live count. Pure MV3, about 50&nbsp;KB — import/export as JSON.',
      img.popup,
    ),
  },
  {
    name: 'promo-marquee-1400x560.jpg',
    w: 1400, h: 560,
    type: 'jpeg',
    html: doc(`<div class="marq">
      <div class="marq-left">
        <div class="marq-brand"><img class="marq-icon" src="${iconDataUri}" alt="">
          <div><div class="marq-word">Reroute</div><div class="marq-kicker">URL Rerouter for Chrome</div></div>
        </div>
        <div class="marq-title">Redirect URLs.<br><em>Test them</em> first.</div>
        <div class="marq-sub">Simple <span class="mono">*</span> → <span class="mono">$1</span> wildcard rules, with a reverse debugger that proves what each rule does before you save.</div>
        <div class="marq-row">
          <span class="marq-badge"><span class="dot"></span>Open Source · MIT</span>
          <span class="marq-url">${REPO}</span>
        </div>
      </div>
      <div class="marq-right">
        <div class="marq-card">${bar()}<img src="${img.debugger}" alt=""></div>
      </div>
    </div>`),
  },
  {
    name: 'promo-small-440x280.jpg',
    w: 440, h: 280,
    type: 'jpeg',
    html: doc(`<div class="smtile">
      <span class="smtile-badge"><span class="dot"></span>OPEN SOURCE</span>
      <div class="smtile-top"><img class="smtile-icon" src="${iconDataUri}" alt=""><div class="smtile-word">Reroute</div></div>
      <div class="smtile-tag">Redirect URLs with simple wildcard rules — and test them before you save.</div>
      <div class="smtile-chip mono">
        <span class="from">github.com/*</span> <span class="arrow">→</span> <span class="from">dev.github.com/$1</span>
      </div>
    </div>`),
  },
];

// --- render -----------------------------------------------------------------

const browser = await chromium.launch();
for (const a of assets) {
  const page = await browser.newPage({ viewport: { width: a.w, height: a.h }, deviceScaleFactor: 1 });
  await page.setContent(a.html, { waitUntil: 'load' });
  await page.waitForTimeout(120); // let fonts/layout settle
  const path = join(OUT, a.name);
  if (a.type === 'jpeg') await page.screenshot({ path, type: 'jpeg', quality: 95 });
  else await page.screenshot({ path, type: 'png' });
  await page.close();
  console.log('✓', a.name, `${a.w}×${a.h}`);
}
await browser.close();

// Store icon is the shipped icon, reused verbatim.
copyFileSync(join(ROOT, 'icons', 'icon-128.png'), join(OUT, 'store-icon-128.png'));
console.log('✓ store-icon-128.png 128×128 (copied from icons/icon-128.png)');
console.log('\nImages written to store-assets/images/');
