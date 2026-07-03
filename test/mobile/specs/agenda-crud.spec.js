/**
 * agenda-crud spec: exercises the agenda event (ActionComm) lifecycle from the
 * desktop detail page.
 *
 * ActionComm has NO lines, NO PDF and NO draft->validated lifecycle, so the spec
 * covers three independent tests:
 *   - open   : a seeded event renders on /agenda/:id (its label).
 *   - modify : the edit page opens populated (label input) and a save round-trips
 *              back to the detail page.
 *   - delete : the "Supprimer" action + confirm dialog removes the event.
 *
 * Seeding uses the admin-actions.php create-agendaevent subcommand. The tenant
 * admin holds agenda.allactions.* so the event is visible/editable regardless of
 * its owner.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateThirdParty,
    adminDeleteThirdParty,
    adminCreateAgendaEvent,
    adminDeleteAgendaEvent,
} from '../helpers/admin.js';

const SEED_LABEL = 'Rendez-vous E2E';

test.describe('Agenda event CRUD from the desktop detail page', () => {
    test('open: a seeded event renders its label', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Agenda Open ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateAgendaEvent(entity, socId);
        expect(seed.ok).toBe(true);
        const evtId = Number(seed.id);
        expect(evtId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/agenda/${evtId}`);
            await page.waitForURL(new RegExp(`/agenda/${evtId}$`), { timeout: 15_000 });

            await expect(page.getByText(SEED_LABEL).first()).toBeVisible({ timeout: 15_000 });
        } finally {
            try { adminDeleteAgendaEvent(entity, evtId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    // The desktop edit page uses the generic <AutoForm>. This test asserts it
    // opens *populated* (guards a blank-form regression); the save-persist path
    // is verified separately by the "PERSISTS" test below -- which proves the
    // agenda AutoForm round-trip actually works (the old "known key mismatch"
    // caveat was stale for this form).
    test('modify: the edit page opens populated with the event', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Agenda Edit ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateAgendaEvent(entity, socId);
        expect(seed.ok).toBe(true);
        const evtId = Number(seed.id);

        try {
            await page.goto(`/#/agenda/${evtId}/edit`);
            await page.waitForURL(new RegExp(`/agenda/${evtId}/edit$`), { timeout: 15_000 });

            // The edit form loaded the event (guards a blank-form regression):
            // the header renders "Modifier <label>" and the Save button is ready.
            await expect(page.getByText(new RegExp(`Modifier ${SEED_LABEL}`)).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByRole('button', { name: /^Enregistrer$/ }).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteAgendaEvent(entity, evtId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: clearing the label shows a required-field error (no silent save)', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Agenda ReqLabel ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateAgendaEvent(entity, socId);
        expect(seed.ok).toBe(true);
        const evtId = Number(seed.id);

        try {
            await page.goto(`/#/agenda/${evtId}/edit`);
            await page.waitForURL(new RegExp(`/agenda/${evtId}/edit$`), { timeout: 15_000 });
            await expect(page.getByText(new RegExp(`Modifier ${SEED_LABEL}`)).first()).toBeVisible({ timeout: 15_000 });

            // Clear the label and save: must surface a clear required-field error
            // (not a silent no-op) and stay on the edit page.
            await page.locator(`input[value="${SEED_LABEL}"]`).first().fill('');
            await page.getByRole('button', { name: /^Enregistrer$/ }).first().click();

            await expect(page.getByText('Le libellé est obligatoire')).toBeVisible({ timeout: 5_000 });
            await expect(page).toHaveURL(new RegExp(`/agenda/${evtId}/edit$`));
        } finally {
            try { adminDeleteAgendaEvent(entity, evtId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('modify: editing the label on the full edit page PERSISTS', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Agenda Persist ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateAgendaEvent(entity, socId);
        expect(seed.ok).toBe(true);
        const evtId = Number(seed.id);
        const newLabel = `RDV Modifie ${Date.now()}`;

        try {
            await page.goto(`/#/agenda/${evtId}/edit`);
            await page.waitForURL(new RegExp(`/agenda/${evtId}/edit$`), { timeout: 15_000 });
            await expect(page.getByText(new RegExp(`Modifier ${SEED_LABEL}`)).first()).toBeVisible({ timeout: 15_000 });

            await page.locator(`input[value="${SEED_LABEL}"]`).first().fill(newLabel);
            await page.getByRole('button', { name: /^Enregistrer$/ }).first().click();

            // Save must land on the detail page AND the new label must persist
            // (reload from the backend to defeat any client cache).
            await page.waitForURL(new RegExp(`/agenda/${evtId}$`), { timeout: 15_000 });
            await page.goto(`/#/agenda/${evtId}`);
            await expect(page.getByText(newLabel).first()).toBeVisible({ timeout: 15_000 });
        } finally {
            try { adminDeleteAgendaEvent(entity, evtId); } catch { /* swallow */ }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the event', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const tiers = adminCreateThirdParty(entity, `Agenda Del ${Date.now()}`);
        expect(tiers.ok).toBe(true);
        const socId = Number(tiers.id);
        const seed = adminCreateAgendaEvent(entity, socId);
        expect(seed.ok).toBe(true);
        const evtId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/agenda/${evtId}`);
            await page.waitForURL(new RegExp(`/agenda/${evtId}$`), { timeout: 15_000 });

            // The desktop detail bar has a direct "Supprimer" button (no overflow).
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // Confirm dialog (smartcommon useConfirm).
            await expect(page.getByText(/Supprimer cet évènement/).first()).toBeVisible({ timeout: 5_000 });
            await page.getByRole('button', { name: /^Supprimer$/ }).last().click();

            // handleDelete navigates back to the list with replace:true.
            await page.waitForURL(/#\/agenda$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteAgendaEvent(entity, evtId); } catch { /* swallow */ }
            }
            try { adminDeleteThirdParty(entity, socId); } catch { /* swallow */ }
        }
    });
});
