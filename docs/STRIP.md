# Reroute — evidence strip (v0.1.0, away-mode build 2026-06-16)

Greenfield build, so there is no "before". These four frames are the working feature cut,
captured by `npm run test:ui` (real options/popup HTML driven in chromium). All 11 UI checks
and 23 node tests pass alongside these.

| # | Frame | What it proves |
|---|-------|----------------|
| 1 | `screenshots/01-tester.png` | Live tester: `github.com/foo/bar` → `dev.github.com/foo/bar` (capture highlighted), and `gist.github.com/x` shows ✕ "doesn't match". The headline feature. |
| 2 | `screenshots/02-inference.png` | "Make a rule from an example": pasting `twitter.com/elonmusk` + `nitter.net/elonmusk` drafts `https://twitter.com/*` → `$1` and it matches live immediately. |
| 3 | `screenshots/03-debugger.png` | Reverse "Debug any URL": names the winning rule + resulting URL, and explains every rule (MATCH / DISABLED pills). |
| 4 | `screenshots/04-popup.png` | Toolbar popup: global on/off, active-rule count, open editor. |

Not pictured (queued for desktop, see `../AWAY_LOG.md`): the live in-Chrome redirect itself
(`npm run test:browser`).
