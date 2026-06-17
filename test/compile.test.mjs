import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeRegexLiteral,
  wildcardToRegex,
  toRegexSubstitution,
  validateRule,
  compileRule,
  toDNRRule,
  evalRule,
  debugUrl,
} from '../src/compile.js';

test('escapeRegexLiteral escapes metacharacters', () => {
  assert.equal(escapeRegexLiteral('a.b+c?'), 'a\\.b\\+c\\?');
  assert.equal(escapeRegexLiteral('https://x.com/'), 'https://x\\.com/');
});

test('wildcardToRegex anchors and counts captures', () => {
  assert.deepEqual(wildcardToRegex('https://github.com/*'), {
    source: '^https://github\\.com/(.*)$',
    captureCount: 1,
  });
  assert.deepEqual(wildcardToRegex('https://a.com/*/b/*'), {
    source: '^https://a\\.com/(.*)/b/(.*)$',
    captureCount: 2,
  });
  assert.equal(wildcardToRegex('no-wildcards').captureCount, 0);
});

test('toRegexSubstitution maps $n to \\n and escapes backslashes', () => {
  assert.equal(toRegexSubstitution('https://new.com/$1'), 'https://new.com/\\1');
  assert.equal(toRegexSubstitution('$1-$2'), '\\1-\\2');
  assert.equal(toRegexSubstitution('a\\b'), 'a\\\\b');
});

test('validateRule catches empty fields and bad references', () => {
  assert.ok(validateRule({ from: '', to: 'x' }).some((e) => /From/.test(e)));
  assert.ok(validateRule({ from: 'x', to: '' }).some((e) => /To/.test(e)));
  assert.ok(
    validateRule({ from: 'https://a.com/*', to: 'https://b.com/$2' }).some((e) => /\$2/.test(e))
  );
  assert.equal(validateRule({ from: 'https://a.com/*', to: 'https://b.com/$1' }).length, 0);
});

test('validateRule rejects more than 9 wildcards', () => {
  const from = 'x' + '*'.repeat(10);
  assert.ok(validateRule({ from, to: 'x' }).some((e) => /maximum/.test(e)));
});

test('compileRule produces the DNR pair', () => {
  assert.deepEqual(compileRule({ from: 'https://github.com/*', to: 'https://dev.github.com/$1' }), {
    regexFilter: '^https://github\\.com/(.*)$',
    regexSubstitution: 'https://dev.github.com/\\1',
  });
});

test('compileRule throws on invalid rule', () => {
  assert.throws(() => compileRule({ from: '', to: '' }));
});

test('toDNRRule builds a full dynamic rule with defaults', () => {
  const dnr = toDNRRule(
    { from: 'https://a.com/*', to: 'https://b.com/$1' },
    { id: 7, priority: 3 }
  );
  assert.deepEqual(dnr, {
    id: 7,
    priority: 3,
    action: { type: 'redirect', redirect: { regexSubstitution: 'https://b.com/\\1' } },
    condition: { regexFilter: '^https://a\\.com/(.*)$', resourceTypes: ['main_frame'] },
  });
});

test('toDNRRule honors explicit resourceTypes', () => {
  const dnr = toDNRRule(
    { from: 'https://a.com/*', to: 'https://b.com/$1', resourceTypes: ['main_frame', 'sub_frame'] },
    { id: 1, priority: 1 }
  );
  assert.deepEqual(dnr.condition.resourceTypes, ['main_frame', 'sub_frame']);
});

test('evalRule matches and substitutes', () => {
  const rule = { from: 'https://github.com/*', to: 'https://dev.github.com/$1' };
  const r = evalRule(rule, 'https://github.com/foo/bar');
  assert.equal(r.matched, true);
  assert.equal(r.resultUrl, 'https://dev.github.com/foo/bar');
  assert.deepEqual(r.captures, ['foo/bar']);
});

test('evalRule reports no match', () => {
  const rule = { from: 'https://github.com/*', to: 'https://dev.github.com/$1' };
  assert.deepEqual(evalRule(rule, 'https://gist.github.com/x'), { matched: false });
});

test('evalRule handles multiple captures', () => {
  const rule = { from: 'https://a.com/*/issues/*', to: 'https://b.com/$2/$1' };
  const r = evalRule(rule, 'https://a.com/repo/issues/42');
  assert.equal(r.resultUrl, 'https://b.com/42/repo');
});

test('evalRule must match the whole URL (anchored)', () => {
  // pattern without a trailing wildcard should not match a longer URL
  const rule = { from: 'https://a.com/page', to: 'https://b.com/' };
  assert.equal(evalRule(rule, 'https://a.com/page/extra').matched, false);
  assert.equal(evalRule(rule, 'https://a.com/page').matched, true);
});

test('evalRule returns error for invalid rule instead of throwing', () => {
  const r = evalRule({ from: 'https://a.com/*', to: '$5' }, 'https://a.com/x');
  assert.equal(r.matched, false);
  assert.match(r.error, /\$5/);
});

test('debugUrl picks the highest-priority match and explains the rest', () => {
  const rules = [
    { name: 'off', enabled: false, from: 'https://a.com/*', to: 'https://z.com/$1' },
    { name: 'first', enabled: true, from: 'https://a.com/*', to: 'https://b.com/$1' },
    { name: 'second', enabled: true, from: 'https://a.com/*', to: 'https://c.com/$1' },
    { name: 'nomatch', enabled: true, from: 'https://other.com/*', to: 'https://d.com/$1' },
  ];
  const res = debugUrl(rules, 'https://a.com/x');
  assert.equal(res.winner.rule.name, 'first');
  assert.equal(res.resultUrl, 'https://b.com/x');
  assert.equal(res.reasons[0].status, 'disabled');
  assert.equal(res.reasons[1].status, 'match');
  assert.equal(res.reasons[2].status, 'shadowed');
  assert.equal(res.reasons[3].status, 'no-match');
});

test('debugUrl reports global off', () => {
  const rules = [{ name: 'x', enabled: true, from: 'https://a.com/*', to: 'https://b.com/$1' }];
  const res = debugUrl(rules, 'https://a.com/x', false);
  assert.equal(res.winner, null);
  assert.equal(res.reasons[0].status, 'skipped');
});
