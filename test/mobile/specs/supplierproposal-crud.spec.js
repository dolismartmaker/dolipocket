/**
 * supplierproposal-crud spec: exercises the supplier price request
 * (SupplierProposal) lifecycle from the desktop detail page.
 *
 * This document has NO PDF model and its edit page (/edit) only edits the
 * header metadata (delivery date + notes) -- lines are edited inline on the
 * detail page. So the spec covers three independent tests:
 *   - open   : a seeded request renders on /supplier-proposals/:id (ref + line).
 *   - modify : the header edit page opens populated and a save round-trips.
 *   - delete : the danger "Supprimer" action removes the request (this document's
 *              handleDelete deletes directly, with NO confirm dialog).
 *
 * Seeding uses the admin-actions.php create-supplierproposal subcommand against
 * a supplier thirdparty (fournisseur=1).
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateSupplier,
    adminDeleteThirdParty,
    adminCreateSupplierProposal,
    adminDeleteSupplierProposal,
} from '../helpers/admin.js';

const SEED_LINE = 'Prestation de test E2E';

test.describe('Supplier price request CRUD from the desktop detail page', () => {
    test('open: a seeded request renders its ref and line', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `DdP Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateSupplierProposal(entity, socId, true);
        expect(seed.ok).toBe(true);
        const spId = Number(seed.id);
        expect(spId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/supplier-proposals/${spId}`);
            await page.waitForURL(new RegExp(`/supplier-proposals/${spId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteSupplierProposal(entity, spId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: the header edit page opens populated and a save round-trips', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `DdP Edit ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        // Draft (validate=false): "Modifier" is only shown for status 0.
        const seed = adminCreateSupplierProposal(entity, socId, false);
        expect(seed.ok).toBe(true);
        const spId = Number(seed.id);

        try {
            await page.goto(`/#/supplier-proposals/${spId}/edit`);
            await page.waitForURL(new RegExp(`/supplier-proposals/${spId}/edit$`), { timeout: 15_000 });

            // The header edit form rendered (delivery date + notes fields).
            await expect(page.getByText(/Date de livraison souhaitée/).first()).toBeVisible({ timeout: 15_000 });

            await page.getByRole('button', { name: /Enregistrer/ }).first().click();
            await expect(page).toHaveURL(/#\/supplier-proposals\/\d+(\/edit)?$/, { timeout: 15_000 });
        } finally {
            try { adminDeleteSupplierProposal(entity, spId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the request', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `DdP Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateSupplierProposal(entity, socId, false);
        expect(seed.ok).toBe(true);
        const spId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/supplier-proposals/${spId}`);
            await page.waitForURL(new RegExp(`/supplier-proposals/${spId}$`), { timeout: 15_000 });

            // "Supprimer" lives in the "Plus d'actions" dropdown (danger group).
            // Scope to the command-bar <header> so this "Supprimer" never
            // collides with the per-line "Supprimer" buttons of the inline lines
            // editor (a draft request renders an editable lines table). This
            // document's handleDelete deletes directly (no confirm dialog).
            const header = page
                .locator('header')
                .filter({ has: page.getByRole('button', { name: "Plus d'actions" }) });
            await header.getByRole('button', { name: "Plus d'actions" }).click();
            await header.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // handleDelete navigates to the list on success.
            await page.waitForURL(/#\/supplier-proposals$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteSupplierProposal(entity, spId); } catch { /* swallow */ }
            }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
