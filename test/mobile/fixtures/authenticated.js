/**
 * test/mobile/fixtures/authenticated.js
 *
 * Playwright fixture that delivers a `page` already logged in via the Blade
 * public site, having consumed the SmartAuth tokens through HandoffPage.
 *
 * Strategy:
 *   1. Navigate to the public Blade login at /custom/dolipocket/public/login
 *      (served by the test php -S backend).
 *   2. Fill the email/password fields with the test credentials prepared by
 *      backend/init.php.
 *   3. Submit the form. The Blade controller signs the user in, mints
 *      SmartAuth tokens, and 302 redirects to <PWA_URL>/#/handoff?<params>.
 *   4. Wait for the URL to land on the PWA's home route (HandoffPage strips
 *      the fragment and navigate("/", { replace: true }) when done).
 *   5. Yield the authenticated `page` to the test.
 *
 * The fixture re-runs the full login flow for each test: this is the best
 * smoke test of the auth bridge we have, and the suite is small enough that
 * the cost is acceptable. We can switch to storageState reuse later if the
 * suite grows beyond ~10 specs.
 */
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

function loadBackendInfo() {
    const path = process.env.E2E_BACKEND_INFO;
    if (!path) {
        throw new Error('E2E_BACKEND_INFO env var not set -- did global-setup run?');
    }
    return JSON.parse(readFileSync(path, 'utf8'));
}

const BACKEND_PORT = Number(process.env.DOLIPOCKET_TEST_BACKEND_PORT || 8790);
const BLADE_BASE = `http://127.0.0.1:${BACKEND_PORT}/custom/dolipocket/public`;

export const test = base.extend({
    backendInfo: async ({}, use) => {
        await use(loadBackendInfo());
    },

    bladeBase: async ({}, use) => {
        await use(BLADE_BASE);
    },

    /**
     * Drive the Blade login UI and resolve once the PWA HomePage is shown.
     */
    authenticatedPage: async ({ page, backendInfo }, use) => {
        const { testUser } = backendInfo;
        if (!testUser) throw new Error('backendInfo.testUser missing -- did init.php run?');

        // Step 1: open the Blade login page directly via the backend port.
        await page.goto(`${BLADE_BASE}/login`, { waitUntil: 'domcontentloaded' });

        // Step 2: fill the form. The login.blade.php template uses standard
        // <input id="login"> / <input id="password"> -- targeting by name is
        // robust against any future styling change.
        await page.locator('input[name="login"]').fill(testUser.email);
        await page.locator('input[name="password"]').fill(testUser.password);

        // Step 3: submit. The form action is /login; on success the controller
        // 302s to <PWA_URL>/#/handoff?<tokens>. Because PWA and Blade are on
        // different ports, we wait for the PWA origin to take over the page.
        await Promise.all([
            page.waitForURL(
                (url) =>
                    url.host === `127.0.0.1:${process.env.DOLIPOCKET_TEST_PWA_PORT || 5195}` &&
                    (url.hash.includes('/handoff') || url.pathname === '/' || url.hash === '#/'),
                { timeout: 15_000 }
            ),
            page.locator('button[type="submit"]').click(),
        ]);

        // Step 4: HandoffPage parses the fragment, stores the tokens via
        // smartcommon, and navigate("/", { replace: true }). Wait for the
        // fragment to be wiped (HandoffPage calls window.history.replaceState).
        await page.waitForFunction(() => !window.location.hash.includes('handoff'), null, { timeout: 15_000 });

        // Step 5: HomePage renders the gradient brand "Dolipocket". Once that
        // is visible we know the protected layout has finished mounting.
        await expect(page.getByText(/Dolipocket/i).first()).toBeVisible({ timeout: 15_000 });

        await use(page);
    },
});

export { expect };
