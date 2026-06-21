// UI integration + screenshots. The editor and reverse debugger are pure client logic
// over src/compile.js — they need no extension. We serve the project over http, open the
// real options.html in plain chromium (storage falls back to localStorage + a seed), drive
// the real feature flow, assert the visible results, and capture the screenshot strip.
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
    }, SEED);
    await page.goto(`${base}/ui/options.html`, { waitUntil: 'networkidle' });

    // list shows seeded rules; New rule lives in the left column
    ok((await page.locator('.rule-item').count()) === 2, 'rule list shows both seeded rules');
    ok((await page.locator('.sidebar #new-rule-btn').count()) === 1, '“+ New rule” is in the left column');

    // select the GitHub rule -> the editor panel shows and the row reads as selected/connected
    await page.locator('.rule-item', { hasText: 'GitHub' }).click();
    await page.waitForSelector('.card.rule-panel');
    ok((await page.locator('.rule-item.selected', { hasText: 'GitHub' }).count()) === 1, 'selected row carries the connected state');

    // the per-rule Test box and the inference card are gone
    ok((await page.locator('.examples').count()) === 0, 'the per-rule Test box is removed');
    ok((await page.locator('.infer-grid').count()) === 0, '“Make a rule from an example” is removed');

    // Delete sits at the bottom of the editor, centered
    ok((await page.locator('#rule-editor .editor-delete .btn.danger').count()) === 1, 'Delete is at the bottom of the editor');
    await page.screenshot({ path: join(shotDir, '01-editor.png') });

    // Applies-to is hidden until Advanced is opened
    ok(!(await page.locator('.advanced-body').isVisible()), 'Applies-to is hidden until Advanced is opened');
    await page.locator('.advanced-toggle').click();
    await page.waitForTimeout(80);
    ok(await page.locator('.advanced-body').isVisible(), 'Advanced reveals Applies-to');
    await page.screenshot({ path: join(shotDir, '02-advanced.png') });

    // inline validation still works as you type
    const toInput = page.locator('#rule-editor input.mono').nth(1);
    await toInput.fill('https://dev.github.com/$3');
    await page.waitForTimeout(120);
    ok((await page.locator('.errors').textContent()).includes('$3'), 'invalid $3 reference is reported inline');
    await toInput.fill('https://dev.github.com/$1'); // restore
    await page.waitForTimeout(120);

    // reverse debugger — testing now lives here
    await page.locator('#debugger input').fill('https://github.com/octocat/Hello-World');
    await page.locator('#debugger').getByText('Check').click();
    await page.waitForTimeout(120);
    ok((await page.locator('.debug-winner').textContent()).includes('dev.github.com/octocat/Hello-World'),
      'reverse debugger names the resulting URL');
    ok((await page.locator('.debug-reasons .pill').count()) >= 2, 'reverse debugger explains every rule');
    await page.locator('#debugger').scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(shotDir, '03-debugger.png') });

    // “+ New rule” adds a rule to the sidebar list
    const before = await page.locator('.rule-item').count();
    await page.locator('.sidebar #new-rule-btn').click();
    await page.waitForTimeout(80);
    ok((await page.locator('.rule-item').count()) === before + 1, '“+ New rule” adds a rule to the list');
    ok((await page.locator('#rule-editor input[type="text"]').first().inputValue()) === 'New rule 1',
      'new rule gets a unique default name “New rule 1”');
    const namesAfterAdd = await page.locator('.rule-item .rule-name').allInnerTexts();
    ok(namesAfterAdd[namesAfterAdd.length - 1] === 'New rule 1',
      'new rule is appended at the bottom of the list');
    await page.locator('.sidebar #new-rule-btn').click();
    await page.waitForTimeout(80);
    ok((await page.locator('#rule-editor input[type="text"]').first().inputValue()) === 'New rule 2',
      'the next new rule increments to “New rule 2”');

    // popup
    const pop = await browser.newPage({ viewport: { width: 230, height: 150 }, deviceScaleFactor: 2 });
    await pop.addInitScript((seed) => { window.__REROUTE_SEED__ = seed; }, SEED);
    await pop.goto(`${base}/ui/popup.html`, { waitUntil: 'networkidle' });
    ok((await pop.locator('#status').textContent()).includes('active rule'), 'popup shows active rule count');
    await pop.screenshot({ path: join(shotDir, '04-popup.png') });

    // delete every rule -> empty state shows the centered message and NO center button
    let guard = 0;
    while ((await page.locator('#rule-editor .editor-delete .btn.danger').count()) && guard++ < 12) {
      await page.locator('#rule-editor .editor-delete .btn.danger').click();
      await page.waitForTimeout(40);
    }
    ok((await page.locator('.list-empty').count()) === 1, 'empty list shows the “No rules yet” message');
    ok((await page.locator('.editor-empty .btn').count()) === 0, 'no “+ New rule” button in the center empty state');
    ok((await page.locator('.sidebar #new-rule-btn').count()) === 1, 'the only New rule button is in the sidebar');
    await page.screenshot({ path: join(shotDir, '05-empty.png') });
  } finally {
    await browser.close();
    server.close();
  }
}

await run();
console.log(`\n${failures === 0 ? 'ALL UI CHECKS PASSED' : failures + ' UI CHECK(S) FAILED'} — screenshots in docs/screenshots/`);
process.exit(failures === 0 ? 0 : 1);
