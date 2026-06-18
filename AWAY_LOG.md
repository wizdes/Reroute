# AWAY_LOG — Reroute v0.1.0 build (autonomous / away mode)

Built 2026-06-16 while you were away. Read this first.

## TL;DR

A new MV3 redirect extension whose whole point is a trustworthy, instant rule-testing UX
(your stated pain with Redirector). Engine + UI complete, all offline gates green. One gate
— the live in-Chrome redirect — could not run in this headless environment and is queued
for you to run on your desktop. Nothing was pushed, no remote repo created, nothing deployed.

## What's done and verified

- **Engine** (`src/compile.js`): wildcard→DNR compiler + matcher, the single shared module
  used by both the background rule sync and the editor preview. 16 unit tests green.
- **Conformance** (`test/conformance.test.mjs`): the regex we emit matches URLs identically
  under real RE2 (`re2-wasm`, the engine `declarativeNetRequest` uses) and under the JS
  `RegExp` the preview uses — 170 pattern/URL pairs + substitution parity. This is the
  automatable proof of "preview == production".
- **UI** (`ui/`): rule list (drag = priority), editor, live multi-URL tester with capture
  highlighting, "use current tab", inline validation, example→rule inference, reverse
  "debug any URL", JSON import/export, popup on/off. 11 UI checks green in chromium.
- **Inference** (`src/infer.js`): 5 unit tests green.
- **Packaging**: `npm run package` → `dist/reroute-v0.1.0.zip` (~50 KB, manifest at root).
- Total offline gate: **23 node tests + 11 UI checks, all passing.**
- Evidence: `docs/screenshots/01-tester.png … 04-popup.png` (the feature strip).

## Queued for your return (human-eyeball / live, NOT skipped)

1. **Manual smoke in REGULAR Chrome (the reliable check):** `chrome://extensions` → enable
   Developer mode → **Load unpacked** → pick `Projects/Reroute` → open Options → make a rule
   (e.g. `https://example.com/*` → `https://example.org/$1`) → visit a matching URL → confirm
   it redirects; toggle the popup off → confirm it stops. ~30 seconds.
2. **`npm run test:browser`** is the automated version, but see D1: it does NOT work under
   Playwright's Chrome-for-Testing on this machine (the extension loads but none of its
   runtime — SW, pages, DNR rules — engages under CDP). Use the manual check above instead;
   the harness is kept for a future Playwright/Chrome combo where CDP-loaded extensions run.
3. **Ship steps** (all deliberately left for you): create `wizdes/Reroute`, push, then
   publish the zip to the Chrome Web Store. I created no remote and pushed nothing.
4. Pick the final product name if "Reroute" isn't it (it's baked into manifest + repo only).

## Review (Tier 3 engine, independent Opus reviewer)

One correctness-only review pass over the engine + sync + inference. Verdict: the
"preview == production" core (`compile.js`, `background.js` sync) is correct. Three real
findings, all fixed:
- **Fixed (High):** the `to` language had no escape for a literal `$`+digit, so `infer`
  could emit a broken draft (a destination containing e.g. `$2`). Added `$$` → literal `$`,
  handled symmetrically in `toRegexSubstitution`, `evalRule`, `validateRule`, and the editor
  preview; `infer` now escapes literal `$` it emits. New unit tests cover it.
- **Fixed (Medium):** the substitution conformance test was circular. Rewrote it to interpret
  Chrome's DNR `\n` substitution string independently and cross-check both paths.
- **Fixed (Low):** `init()` now defaults `enabled !== false` for legacy storage entries
  (parity with import).

After fixes: 25 node tests + 11 UI checks, all green.

## Decision log (assumptions + judgment calls)

- **D1 — Live extension gate is un-runnable under Playwright here; verify manually in real
  Chrome.** Chrome 137+ ignores `--load-extension`; the `Extensions.loadUnpacked` CDP command
  loads it (returns an id), but the loaded extension is INERT under Chrome-for-Testing:
  re-confirmed when you ran it (2026-06-17) — headed connected, the extension loaded, but the
  options AND popup pages return `ERR_BLOCKED_BY_CLIENT`, the MV3 service worker is never
  surfaced, and even a static-ruleset fixture did NOT redirect a normal http navigation. So
  this is the automation tooling, not the extension or the display. Rather than fake the gate,
  I proved engine equivalence against real RE2 (`re2-wasm`) and tested + screenshotted the
  full UI in plain chromium (needs no extension). The only piece unproven by automation is
  Chrome physically performing the redirect — low risk (standard DNR redirect; the compiled
  rule is verified correct) and covered by the 30-second manual load above.
- **D2 — DNR-only, no webRequest** (per approved plan). Future-proof; RE2 limits (no
  backreferences/lookaround) are fine for URL→URL redirects.
- **D3 — Pattern UX = wildcard only** (your choice). No raw-regex UI. Compiles to RE2
  internally.
- **D4 — Built on `main` of a fresh local repo, not a feature branch.** It's greenfield with
  nothing to protect; blast radius is still "delete the `Projects/Reroute` folder." No
  remote exists. Handoff item 3 is "create remote + push", not "merge a branch".
- **D5 — "Use current tab" + actual persistence-to-DNR** are the only options-page behaviors
  that need the real extension; everything else (the headline tester/inference/debugger) is
  pure logic and is fully tested in a plain tab.
- **D6 — Icons** generated by rendering an SVG in chromium (no design tool / no OpenAI key).
- **D7 — Examples persist per rule** (stored on the rule, ignored by the compiler) so your
  test URLs stick around. `resourceTypes` default to `['main_frame']`; UI exposes Page +
  Iframe only (dropped "other" for v1 simplicity).

## Failed approaches (so nobody re-tries them)

- `--load-extension` / `--disable-extensions-except` (+ `--disable-features=
  DisableLoadExtensionCommandLineSwitch`, + `--enable-unsafe-extension-debugging`): all
  ignored by Chrome 149 — 0 extensions loaded. Use CDP `Extensions.loadUnpacked`.
- Headed Playwright launch: connection timeout (no display here).
- Driving chrome.* from a Playwright service-worker handle: CDP-loaded SWs aren't
  auto-attached, and the SW doesn't run headless anyway.

## Not in v1 (tracked, deferred by plan)

Redirector JSON import · per-rule exclude patterns (DNR needs higher-priority `allow` rules)
· raw-regex advanced mode · `getMatchedRules` popup history · fire counters · `storage.sync`.
