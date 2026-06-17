// UI integration + screenshots. The editor, live tester, inference and reverse debugger
// are pure client logic over src/compile.js + src/infer.js — they need no extension. We
// serve the project over http, open the real options.html in plain chromium (storage
// falls back to localStorage + a seed), drive the real feature flow, assert the visible
// results, and capture the screenshot strip used in the handoff.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shotDir = join(root, 'docs', 'screenshots');
mkdirSync(shotDir, { recursive: true });

const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

let failures = 0;
const ok = (c, m) => { if (c) console.log(`  PASS ${m}`); else { failures++; console.error(`  FAIL ${m}`); } };

const SEED = [
  { id: 'r-gh', name: 'GitHub → dev', enabled: true,
    from: 'https://github.com/*', to: 'https://dev.github.com/$1',
    resourceTypes: ['main_frame'],
    examples: ['https://github.com/foo/bar', 'https://gist.github.com/x'] },
  { id: 'r-old', name: 'old blog', enabled: false,
    from: 'https://blog.example.com/*', to: 'https://example.com/posts/$1',
    resourceTypes: ['main_frame'], examples: [] },
];

async function run() {
  const server = http.createServer(async (req, res) => {
    try {
      const p = join(root, decodeURIComponent(req.url.split('?')[0]));
      const body = await readFile(p);
      res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
      res.end(body);
    } catch { res.writeHead(404); res.end('not found'); }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1180, height: 900 }, deviceScaleFactor: 2 });
    await page.addInitScript((seed) => {
      window.__REROUTE_SEED__ = seed;
      window.__REROUTE_MOCK_TAB__ = 'https://github.com/anthropics/claude-code';
    }, SEED);
    await page.goto(`${base}/ui/options.html`, { waitUntil: 'networkidle' });

    // list shows seeded rules
    ok((await page.locator('.rule-item').count()) === 2, 'rule list shows both seeded rules');

    // select the GitHub rule, check the live tester results
    await page.locator('.rule-item', { hasText: 'GitHub' }).click();
    await page.waitForSelector('.examples .result');
    const results = page.locator('.examples .result');
    const first = await results.nth(0);
    const second = await results.nth(1);
    ok((await first.getAttribute('class')).includes('match'), 'matching example shows a match');
    ok((await first.textContent()).includes('https://dev.github.com/foo/bar'), 'shows the correct redirected URL');
    ok((await first.locator('mark').count()) >= 1, 'captured segment is highlighted');
    ok((await second.getAttribute('class')).includes('nomatch'), 'non-matching example shows no match');
    await page.screenshot({ path: join(shotDir, '01-tester.png') });

    // break the pattern -> live error/no-match without saving
    const toInput = page.locator('#rule-editor input.mono').nth(1);
    await toInput.fill('https://dev.github.com/$3');
    await page.waitForTimeout(120);
    ok((await page.locator('.errors').textContent()).includes('$3'), 'invalid $3 reference is reported inline');
    await toInput.fill('https://dev.github.com/$1'); // restore
    await page.waitForTimeout(120);

    // reverse debugger (run while the GitHub rule is still intact)
    await page.locator('#debugger input').fill('https://github.com/anthropics/claude-code');
    await page.locator('#debugger').getByText('Check').click();
    await page.waitForTimeout(120);
    ok((await page.locator('.debug-winner').textContent()).includes('dev.github.com/anthropics/claude-code'),
      'reverse debugger names the resulting URL');
    ok((await page.locator('.debug-reasons .pill').count()) >= 2, 'reverse debugger explains every rule');
    await page.locator('#debugger').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotDir, '03-debugger.png') });

    // inference: from->to draft replaces the selected rule and matches live
    await page.locator('.infer-grid input').nth(0).fill('https://twitter.com/elonmusk');
    await page.locator('.infer-grid input').nth(1).fill('https://nitter.net/elonmusk');
    await page.getByText('Suggest rule').click();
    await page.waitForTimeout(150);
    const fromVal = await page.locator('#rule-editor input.mono').nth(0).inputValue();
    ok(fromVal === 'https://twitter.com/*', 'inference drafted the wildcard pattern');
    ok((await page.locator('.examples .result').first().getAttribute('class')).includes('match'),
      'the inferred rule immediately matches its example');
    await page.locator('#rule-editor').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotDir, '02-inference.png') });

    // popup
    const pop = await browser.newPage({ viewport: { width: 230, height: 150 }, deviceScaleFactor: 2 });
    await pop.addInitScript((seed) => { window.__REROUTE_SEED__ = seed; }, SEED);
    await pop.goto(`${base}/ui/popup.html`, { waitUntil: 'networkidle' });
    ok((await pop.locator('#status').textContent()).includes('active rule'), 'popup shows active rule count');
    await pop.screenshot({ path: join(shotDir, '04-popup.png') });
  } finally {
    await browser.close();
    server.close();
  }
}

await run();
console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : failures + ' UI CHECK(S) FAILED'} — screenshots in docs/screenshots/`);
process.exit(failures === 0 ? 0 : 1);
