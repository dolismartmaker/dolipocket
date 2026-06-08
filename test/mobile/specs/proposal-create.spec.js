/**
 * proposal-create spec: end-to-end creation of a customer proposal (devis)
 * driven by the Lot 9 AutoForm + FkPicker.
 *
 *   1. Seed: insert a thirdparty directly via SQLite so the FkPicker has a
 *      target to select.
 *   2. Navigate from HomePage to /proposals/new (desktop edit page).
 *   3. Open the Tiers FkPicker, search by name, pick the seeded thirdparty.
 *   4. Click the header "Enregistrer" button.
 *   5. Assert the controller redirects to /proposals/:id/edit (existing
 *      ProposalEditPage save() behaviour).
 *   6. Cross-check via SQLite that the proposal row exists.
 *   7. Cleanup: delete proposal + thirdparty via admin helpers.
 *
 * The unique tiers name carries a timestamp to avoid collisions on re-runs.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateThirdParty,
    adminDeleteThirdParty,
    adminDeleteProposal,
} from '../helpers/admin.js';
import { findSocieteIdByName, findProposalIdsBySocId } from '../helpers/db.js';

const TIERS_NAME = `Picker Test ${Date.now()}`;

test.describe('Proposal creation via AutoForm + FkPicker', () => {
    test('create a draft proposal by picking a tiers in the desktop edit page', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;

        // Step 1: seed a thirdparty so the FkPicker has something to select.
        const seed = adminCreateThirdParty(entity, TIERS_NAME);
        expect(seed.ok).toBe(true);
        const socId = Number(seed.id);
        expect(socId).toBeGreaterThan(0);

        try {
            // Step 2: navigate to the new-proposal route directly. The desktop
            // edit page mounts AutoForm against GET /proposal/describe and the
            // header is sticky so save/cancel are always reachable.
            await page.goto('/#/proposals/new');
            await page.waitForURL(/\/proposals\/new$/, { timeout: 10_000 });

            // Step 3: open the Tiers FkPicker. The trigger button shows the
            // placeholder text "Rechercher..." until a value is picked.
            // The FkPicker label "Tiers" (translated from "fk_soc") wraps the
            // trigger so getByLabel finds it on desktop.
            const tiersTrigger = page.getByRole('button', { name: /Rechercher/ }).first();
            await expect(tiersTrigger).toBeVisible({ timeout: 10_000 });
            await tiersTrigger.click();

            // The search input is autoFocus inside the desktop popover. Type
            // a substring that matches the seeded name.
            const search = page.getByRole('searchbox').first();
            await expect(search).toBeVisible({ timeout: 5_000 });
            await search.fill('Picker Test');

            // Wait for the seeded item to surface in the popover and click it.
            const option = page.getByText(TIERS_NAME).first();
            await expect(option).toBeVisible({ timeout: 10_000 });
            await option.click();

            // Step 4: click the header "Enregistrer" button. The desktop edit
            // page renders two save controls when forms are duplicated, take
            // the first one which is in the sticky header.
            await page
                .getByRole('button', { name: /Enregistrer/ })
                .first()
                .click();

            // Step 5: ProposalEditPage.save() navigates to /proposals/:id/edit
            // on success (cf useProposalEditData.js).
            await page.waitForURL(/\/proposals\/\d+\/edit$/, { timeout: 15_000 });

            // Step 6: cross-check via SQLite -- the proposal row must exist
            // for our entity, linked to the seeded socid.
            const propIds = findProposalIdsBySocId(socId, entity);
            expect(propIds.length).toBeGreaterThan(0);
        } finally {
            // Cleanup: best-effort -- failures here should not fail the spec
            // since the test goal (end-to-end picker) is already validated.
            try {
                const propIds = findProposalIdsBySocId(socId, entity);
                for (const pid of propIds) {
                    adminDeleteProposal(entity, pid);
                }
            } catch (_e) { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch (_e) { /* swallow */ }
        }
    });
});
