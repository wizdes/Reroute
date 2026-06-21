# Chrome Web Store listing — URL Rerouter

Everything needed for the developer-console listing. Copy/paste the text; upload the
images from `store-assets/images/`. Regenerate the images with `npm run store-assets`.

---

## Product details

**Item name**
```
URL Rerouter
```

**Summary** (short description, max 132 chars — this one is **119**)
```
Redirect URLs with simple wildcard rules — and test exactly which rule fires before you save. Open source, no tracking.
```

**Description** (detailed)
```
URL Rerouter redirects URLs with dead-simple wildcard rules — and, unlike the redirectors you may have used before, it lets you prove exactly what a rule does BEFORE you rely on it. No more save-and-pray.

SIMPLE WILDCARD RULES
Write a From pattern with * and a To target with $1, $2, … Example:
  https://github.com/*  →  https://dev.github.com/$1
The * matches any run of characters and is captured; reference each capture as $1…$9 in the target. That's the whole language.

DEBUG ANY URL — THE STANDOUT FEATURE
Paste any URL into the reverse "Debug any URL" tester and see which rule fires and where it lands — or exactly why none does (no match / disabled / shadowed by a higher rule). You confirm a rule works before trusting it, instead of guessing.

WHAT YOU DEBUG IS WHAT SHIPS
The debugger and the installed redirect run the SAME compiler. Each rule compiles to a declarativeNetRequest dynamic rule, and a conformance test proves the regex we emit matches URLs identically under real RE2 (the engine Chrome uses) and the JavaScript RegExp the debugger uses — so the debugger's verdict is the production verdict.

EVERYTHING ELSE
- Priority by drag-order: reorder rules so the topmost matching rule wins.
- Per-rule scope (Advanced): apply a rule to top-level pages, iframes, or both.
- Import / Export your rules as JSON to back up or share.
- One-click global on/off from the toolbar popup, with a live count of active rules.
- Featherweight: pure MV3 static files — no backend, no build step, no framework. The packaged extension is about 50 KB.

PRIVATE BY DESIGN
No analytics, no tracking, no third parties. Your rules are stored locally on your device via Chrome's storage. The extension uses declarativeNetRequest to perform redirects; the broad host permission only lets your redirect rules match any site — it never reads page content and never sends your browsing anywhere.

OPEN SOURCE (MIT)
URL Rerouter is fully open source under the MIT license. Read the code, file issues, or contribute:
https://github.com/wizdes/Reroute

Made by Yi Li · https://yili.dev/projects/url_reroute/
```

**Category:** Workflow & Planning
**Language:** English (United States)

---

## Privacy

**Single purpose**
```
Redirect URLs to other URLs using user-defined wildcard rules, with an in-page tester that previews which rule a URL matches before it is saved.
```

**Permission justifications**
- `declarativeNetRequest` —
  ```
  Installs and runs the user's redirect rules. Each rule the user creates is compiled to a declarativeNetRequest dynamic rule so Chrome can redirect matching requests. This is the core mechanism of the extension.
  ```
- `storage` —
  ```
  Persists the user's redirect rules and the global on/off setting locally on the device, so they survive browser restarts. Nothing is transmitted off the device.
  ```
- Host permission `<all_urls>` —
  ```
  Redirect rules can target any website, so the declarativeNetRequest rules must be allowed to match requests on any host. The extension does NOT read, inject into, or collect page content — the permission exists only so a user's rule (e.g. example.com → other.com) can fire wherever the user points it.
  ```
- Remote code: **No.**

**Data usage / certifications** — the extension does **not** collect or use any of the
disclosable data categories (PII, location, financial, authentication, web history, user
activity, website content). The redirect rules and the on/off flag live **only** on the device
via `chrome.storage.local`. Certify all three:

- data is **not** sold or transferred to third parties,
- data is **not** used for purposes unrelated to the single purpose, and
- data is **not** used to determine creditworthiness or for lending.

**Privacy policy URL**
```
https://github.com/wizdes/Reroute/blob/main/PRIVACY.md
```

---

## URLs

| Field | Value |
|-------|-------|
| Official / website URL | https://yili.dev/projects/url_reroute/ |
| Homepage URL | https://github.com/wizdes/Reroute |
| Support URL | https://github.com/wizdes/Reroute/issues |
| Privacy policy URL | https://github.com/wizdes/Reroute/blob/main/PRIVACY.md |

---

## Images (in `store-assets/images/`)

| Field | File | Headline | Size |
|-------|------|----------|------|
| Store icon | `store-icon-128.png` | — | 128×128 |
| Screenshot 1 | `screenshot-1-editor.png` | "Redirect any URL with one simple * rule" | 1280×800 |
| Screenshot 2 | `screenshot-2-debugger.png` | "See exactly which rule fires before you save" | 1280×800 |
| Screenshot 3 | `screenshot-3-empty.png` | "What you debug is exactly what ships" | 1280×800 |
| Screenshot 4 | `screenshot-4-advanced.png` | "Priority by drag-order, with per-rule scope" | 1280×800 |
| Screenshot 5 | `screenshot-5-popup.png` | "One toolbar switch. No backend. No tracking." | 1280×800 |
| Small promo tile | `promo-small-440x280.jpg` | — | 440×280 |
| Marquee promo tile | `promo-marquee-1400x560.jpg` | — | 1400×560 |

Regenerate every image with:
```sh
npm run store-assets
```
