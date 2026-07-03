/**
 * shipment-crud spec: exercises the shipment (Expedition) lifecycle from the
 * desktop detail page.
 *
 * Expedition is origin-driven (built from a validated order), has NO PDF and no
 * dedicated edit page, so the spec covers two independent tests:
 *   - open   : a seeded validated shipment renders on /shipments/:id (its ref).
 *   - delete : the "Supprimer" action removes a draft shipment (this document's
 *              handleDelete deletes directly, with NO confirm dialog).
 *
 * Seeding uses the admin-actions.php create-shipment subcommand, which creates a
 * validated origin order + a shipment from it. Teardown removes the shipment,
 * the origin order (FK) and the thirdparty.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateThirdParty,
    adminDeleteThirdParty,
    adminCreateShipment,
    adminDeleteShipment,
    adminDeleteOrder,
} from '../helpers/admin.js';

test.describe('Shipment CRUD from the desktop detail page', () => {
    test('open: a seeded validated shipment renders its ref', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Exp Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateShipment(entity, socId, true);
        expect(seed.ok).toBe(true);
        const shipId = Number(seed.id);
        expect(shipId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/shipments/${shipId}`);
            await page.waitForURL(new RegExp(`/shipments/${shipId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(/Lignes expédiées/).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteShipment(entity, shipId); } catch { /* swallow */ }
            try { adminDeleteOrder(entity, Number(seed.orderId)); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes a draft shipment', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Exp Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateShipment(entity, socId, false);
        expect(seed.ok).toBe(true);
        const shipId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/shipments/${shipId}`);
            await page.waitForURL(new RegExp(`/shipments/${shipId}$`), { timeout: 15_000 });

            // The desktop detail bar has a direct "Supprimer" button (draft only,
            // no overflow, no confirm dialog). The read-only lines table has no
            // per-line "Supprimer" so the header button is unambiguous.
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // handleDelete navigates to the list on success.
            await page.waitForURL(/#\/shipments$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteShipment(entity, shipId); } catch { /* swallow */ }
            }
            try { adminDeleteOrder(entity, Number(seed.orderId)); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
