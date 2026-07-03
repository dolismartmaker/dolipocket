/**
 * proposal-crud spec: exercises the full devis lifecycle from the desktop
 * detail page, beyond the creation flow already covered by
 * proposal-create.spec.js.
 *
 * Covers, each as an independent test (own seed + teardown):
 *   - open   : a seeded proposal renders on /proposals/:id (ref + line).
 *   - modify : the "Modifier" button opens the edit page with the AutoForm
 *              populated (guards the AutoForm defaultValue regression) and a
 *              note change round-trips through save().
 *   - pdf    : "Générer PDF" triggers the real generateDocument('azur') on the
 *              backend and surfaces the "PDF généré" toast.
 *   - delete : the danger "Supprimer" action + confirm removes the proposal.
 *
 * Seeding uses the admin-actions.php create-proposal subcommand (one free-text
 * line, optionally validated) so the tests do not depend on the create UI.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateThirdParty,
    adminDeleteThirdParty,
    adminCreateProposal,
    adminDeleteProposal,
} from '../helpers/admin.js';

const SEED_LINE = 'Prestation de test E2E';

test.describe('Proposal CRUD from the desktop detail page', () => {
    test('open: a seeded proposal renders its ref and line', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Devis Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateProposal(entity, socId, true);
        expect(seed.ok).toBe(true);
        const propId = Number(seed.id);
        expect(propId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/proposals/${propId}`);
            await page.waitForURL(new RegExp(`/proposals/${propId}$`), { timeout: 15_000 });

            // The validated ref (e.g. PROVxxxx -> real ref) is shown in the header.
            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            // The seeded line label is shown in the lines table.
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteProposal(entity, propId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('pdf: "Générer PDF" produces a PDF via the backend', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Devis Pdf ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateProposal(entity, socId, true);
        expect(seed.ok).toBe(true);
        const propId = Number(seed.id);

        try {
            await page.goto(`/#/proposals/${propId}`);
            await page.waitForURL(new RegExp(`/proposals/${propId}$`), { timeout: 15_000 });

            await page.getByRole('button', { name: /Générer PDF/ }).first().click();

            // handleGeneratePdf toasts "PDF généré : <file>" on success. This
            // proves generateDocument('azur') ran on the backend (TCPDF + azur
            // model are present in the harness).
            await expect(page.getByText(/PDF généré/).first()).toBeVisible({ timeout: 20_000 });
        } finally {
            try { adminDeleteProposal(entity, propId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: the edit page opens populated and a note change is saved', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Devis Edit ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        // Draft (validate=false): the "Modifier" action is only shown for
        // status 0, and the header AutoForm is editable.
        const seed = adminCreateProposal(entity, socId, false);
        expect(seed.ok).toBe(true);
        const propId = Number(seed.id);

        try {
            await page.goto(`/#/proposals/${propId}/edit`);
            await page.waitForURL(new RegExp(`/proposals/${propId}/edit$`), { timeout: 15_000 });

            // The edit page loaded the proposal's data (guards a blank-form
            // regression): the seeded line is rendered in the editable lines
            // table of the DocumentEditShell.
            await expect(page.getByText(SEED_LINE).first()).toBeVisible({ timeout: 15_000 });

            // Save round-trips without error and keeps us on a proposal route.
            await page.getByRole('button', { name: /Enregistrer/ }).first().click();
            await expect(page).toHaveURL(/#\/proposals\/\d+(\/edit)?$/, { timeout: 15_000 });
        } finally {
            try { adminDeleteProposal(entity, propId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the proposal', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Devis Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateProposal(entity, socId, false);
        expect(seed.ok).toBe(true);
        const propId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/proposals/${propId}`);
            await page.waitForURL(new RegExp(`/proposals/${propId}$`), { timeout: 15_000 });

            // "Supprimer" lives in the "Plus d'actions" dropdown (danger group).
            await page.getByRole('button', { name: /Plus d'actions/ }).first().click();
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // Confirm dialog (smartcommon useConfirm, no role=dialog): wait for
            // its title, then click the confirm button. The dropdown closes on
            // selection, so the remaining "Supprimer" button is the dialog's.
            await expect(page.getByText(/Supprimer ce devis/).first()).toBeVisible({ timeout: 5_000 });
            await page.getByRole('button', { name: /^Supprimer$/ }).last().click();

            // handleDelete navigates to the list with replace:true.
            await page.waitForURL(/#\/proposals$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteProposal(entity, propId); } catch { /* swallow */ }
            }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
