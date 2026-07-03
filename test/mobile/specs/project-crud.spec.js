/**
 * project-crud spec: exercises the project (Project) lifecycle from the desktop
 * detail page. A project is a header-only object (no product lines).
 *
 * Covers, each as an independent test (own seed + teardown):
 *   - open   : a seeded project renders on /projects/:id (ref + title).
 *   - pdf    : the "PDF" action triggers generateDocument and surfaces the
 *              "PDF généré" toast.
 *   - modify : the edit page opens populated (title input) and a save round-trips
 *              back to the detail page (manual form, not the AutoForm path).
 *   - delete : the "Supprimer" action + confirm removes the project.
 *
 * Seeding uses the admin-actions.php create-project subcommand. The Modifier /
 * PDF / Supprimer actions are shown for any status, so a validated project is
 * seeded for every test.
 */
import { test, expect } from '../fixtures/authenticated.js';
import {
    adminCreateProject,
    adminDeleteProject,
} from '../helpers/admin.js';

const SEED_TITLE = 'Projet E2E';

test.describe('Project CRUD from the desktop detail page', () => {
    test('open: a seeded project renders its ref and title', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const seed = adminCreateProject(entity, true);
        expect(seed.ok).toBe(true);
        const projId = Number(seed.id);
        expect(projId).toBeGreaterThan(0);

        try {
            await page.goto(`/#/projects/${projId}`);
            await page.waitForURL(new RegExp(`/projects/${projId}$`), { timeout: 15_000 });

            await expect(page.getByText(seed.ref).first()).toBeVisible({ timeout: 15_000 });
            await expect(page.getByText(SEED_TITLE).first()).toBeVisible({ timeout: 10_000 });
        } finally {
            try { adminDeleteProject(entity, projId); } catch { /* swallow */ }
        }
    });

    test('pdf: the "PDF" action produces a PDF via the backend', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const seed = adminCreateProject(entity, true);
        expect(seed.ok).toBe(true);
        const projId = Number(seed.id);

        try {
            await page.goto(`/#/projects/${projId}`);
            await page.waitForURL(new RegExp(`/projects/${projId}$`), { timeout: 15_000 });

            await page.getByRole('button', { name: /^PDF$/ }).first().click();
            await expect(page.getByText(/PDF généré/).first()).toBeVisible({ timeout: 20_000 });
        } finally {
            try { adminDeleteProject(entity, projId); } catch { /* swallow */ }
        }
    });

    test('modify: the edit page opens populated and a save round-trips', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const seed = adminCreateProject(entity, true);
        expect(seed.ok).toBe(true);
        const projId = Number(seed.id);

        try {
            await page.goto(`/#/projects/${projId}/edit`);
            await page.waitForURL(new RegExp(`/projects/${projId}/edit$`), { timeout: 15_000 });

            // The edit form loaded the project (guards a blank-form regression):
            // the title input carries the seeded value.
            await expect(page.getByRole('textbox').first()).toHaveValue(new RegExp(SEED_TITLE), { timeout: 15_000 });

            await page.getByRole('button', { name: /^Enregistrer$/ }).first().click();
            // useProjectEditData navigates back to the detail on success.
            await page.waitForURL(new RegExp(`/projects/${projId}$`), { timeout: 15_000 });
        } finally {
            try { adminDeleteProject(entity, projId); } catch { /* swallow */ }
        }
    });

    test('delete: the danger action removes the project', async ({
        authenticatedPage: page,
        backendInfo,
    }) => {
        const entity = backendInfo.testUser.entity;
        const seed = adminCreateProject(entity, true);
        expect(seed.ok).toBe(true);
        const projId = Number(seed.id);
        let deletedViaUi = false;

        try {
            await page.goto(`/#/projects/${projId}`);
            await page.waitForURL(new RegExp(`/projects/${projId}$`), { timeout: 15_000 });

            // Direct "Supprimer" button (custom detail page, no overflow). The
            // relational sections are empty for a fresh project, so the header
            // button is unambiguous.
            await page.getByRole('button', { name: /^Supprimer$/ }).first().click();

            // Confirm dialog (smartcommon useConfirm).
            await expect(page.getByText(/Supprimer ce projet/).first()).toBeVisible({ timeout: 5_000 });
            await page.getByRole('button', { name: /^Supprimer$/ }).last().click();

            // handleDelete navigates to the list on success.
            await page.waitForURL(/#\/projects$/, { timeout: 15_000 });
            deletedViaUi = true;
        } finally {
            if (!deletedViaUi) {
                try { adminDeleteProject(entity, projId); } catch { /* swallow */ }
            }
        }
    });
});
