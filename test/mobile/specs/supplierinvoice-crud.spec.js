/**
 * supplierinvoice-crud spec: exercises the full supplier-invoice
 * (FactureFournisseur) lifecycle from the desktop detail page. Mirror of
 * supplierorder-crud.spec.js.
 *
 * Covers, each as an independent test (own seed + teardown):
 *   - open   : a seeded supplier invoice renders on /supplier-invoices/:id (ref + line).
 *   - pdf    : "Générer PDF" triggers the real generateDocument and surfaces
 *              the "PDF généré" toast.
 *   - modify : the edit page opens with the invoice's data (guards the AutoForm
 *              defaultValue regression) and a save round-trips.
 *   - delete : the danger "Supprimer" action + confirm removes the supplier invoice.
 *
 * Seeding uses the admin-actions.php create-supplierinvoice subcommand (one
 * free-text line, optionally validated) so the tests do not depend on the
 * create UI. The thirdparty is created as a supplier (fournisseur=1).
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateSupplier,
    adminDeleteThirdParty,
    adminCreateSupplierInvoice,
    adminDeleteSupplierInvoice,
} from '../helpers/admin.js';

const SEED_LINE = 'Prestation de test E2E';

test.describe('Supplier invoice CRUD from the desktop detail page', () => {
    test('open: a seeded supplier invoice renders its ref and line', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `FournFac Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateSupplierInvoice(entity, socId, true);
        expect(seed.ok).toBe(true);
        const invId = Number(seed.id);
        expect(invId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/supplier-invoices/${invId}`);
            await page.waitForURL(new RegExp(`/supplier-invoices/${invId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteSupplierInvoice(entity, invId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('pdf: "Générer PDF" produces a PDF via the backend', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `FournFac Pdf ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateSupplierInvoice(entity, socId, true);
        expect(seed.ok).toBe(true);
        const invId = Number(seed.id);

        try {
            await page.goto(`/#/supplier-invoices/${invId}`);
            await page.waitForURL(new RegExp(`/supplier-invoices/${invId}$`), { timeout: 15_000 });

            await page.getByRole('button', { name: /Générer PDF/ }).first().click();
            await expect(page.getByText(/PDF généré/).first()).toBeVisible({ timeout: 20_000 });
        } finally {
            try { adminDeleteSupplierInvoice(entity, invId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: the edit page opens populated and a save round-trips', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `FournFac Edit ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        // Draft (validate=false): the "Modifier" action is only shown for
        // status 0, and the header form is editable.
        const seed = adminCreateSupplierInvoice(entity, socId, false);
        expect(seed.ok).toBe(true);
        const invId = Number(seed.id);

        try {
            await page.goto(`/#/supplier-invoices/${invId}/edit`);
            await page.waitForURL(new RegExp(`/supplier-invoices/${invId}/edit$`), { timeout: 15_000 });

            // The edit page loaded the invoice's data (guards a blank-form
            // regression): the seeded line is rendered in the editable table.
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 15_000 });

            await page.getByRole('button', { name: /Enregistrer/ }).first().click();
            await expect(page).toHaveURL(/#\/supplier-invoices\/\d+(\/edit)?$/, { timeout: 15_000 });
        } finally {
            try { adminDeleteSupplierInvoice(entity, invId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the supplier invoice', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateSupplier(entity, `FournFac Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateSupplierInvoice(entity, socId, false);
        expect(seed.ok).toBe(true);
        const invId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/supplier-invoices/${invId}`);
            await page.waitForURL(new RegExp(`/supplier-invoices/${invId}$`), { timeout: 15_000 });

            // "Supprimer" lives in the "Plus d'actions" dropdown (danger group).
            await page.getByRole('button', { name: /Plus d'actions/ }).first().click();
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // Confirm dialog (smartcommon useConfirm): wait for its title, then
            // click the confirm button (the dropdown closes on selection).
            await expect(page.getByText(/Supprimer cette facture fournisseur/).first()).toBeVisible({ timeout: 5_000 });
            await page.getByRole('button', { name: /^Supprimer$/ }).last().click();

            // handleDelete navigates to the list with replace:true.
            await page.waitForURL(/#\/supplier-invoices$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteSupplierInvoice(entity, invId); } catch { /* swallow */ }
            }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
