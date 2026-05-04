/**
 * thirdparty spec: end-to-end CRUD on the Tiers feature.
 *
 *   1. Navigate from HomePage to /thirdparties via the sidebar.
 *   2. Click the "+" button to open the create form.
 *   3. Fill the name and submit. Assert the new row appears in the list.
 *   4. Open the new row's detail page.
 *   5. Click "Supprimer" and confirm the dialog.
 *   6. Assert the third party is gone from the list.
 *
 * The test uses a unique name per run (timestamp suffix) so re-runs do not
 * collide with leftovers.
 */
import { test, expect } from '../fixtures/authenticated.js';
import { adminDeleteThirdParty, adminCountThirdParties } from '../helpers/admin.js';
import { findSocieteIdByName } from '../helpers/db.js';

const TEST_NAME = `Test Playwright ${Date.now()}`;

test.describe('Tiers CRUD', () => {
    test('create / read / delete a third party from the UI', async ({ authenticatedPage: page, backendInfo }) => {
        const entity = backendInfo.testUser.entity;

        // Step 1: navigate to /thirdparties via the sidebar nav item.
        await page.getByRole('button', { name: 'Tiers', exact: true }).first().click();
        await page.waitForURL(/\/thirdparties$/, { timeout: 10_000 });

        // Step 2: open the create form. There is no labelled "Add" text -- the
        // header button uses an aria-label="Créer un tiers".
        await page.getByRole('button', { name: /Créer un tiers/i }).click();
        await page.waitForURL(/\/thirdparties\/new$/, { timeout: 10_000 });

        // Step 3: fill the "Nom *" field. smartcommon's Input renders the
        // label as a wrapping <label>, so getByLabel works as expected.
        await page.getByLabel(/^Nom \*/).fill(TEST_NAME);

        // Step 4: submit. The desktop save button is in the header and
        // labelled "Enregistrer". On mobile the button might be at the bottom;
        // since Playwright's default Chromium runs at desktop size, the
        // header button is the one we click.
        await page.getByRole('button', { name: /Enregistrer$/ }).first().click();

        // After save, the controller redirects to /thirdparties/:id (detail).
        await page.waitForURL(/\/thirdparties\/\d+$/, { timeout: 10_000 });

        // Verify the detail page shows our name in the heading.
        await expect(page.getByRole('heading', { name: TEST_NAME })).toBeVisible();

        // Cross-check via SQLite that the row exists for our entity.
        const socId = findSocieteIdByName(TEST_NAME, entity);
        expect(socId).toBeGreaterThan(0);

        // Step 5: navigate back to the list and verify the new row is there.
        await page.goto(`/#/thirdparties`);
        await page.waitForURL(/\/thirdparties$/, { timeout: 10_000 });
        await expect(page.getByText(TEST_NAME).first()).toBeVisible({ timeout: 10_000 });

        // Step 6: open the row's detail page and delete it.
        await page.getByText(TEST_NAME).first().click();
        await page.waitForURL(/\/thirdparties\/\d+$/, { timeout: 10_000 });

        // The Confirm dialog from smartcommon renders with the title
        // "Supprimer ce tiers ?". Set up a dialog handler that accepts.
        page.on('dialog', (d) => d.accept());

        await page.getByRole('button', { name: /Supprimer/ }).first().click();

        // Smartcommon's confirm() likely renders an in-page modal rather than
        // a native dialog. The modal exposes a confirm-like button; click it.
        const modalConfirm = page.getByRole('button', { name: /^(Supprimer|Confirmer|Oui)$/ }).last();
        if (await modalConfirm.isVisible({ timeout: 2_000 }).catch(() => false)) {
            await modalConfirm.click();
        }

        // After delete, we should be back on the list with the row gone.
        await page.waitForURL(/\/thirdparties$/, { timeout: 10_000 });

        // Best-effort: poll a few times because the list reload is async.
        await expect(page.getByText(TEST_NAME)).toHaveCount(0, { timeout: 10_000 });

        // Final SQLite cross-check: the row should be gone. If the UI delete
        // failed (e.g. confirm dialog skipped), use the admin helper as a
        // safety net so re-runs are not polluted.
        const stillThere = findSocieteIdByName(TEST_NAME, entity);
        if (stillThere) {
            adminDeleteThirdParty(entity, stillThere);
            throw new Error(`UI delete did not persist; row still in DB (id=${stillThere}). Cleaned up via admin helper for next run.`);
        }
    });

    test('count helper sees the test entity', async ({ backendInfo }) => {
        // Sanity-check that the admin helper bridge works against our entity.
        // The provisioner does not seed any Societe for the new tenant, so
        // the count starts at 0 (or matches what previous tests left, which
        // they should not since they clean up).
        const r = adminCountThirdParties(backendInfo.testUser.entity);
        expect(r.ok).toBe(true);
        expect(typeof r.count).toBe('number');
        expect(r.count).toBeGreaterThanOrEqual(0);
    });
});
