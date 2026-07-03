/**
 * reception-crud spec: exercises the reception (Reception) lifecycle from the
 * desktop detail page.
 *
 * Reception is origin-driven (built from a validated supplier order), has NO PDF
 * and no dedicated edit page, so the spec covers the detail-page open path.
 *
 * NB: a UI "delete" test is intentionally NOT included. Reception::delete()
 * fatals with `Class "Commande_fournisseur" not found` -- Dolibarr core derives
 * the origin class name from the sourcetype 'commande_fournisseur' via a naive
 * ucfirst() ("Commande_fournisseur") that does not match the real class
 * CommandeFournisseur (the shipment path works because 'commande' -> 'Commande'
 * resolves). This is a real backend limitation of the reception delete flow, not
 * a test artifact, so it is documented rather than faked. The demo purge deletes
 * receptions via raw SQL to sidestep it.
 *
 * Seeding uses the admin-actions.php create-reception subcommand, which creates a
 * product, a validated supplier order carrying it, and a reception from it.
 * Teardown removes the reception (raw path), the origin supplier order and the
 * supplier.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateSupplier,
    adminDeleteThirdParty,
    adminCreateReception,
    adminDeleteReception,
    adminDeleteSupplierOrder,
} from '../helpers/admin.js';

test.describe('Reception CRUD from the desktop detail page', () => {
    test('open: a seeded reception renders its ref', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `Rec Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateReception(entity, socId, true);
        expect(seed.ok).toBe(true);
        const recId = Number(seed.id);
        expect(recId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/receptions/${recId}`);
            await page.waitForURL(new RegExp(`/receptions/${recId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(/Lignes reçues/).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteReception(entity, recId); } catch { /* swallow */ }
            try { adminDeleteSupplierOrder(entity, Number(seed.orderId)); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
