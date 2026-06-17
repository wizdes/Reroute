// Load the unpacked extension into Playwright's chromium for the LIVE gate.
//
// Chrome 137+ ignores the old --load-extension / --disable-extensions-except switches,
// so we use the CDP `Extensions.loadUnpacked` command (requires
// --enable-unsafe-extension-debugging + the remote-debugging pipe Playwright uses).
//
// Default is HEADED: on a real display (e.g. a dev machine) headed Chrome runs the MV3
// service worker and serves extension pages, so this gate exercises the real redirect.
// In a headless/CI box without a window server, headed Chrome cannot connect AND the MV3
// service worker does not start under --headless=new — there this gate cannot run; use
// `npm test` (unit + RE2 conformance + UI screenshots) instead and run THIS on a desktop.
// Set REROUTE_HEADLESS=1 to force --headless=new.
import { chromium } from 'playwright';

const HEADLESS = process.env.REROUTE_HEADLESS === '1';

export async function launchWithExtension(root, { userDataDir = '' } = {}) {
  const ctx = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    timeout: 60000,
    args: [
      ...(HEADLESS ? ['--headless=new'] : []),
      '--no-first-run',
      '--no-default-browser-check',
      '--enable-unsafe-extension-debugging',
    ],
  });

  const session = await ctx.browser().newBrowserCDPSession();
  const { id } = await session.send('Extensions.loadUnpacked', { path: root });

  const extPage = await ctx.newPage();
  try {
    await extPage.goto(`chrome-extension://${id}/ui/options.html`);
    await extPage.waitForFunction(
      () => !!globalThis.chrome?.declarativeNetRequest?.testMatchOutcome,
      null,
      { timeout: 15000 }
    );
  } catch (e) {
    throw new Error(
      'Could not reach an extension context (the MV3 page/worker did not become available). ' +
        'This environment likely has no window server; run `npm run test:browser` on a desktop. ' +
        `Underlying: ${e.message}`
    );
  }

  return { ctx, extId: id, extPage };
}
