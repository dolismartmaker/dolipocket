/**
 * test/mobile/playwright.config.js
 *
 * Playwright configuration for the Dolipocket E2E suite.
 *
 * Ports are read from the environment (DOLIPOCKET_TEST_BACKEND_PORT and
 * DOLIPOCKET_TEST_PWA_PORT) with hard-coded fallbacks that match the
 * reservations documented in ~/docs/TESTING_PWA.md (Allocation des ports
 * par projet). Other Cap-Rel projects must NOT collide with these defaults.
 *
 * - Backend (php -S):  8790 (shared with the PHPUnit HTTP suite, but only
 *                            one of the two runs at a time)
 * - PWA (vite preview): 5195
 */
import { defineConfig, devices } from '@playwright/test';

const BACKEND_PORT = Number(process.env.DOLIPOCKET_TEST_BACKEND_PORT || 8790);
const PWA_PORT = Number(process.env.DOLIPOCKET_TEST_PWA_PORT || 5195);

export default defineConfig({
    testDir: './specs',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 1 : 0,
    workers: 1,
    timeout: 60_000,
    expect: { timeout: 10_000 },
    reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

    use: {
        baseURL: `http://127.0.0.1:${PWA_PORT}`,
        // Force the locale to French so the Blade public site (login form
        // labels) and the PWA i18n select French strings consistently.
        locale: 'fr-FR',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    globalSetup: './global-setup.js',
    globalTeardown: './global-teardown.js',

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
});

// Re-export the resolved ports so helpers/specs can import them without
// re-reading process.env (and without drifting from the config).
export { BACKEND_PORT, PWA_PORT };
