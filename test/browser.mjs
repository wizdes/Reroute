// Real-Chrome gates. Two things proven here:
//   1. CONFORMANCE: the DNR rules src/compile.js produces match URLs *identically*
//      to Chrome's real declarativeNetRequest engine (via testMatchOutcome). This is
//      the proof that the editor preview (which uses the same compile.js) tells the truth.
//   2. E2E: a real navigation is actually redirected end to end, through the full
//      storage -> background service worker -> updateDynamicRules pipeline.
//
// Run: npm run test:browser   (launches Playwright's chromium with the unpacked extension)
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toDNRRule, debugUrl } from '../src/compile.js';
import { launchWithExtension } from './_load.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const ok = (cond, msg) => { if (cond) { console.log(`  PASS ${msg}`); } else { failures++; console.error(`  FAIL ${msg}`); } };

// ---- conformance corpus: one ruleset, many URLs, compared rule-for-rule ----
const corpusRules = [
  { name: 'gh', enabled: true, from: 'https://github.com/*', to: 'https://dev.github.com/$1' },
  { name: 'two-caps', enabled: true, from: 'https://a.com/*/issues/*', to: 'https://b.com/$2/$1' },
  { name: 'exact', enabled: true, from: 'https://exact.com/page', to: 'https://done.com/' },
  { name: 'dotted', enabled: true, from: 'https://q.com/*?x=1', to: 'https://r.com/$1' },
  // overlaps 'gh' to test priority (gh is higher in the list, so it wins)
  { name: 'gh-low', enabled: true, from: 'https://github.com/*', to: 'https://low.com/$1' },
];
const corpusUrls = [
  'https://github.com/foo/bar',          // gh (gh-low shadowed)
  'https://a.com/repo/issues/42',        // two-caps
  'https://exact.com/page',              // exact
  'https://exact.com/page/extra',        // none (anchored)
  'https://GitHub.com/foo',              // none (case-sensitive host literal)
  'https://q.com/thing?x=1',             // dotted
  'https://q.com/thing?x=2',             // none (literal ?x=1)
  'https://nope.com/x',                  // none
];

async function run() {
  const { ctx: context, extPage, extId } = await launchWithExtension(root);
  console.log(`extension id: ${extId}`);

  // ---------- 1. CONFORMANCE ----------
  console.log('\n[conformance] compile.js output vs Chrome declarativeNetRequest engine');
  const hasTMO = await extPage.evaluate(() => typeof chrome.declarativeNetRequest.testMatchOutcome === 'function');
  if (!hasTMO) {
    console.error('  testMatchOutcome unavailable in this Chrome — cannot run conformance.');
    failures++;
  } else {
    const dnrRules = corpusRules.map((r, i) =>
      toDNRRule(r, { id: i + 1, priority: corpusRules.length - i })
    );
    // id -> rule index, so we can map engine matches back to our rules
    const idToIndex = Object.fromEntries(dnrRules.map((d, i) => [d.id, i]));

    await extPage.evaluate(async (rules) => {
      const existing = await chrome.declarativeNetRequest.getDynamicRules();
      await chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: existing.map((r) => r.id),
        addRules: rules,
      });
    }, dnrRules);

    for (const url of corpusUrls) {
      const res = await extPage.evaluate(
        async (u) => chrome.declarativeNetRequest.testMatchOutcome({ url: u, type: 'main_frame' }),
        url
      );
      const engineIds = (res.matchedRules || []).map((m) => m.ruleId);
      // engine winner = matched rule with highest priority (lowest list index)
      const engineWinnerIdx = engineIds.length
        ? Math.min(...engineIds.map((id) => idToIndex[id]))
        : null;
      const engineWinner = engineWinnerIdx == null ? null : corpusRules[engineWinnerIdx].name;

      const expected = debugUrl(corpusRules, url).winner?.rule.name ?? null;
      ok(engineWinner === expected,
        `${url}  ->  engine:${engineWinner ?? 'none'}  compiler:${expected ?? 'none'}`);
    }
  }

  // ---------- 2. E2E (storage -> background -> real redirect) ----------
  console.log('\n[e2e] real navigation is redirected through the full pipeline');
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><title>srv</title><body>PATH:${req.url}</body>`);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const rules = [
      { id: 'e2e1', name: 'local', enabled: true,
        from: `${base}/from/*`, to: `${base}/to/$1`, resourceTypes: ['main_frame'] },
    ];
    await extPage.evaluate(async (r) => chrome.storage.local.set({ rules: r, enabled: true }), rules);

    // wait for the background worker to install the dynamic rule
    let installed = false;
    for (let i = 0; i < 40 && !installed; i++) {
      installed = await extPage.evaluate(async () => {
        const dyn = await chrome.declarativeNetRequest.getDynamicRules();
        return dyn.some((d) => d.action?.type === 'redirect');
      });
      if (!installed) await new Promise((r) => setTimeout(r, 100));
    }
    ok(installed, 'background installed the dynamic rule from storage');

    const page = await context.newPage();
    await page.goto(`${base}/from/hello/world`, { waitUntil: 'domcontentloaded' });
    ok(page.url() === `${base}/to/hello/world`, `address bar landed on ${page.url()}`);
    const body = await page.textContent('body');
    ok(/PATH:\/to\/hello\/world/.test(body), `server served the redirected path (${body})`);

    // negative: a non-matching URL is NOT redirected
    await page.goto(`${base}/other/x`, { waitUntil: 'domcontentloaded' });
    ok(page.url() === `${base}/other/x`, 'non-matching URL is left alone');
    await page.close();
  } finally {
    server.close();
  }

  await context.close();
}

await run();
console.log(`\n${failures === 0 ? 'ALL BROWSER GATES PASSED' : failures + ' BROWSER CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
