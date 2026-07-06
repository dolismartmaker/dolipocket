/**
 * thirdparty-cockpit spec: per-user personalization of the desktop cockpit.
 *
 * Covers the edit-mode layer added on the thirdparty detail page:
 *   1. Seed a thirdparty via the admin helper and open its cockpit directly
 *      (avoids depending on the create-flow UI).
 *   2. Enter edit mode via the "Personnaliser" button.
 *   3. Hide a box (Coordonnées) -> the tile disappears.
 *   4. Change a list-length (Dernières factures -> 20).
 *   5. Assert both choices are persisted in localStorage (the hybrid adapter's
 *      default backend), so the assertion needs no seeded invoices.
 *   6. Reload the page -> the hidden box stays hidden.
 *   7. Reset -> the box comes back.
 *
 * The cockpit hydrates from a federated bundle and fires several fetches on
 * mount (cockpit + categories + bank), so the DOM keeps re-rendering for a
 * moment after it first appears. To stay non-flaky we wait for network idle
 * after each navigation and wrap the click-then-observe steps in `toPass` so a
 * click landing mid-rehydration is simply retried.
 *
 * Reordering is exercised by the code (native HTML5 DnD) but not asserted here:
 * synthesising a reliable native drag in Playwright is flaky, so this spec keeps
 * to the deterministic controls (hide / length / persist / reset).
 */
import { test, expect } from '../fixtures/authenticated.js';
import { adminCreateThirdParty, adminDeleteThirdParty } from '../helpers/admin.js';

const TEST_NAME = `Cockpit Perso ${Date.now()}`;
const PREFS_KEY = 'dolipocket.cockpit.thirdparty';

// Enter edit mode, retrying the click until the edit toolbar actually shows (a
// click landing before React attaches the handler is otherwise lost).
async function enterEditMode(page) {
    await expect(async () => {
        await page.getByTestId('cockpit-customize').click();
        await expect(page.getByText(/Personnalisation de l'affichage/)).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
}

test.describe('Cockpit tiers - personnalisation', () => {
    test('hide / list-length persist across reload, reset restores', async ({ authenticatedPage: page, backendInfo }) => {
        const entity = backendInfo.testUser.entity;

        // Step 1: seed a thirdparty and open its cockpit directly. localStorage
        // (auth) survives the goto since we stay on the PWA origin.
        const created = adminCreateThirdParty(entity, TEST_NAME);
        expect(created.ok).toBe(true);
        const socId = created.id;
        expect(socId).toBeGreaterThan(0);

        // Start from a clean prefs slate so a previous run cannot mask a bug.
        await page.evaluate((key) => localStorage.removeItem(key), PREFS_KEY);

        try {
            await page.goto(`/#/thirdparties/${socId}`);
            await page.waitForLoadState('networkidle');

            // The desktop cockpit renders with its boxes.
            await expect(page.getByTestId('thirdparty-cockpit')).toBeVisible({ timeout: 15_000 });
            await expect(page.getByTestId('cockpit-box-coordinates')).toBeVisible();

            // Step 2: enter edit mode.
            await enterEditMode(page);

            // Step 3: hide the Coordonnées box via its chrome bar (retry the
            // click until the tile is actually gone).
            await expect(async () => {
                await page
                    .getByTestId('cockpit-box-coordinates')
                    .getByRole('button', { name: 'Masquer cette boîte' })
                    .click();
                await expect(page.getByTestId('cockpit-box-coordinates')).toHaveCount(0, { timeout: 1_000 });
            }).toPass({ timeout: 15_000 });

            // Step 4: set the recent-invoices list length to 20 (admin has the
            // invoice permission so the box is present, even with no invoices).
            const recentBox = page.getByTestId('cockpit-box-recentInvoices');
            await expect(recentBox).toBeVisible();
            await recentBox.getByRole('combobox').selectOption('20');

            // Leave edit mode.
            await page.getByRole('button', { name: /Terminer/ }).click();

            // Step 5: both choices persisted in localStorage.
            const rawPrefs = await page.evaluate((key) => localStorage.getItem(key), PREFS_KEY);
            expect(rawPrefs).toBeTruthy();
            const prefs = JSON.parse(rawPrefs);
            expect(prefs.overrides.coordinates.visible).toBe(false);
            expect(prefs.overrides.recentInvoices.limit).toBe(20);

            // Step 6: reload -> Coordonnées stays hidden.
            await page.reload();
            await page.waitForLoadState('networkidle');
            await expect(page.getByTestId('thirdparty-cockpit')).toBeVisible({ timeout: 15_000 });
            await expect(page.getByTestId('cockpit-box-coordinates')).toHaveCount(0);

            // Step 7: reset restores the default layout.
            await enterEditMode(page);
            await expect(async () => {
                await page.getByRole('button', { name: /Réinitialiser/ }).click();
                await expect(page.getByTestId('cockpit-box-coordinates')).toBeVisible({ timeout: 1_000 });
            }).toPass({ timeout: 15_000 });
        } finally {
            adminDeleteThirdParty(entity, socId);
        }
    });
});
