// Shared wildcard compiler + matcher.
//
// This module is the single source of truth for how a rule matches a URL and what
// it redirects to. It is imported BOTH by the background service worker (to build the
// real declarativeNetRequest rules Chrome enforces) AND by the options-page preview
// (to show you what will happen as you type). Because both paths run this exact code,
// the preview cannot drift from production behaviour.
//
// Pattern language (deliberately tiny):
//   - A "from" pattern is literal text plus `*` wildcards. Each `*` matches any run of
//     characters and is captured, referenced in the "to" target as $1, $2, ... (max $9).
//   - The whole URL must match (the pattern is anchored), matching Redirector's default.
//   - Matching is case-sensitive (RE2 default), so the JS preview and Chrome's RE2
//     engine agree exactly. See test/browser.mjs for the conformance proof.

const MAX_CAPTURES = 9; // DNR regexSubstitution only supports \1..\9

const DNR_RESOURCE_TYPES = new Set([
  'main_frame', 'sub_frame', 'stylesheet', 'script', 'image', 'font',
  'object', 'xmlhttprequest', 'ping', 'csp_report', 'media', 'websocket',
  'webtransport', 'webbundle', 'other',
]);

/** Escape every regex metacharacter in a literal string segment. */
export function escapeRegexLiteral(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Compile a wildcard "from" pattern into an anchored RE2-compatible regex source.
 * Returns { source, captureCount }.
 */
export function wildcardToRegex(from) {
  const parts = from.split('*'); // splitting on '*' isolates literals from wildcards
  const captureCount = parts.length - 1;
  const source = '^' + parts.map(escapeRegexLiteral).join('(.*)') + '$';
  return { source, captureCount };
}

/**
 * Convert a "to" target into a DNR regexSubstitution string.
 *   $1..$9 -> \1..\9 (capture references)
 *   $$     -> $       (an escaped literal dollar)
 * Existing backslashes are escaped first so they survive as literals.
 */
export function toRegexSubstitution(to) {
  return to
    .replace(/\\/g, '\\\\')
    .replace(/\$(\$|\d)/g, (_, c) => (c === '$' ? '$' : '\\' + c));
}

/** Highest $n referenced in a "to" target (0 if none). `$$` is a literal, not a ref. */
function maxReference(to) {
  let max = 0;
  const re = /\$(\$|\d)/g;
  let m;
  while ((m = re.exec(to))) {
    if (m[1] !== '$') max = Math.max(max, Number(m[1]));
  }
  return max;
}

/**
 * Validate a rule. Returns an array of human-readable error strings (empty = valid).
 * Used by the editor to show inline errors instead of failing silently.
 */
export function validateRule(rule) {
  const errors = [];
  const from = rule?.from ?? '';
  const to = rule?.to ?? '';

  if (!from) errors.push("The 'From' pattern can't be empty.");
  if (!to) errors.push("The 'To' target can't be empty.");

  const captureCount = from ? from.split('*').length - 1 : 0;
  if (captureCount > MAX_CAPTURES) {
    errors.push(`Too many wildcards (${captureCount}); the maximum is ${MAX_CAPTURES}.`);
  }

  const ref = maxReference(to);
  if (from && ref > captureCount) {
    errors.push(
      `'To' uses $${ref} but the pattern has only ${captureCount} wildcard${captureCount === 1 ? '' : 's'}.`
    );
  }

  if (from) {
    try {
      new RegExp(wildcardToRegex(from).source);
    } catch (e) {
      errors.push(`Pattern is invalid: ${e.message}`);
    }
  }

  const types = rule?.resourceTypes;
  if (types && (!Array.isArray(types) || types.some((t) => !DNR_RESOURCE_TYPES.has(t)))) {
    errors.push('One or more "applies to" types are not recognized.');
  }

  return errors;
}

/**
 * Compile a rule into the { regexFilter, regexSubstitution } pair Chrome's
 * declarativeNetRequest engine needs. Throws if the rule is invalid.
 */
export function compileRule(rule) {
  const errors = validateRule(rule);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    regexFilter: wildcardToRegex(rule.from).source,
    regexSubstitution: toRegexSubstitution(rule.to),
  };
}

/**
 * Build a complete declarativeNetRequest dynamic rule object.
 * @param {object} rule  our rule shape { from, to, resourceTypes }
 * @param {{id:number, priority:number}} meta
 */
export function toDNRRule(rule, { id, priority }) {
  const { regexFilter, regexSubstitution } = compileRule(rule);
  const resourceTypes =
    Array.isArray(rule.resourceTypes) && rule.resourceTypes.length
      ? rule.resourceTypes
      : ['main_frame'];
  return {
    id,
    priority,
    action: { type: 'redirect', redirect: { regexSubstitution } },
    condition: { regexFilter, resourceTypes },
  };
}

/**
 * Evaluate a single rule against a URL exactly as the engine would.
 * Returns { matched, resultUrl?, captures?, error? }. Never throws.
 * This is what the live preview calls on every keystroke.
 */
export function evalRule(rule, url) {
  const errors = validateRule(rule);
  if (errors.length) return { matched: false, error: errors.join(' ') };

  const { source } = wildcardToRegex(rule.from);
  let re;
  try {
    re = new RegExp(source);
  } catch (e) {
    return { matched: false, error: `Pattern is invalid: ${e.message}` };
  }

  const m = re.exec(url);
  if (!m) return { matched: false };

  const captures = m.slice(1);
  const resultUrl = rule.to.replace(/\$(\$|\d)/g, (_, c) => (c === '$' ? '$' : m[Number(c)] ?? ''));
  return { matched: true, resultUrl, captures, matchIndex: m.index, matchLength: m[0].length };
}

/**
 * Evaluate every rule against a URL in priority order (list order = priority,
 * first wins). Returns the winning redirect plus per-rule reasons — powers the
 * reverse debugger ("why didn't this URL redirect?").
 *
 * @param {Array} rules  ordered rules (index 0 = highest priority)
 * @param {string} url
 * @param {boolean} masterEnabled  global on/off
 */
export function debugUrl(rules, url, masterEnabled = true) {
  const reasons = [];
  let winner = null;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    let reason;
    if (!masterEnabled) {
      reason = { index: i, rule, status: 'skipped', detail: 'Reroute is turned off globally.' };
    } else if (!rule.enabled) {
      reason = { index: i, rule, status: 'disabled', detail: 'Rule is disabled.' };
    } else {
      const r = evalRule(rule, url);
      if (r.error) {
        reason = { index: i, rule, status: 'invalid', detail: r.error };
      } else if (!r.matched) {
        reason = { index: i, rule, status: 'no-match', detail: "Pattern doesn't match this URL." };
      } else if (winner) {
        reason = {
          index: i, rule, status: 'shadowed', resultUrl: r.resultUrl,
          detail: `Would match, but rule "${winner.rule.name || '#' + (winner.index + 1)}" higher up matched first.`,
        };
      } else {
        reason = { index: i, rule, status: 'match', resultUrl: r.resultUrl };
        winner = reason;
      }
    }
    reasons.push(reason);
  }

  return { winner, resultUrl: winner?.resultUrl ?? null, reasons };
}
