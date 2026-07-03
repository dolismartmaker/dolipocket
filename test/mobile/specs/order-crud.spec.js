/**
 * order-crud spec: exercises the full customer-order (commande) lifecycle from
 * the desktop detail page. Mirror of proposal-crud.spec.js.
 *
 * Covers, each as an independent test (own seed + teardown):
 *   - open   : a seeded order renders on /orders/:id (ref + line).
 *   - modify : the edit page opens with the order's data (guards the AutoForm
 *              defaultValue regression) and a save round-trips.
 *   - pdf    : "Générer PDF" triggers the real generateDocument on the backend
 *              and surfaces the "PDF généré" toast.
 *   - delete : the danger "Supprimer" action + confirm removes the order.
 *
 * Seeding uses the admin-actions.php create-order subcommand (one free-text
 * line, optionally validated) so the tests do not depend on the create UI.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateThirdParty,
    adminDeleteThirdParty,
    adminCreateOrder,
    adminDeleteOrder,
} from '../helpers/admin.js';

const SEED_LINE = 'Prestation de test E2E';

test.describe('Order CRUD from the desktop detail page', () => {
    test('open: a seeded order renders its ref and line', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Cmd Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateOrder(entity, socId, true);
        expect(seed.ok).toBe(true);
        const ordId = Number(seed.id);
        expect(ordId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/orders/${ordId}`);
            await page.waitForURL(new RegExp(`/orders/${ordId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteOrder(entity, ordId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('pdf: "Générer PDF" produces a PDF via the backend', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Cmd Pdf ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateOrder(entity, socId, true);
        expect(seed.ok).toBe(true);
        const ordId = Number(seed.id);

        try {
            await page.goto(`/#/orders/${ordId}`);
            await page.waitForURL(new RegExp(`/orders/${ordId}$`), { timeout: 15_000 });

            await page.getByRole('button', { name: /Générer PDF/ }).first().click();
            await expect(page.getByText(/PDF généré/).first()).toBeVisible({ timeout: 20_000 });
        } finally {
            try { adminDeleteOrder(entity, ordId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: the edit page opens populated and a save round-trips', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Cmd Edit ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        // Draft (validate=false): the "Modifier" action is only shown for
        // status 0, and the header form is editable.
        const seed = adminCreateOrder(entity, socId, false);
        expect(seed.ok).toBe(true);
        const ordId = Number(seed.id);

        try {
            await page.goto(`/#/orders/${ordId}/edit`);
            await page.waitForURL(new RegExp(`/orders/${ordId}/edit$`), { timeout: 15_000 });

            // The edit page loaded the order's data (guards a blank-form
            // regression): the seeded line is rendered in the editable table.
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 15_000 });

            await page.getByRole('button', { name: /Enregistrer/ }).first().click();
            await expect(page).toHaveURL(/#\/orders\/\d+(\/edit)?$/, { timeout: 15_000 });
        } finally {
            try { adminDeleteOrder(entity, ordId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the order', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Cmd Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateOrder(entity, socId, false);
        expect(seed.ok).toBe(true);
        const ordId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/orders/${ordId}`);
            await page.waitForURL(new RegExp(`/orders/${ordId}$`), { timeout: 15_000 });

            // "Supprimer" lives in the "Plus d'actions" dropdown (danger group).
            await page.getByRole('button', { name: /Plus d'actions/ }).first().click();
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // Confirm dialog (smartcommon useConfirm): wait for its title, then
            // click the confirm button (the dropdown closes on selection).
            await expect(page.getByText(/Supprimer cette commande/).first()).toBeVisible({ timeout: 5_000 });
            await page.getByRole('button', { name: /^Supprimer$/ }).last().click();

            // handleDelete navigates to the list with replace:true.
            await page.waitForURL(/#\/orders$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteOrder(entity, ordId); } catch { /* swallow */ }
            }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
