// Conformance: the regex our compiler emits must behave IDENTICALLY under RE2 (the
// engine Chrome's declarativeNetRequest actually uses) and under the JS RegExp the
// editor preview uses. If these two ever disagree, the preview would lie about what
// the installed rule does. We prove they agree across a corpus of patterns and URLs,
// for both the match decision AND the captured groups.
//
// This is the automatable half of the "preview == production" guarantee. The other
// half (Chrome actually performing the redirect end to end) lives in test/browser.mjs,
// which requires a real Chrome that can run an MV3 service worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RE2 } from 're2-wasm';
import { wildcardToRegex, evalRule } from '../src/compile.js';

const PATTERNS = [
  'https://github.com/*',
  'https://a.com/*/issues/*',
  'https://exact.com/page',
  'https://q.com/*?x=1',                 // literal '?' and '='
  'http://h.io/a+b/*',                   // literal '+'
  'https://re.com/(group)/*',            // literal parens
  'https://br.com/[x]/*',                // literal brackets
  'https://dot.com/*.json',              // literal dot after wildcard
  'https://multi.com/*/*/*',             // three captures
  'https://enc.com/*%20*',               // encoded space around wildcard
];

const URLS = [
  'https://github.com/foo/bar',
  'https://github.com/',                 // empty capture
  'https://GitHub.com/foo',              // case difference
  'https://a.com/repo/issues/42',
  'https://exact.com/page',
  'https://exact.com/page/extra',        // anchoring: should NOT match
  'https://q.com/thing?x=1',
  'https://q.com/thing?x=2',
  'http://h.io/a+b/c',
  'http://h.io/aXb/c',                   // '+' is literal, not regex
  'https://re.com/(group)/z',
  'https://re.com/xgroupx/z',            // parens literal
  'https://br.com/[x]/z',
  'https://dot.com/file.json',
  'https://dot.com/fileXjson',           // '.' after wildcard is literal
  'https://multi.com/a/b/c',
  'https://enc.com/a%20b',
];

function jsExec(source, url) {
  return new RegExp(source).exec(url);
}
function re2Exec(source, url) {
  return new RE2(source, 'u').exec(url);
}

test('JS RegExp and RE2 agree on match + captures for every pattern/URL pair', () => {
  let pairs = 0;
  for (const from of PATTERNS) {
    const { source } = wildcardToRegex(from);
    for (const url of URLS) {
      const js = jsExec(source, url);
      const re2 = re2Exec(source, url);
      pairs++;

      assert.equal(
        js === null, re2 === null,
        `match decision differs for ${from} vs ${url}: js=${!!js} re2=${!!re2}`
      );

      if (js && re2) {
        const jsCaps = Array.from(js).slice(1);
        const re2Caps = Array.from(re2).slice(1);
        assert.deepEqual(
          jsCaps, re2Caps,
          `captures differ for ${from} vs ${url}: js=${JSON.stringify(jsCaps)} re2=${JSON.stringify(re2Caps)}`
        );
      }
    }
  }
  assert.ok(pairs >= 100, `expected a real corpus, got ${pairs} pairs`);
});

test('evalRule output matches RE2-driven substitution', () => {
  // The user-visible result URL must be what RE2's captures would produce.
  const cases = [
    { from: 'https://github.com/*', to: 'https://dev.github.com/$1', url: 'https://github.com/a/b' },
    { from: 'https://a.com/*/issues/*', to: 'https://b.com/$2/$1', url: 'https://a.com/repo/issues/42' },
    { from: 'https://multi.com/*/*/*', to: '$3.$2.$1', url: 'https://multi.com/x/y/z' },
  ];
  for (const c of cases) {
    const { source } = wildcardToRegex(c.from);
    const re2 = re2Exec(source, c.url);
    assert.ok(re2, `RE2 should match ${c.url}`);
    const re2Result = c.to.replace(/\$(\d)/g, (_, d) => re2[Number(d)] ?? '');
    const ours = evalRule(c, c.url);
    assert.equal(ours.resultUrl, re2Result, `result URL mismatch for ${c.url}`);
  }
});
