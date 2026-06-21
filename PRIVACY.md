# Privacy Policy — URL Rerouter

_Last updated: 2026-06-21_

URL Rerouter is a Chrome extension that redirects URLs using wildcard rules you write,
and lets you test those rules before you save them. It is built to be private by default.

## What it stores

The extension stores your data **locally on your device** via Chrome's `storage` API:

- the redirect rules you create (name, From pattern, To target, scope, enabled flag), and
- the global on/off setting.

That's it. This data never leaves your browser and is never transmitted anywhere.

## How redirects work

Each rule you create is compiled to a Chrome `declarativeNetRequest` dynamic rule. Chrome's
own network engine performs the redirect — the extension does not run any code on the pages
you visit and never sees your browsing as it happens. There is no backend server and no third
party involved.

## About the `<all_urls>` host permission

A redirect rule can point at any website, so the `declarativeNetRequest` rules must be allowed
to match requests on any host. That is the **only** reason for the broad host permission.

The extension does **not**:

- read, inject into, or modify page content,
- collect the URLs you visit, or
- send your browsing activity (or anything else) to any server.

The permission exists solely so that a rule you write — for example `example.com/*` →
`other.com/$1` — can fire wherever you point it.

## What it does NOT do

- No accounts, logins, or authentication.
- No analytics, telemetry, tracking, cookies, or fingerprinting.
- No data is collected by, or transmitted to, the developer or any third party.
- No data is sold or shared, and none is used for advertising or creditworthiness.

## Open source

The full source code is public and MIT-licensed, so you can verify all of the above:
https://github.com/wizdes/Reroute

## Contact

Questions or concerns? Open an issue:
https://github.com/wizdes/Reroute/issues
