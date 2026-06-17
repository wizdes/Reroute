// Infer a draft wildcard rule from a single before/after example pair.
//
// The result is a STARTING POINT the user verifies in the live tester, not a guarantee.
// It is correct-by-construction for the example given (applying the draft to fromUrl
// yields toUrl), and for the most common redirect shape — same path, different origin
// (reddit -> old.reddit, twitter -> nitter, medium -> scribe) — it generalizes by
// capturing the whole path.

export function commonPrefixLen(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

// Length of the common suffix, not overlapping the first `reserve` chars.
export function commonSuffixLen(a, b, reserve = 0) {
  const aMax = a.length - reserve;
  const bMax = b.length - reserve;
  let i = 0;
  while (i < aMax && i < bMax && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
  return i;
}

export function infer(fromUrl, toUrl) {
  const from = (fromUrl ?? '').trim();
  const to = (toUrl ?? '').trim();
  if (!from || !to) return { from, to };

  // Same path + query + hash, different origin -> capture the whole path. This is the
  // canonical "mirror this site" redirect, and it generalizes to every page on the site.
  try {
    const f = new URL(from);
    const t = new URL(to);
    const fRest = f.pathname + f.search + f.hash;
    const tRest = t.pathname + t.search + t.hash;
    if (f.origin !== t.origin && fRest === tRest && fRest.startsWith('/')) {
      return { from: `${f.origin}/*`, to: `${t.origin}/$1` };
    }
  } catch {
    // not absolute URLs — fall through to the generic diff
  }

  // Generic: hold the common prefix/suffix constant, wildcard the differing middle.
  const p = commonPrefixLen(from, to);
  const s = commonSuffixLen(from, to, p);
  const prefix = from.slice(0, p);
  const suffix = s ? from.slice(from.length - s) : '';
  const fromMid = from.slice(p, from.length - s);
  const toMid = to.slice(p, to.length - s);

  if (fromMid === toMid) {
    // nothing varies in the middle: carry it through with a capture
    return { from: `${prefix}*${suffix}`, to: `${prefix}$1${suffix}` };
  }
  // the middle is a constant swap: wildcard it on the left, hardcode the new value
  return { from: `${prefix}*${suffix}`, to: `${prefix}${toMid}${suffix}` };
}
