# Reroute — evidence strip (v0.1.0, away-mode build 2026-06-16)

Greenfield build, so there is no "before". These four frames are the working feature cut,
captured by `npm run test:ui` (real options/popup HTML driven in chromium). All 11 UI checks
and 23 node tests pass alongside these.

| # | Frame | What it proves |
|---|-------|----------------|
| 1 | `screenshots/01-editor.png` | Minimal editor: the selected rule's outline connects into the editor panel; Delete is centered at the bottom; no Test/Infer clutter. |
| 2 | `screenshots/02-advanced.png` | "Applies to" hidden under the Advanced toggle, revealed on click. |
| 3 | `screenshots/03-debugger.png` | "Debug any URL" (where testing now lives): names the winning rule + resulting URL, and explains every rule (MATCH / DISABLED pills). |
| 4 | `screenshots/04-popup.png` | Toolbar popup: global on/off, active-rule count, open editor. |
| 5 | `screenshots/05-empty.png` | Empty state: centered "No rules yet" message aligned with the single "+ New rule" button below the list (no duplicate center button). |

Not pictured (queued, see `../AWAY_LOG.md`): the live in-Chrome redirect itself — verify by
loading unpacked in regular Chrome.
