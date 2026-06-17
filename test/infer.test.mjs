import { test } from 'node:test';
import assert from 'node:assert/strict';
import { infer } from '../src/infer.js';
import { evalRule } from '../src/compile.js';

// The core promise: applying the inferred draft to fromUrl must produce toUrl.
function roundTrips(fromUrl, toUrl) {
  const draft = infer(fromUrl, toUrl);
  const r = evalRule({ from: draft.from, to: draft.to }, fromUrl);
  return r.matched && r.resultUrl === toUrl;
}

test('same path, different origin -> generalizes by capturing the path', () => {
  assert.deepEqual(infer('https://www.reddit.com/r/foo', 'https://old.reddit.com/r/foo'), {
    from: 'https://www.reddit.com/*',
    to: 'https://old.reddit.com/$1',
  });
  assert.deepEqual(infer('https://twitter.com/elonmusk', 'https://nitter.net/elonmusk'), {
    from: 'https://twitter.com/*',
    to: 'https://nitter.net/$1',
  });
});

test('inferred origin-swap rule generalizes to other paths', () => {
  const draft = infer('https://medium.com/@a/post-1', 'https://scribe.rip/@a/post-1');
  // a different article should also redirect
  const r = evalRule({ from: draft.from, to: draft.to }, 'https://medium.com/@b/other-9');
  assert.equal(r.resultUrl, 'https://scribe.rip/@b/other-9');
});

test('round-trips on the example pair for several shapes', () => {
  assert.ok(roundTrips('https://www.reddit.com/r/foo', 'https://old.reddit.com/r/foo'));
  assert.ok(roundTrips('https://twitter.com/elonmusk', 'https://nitter.net/elonmusk'));
  assert.ok(roundTrips('https://a.com/p?q=1', 'https://b.com/p?q=1'));
  assert.ok(roundTrips('http://x.io/docs/intro', 'http://x.io/help/intro')); // same origin, path tweak
});

test('non-URL inputs fall back to generic prefix/suffix diff', () => {
  const draft = infer('keep-this-VALUE-end', 'keep-this-OTHER-end');
  assert.equal(draft.from, 'keep-this-*-end');
  // constant swap: result hardcodes the new middle
  const r = evalRule({ from: draft.from, to: draft.to }, 'keep-this-VALUE-end');
  assert.equal(r.resultUrl, 'keep-this-OTHER-end');
});

test('empty inputs return empty draft', () => {
  assert.deepEqual(infer('', 'x'), { from: '', to: 'x' });
  assert.deepEqual(infer('x', ''), { from: 'x', to: '' });
});
