/**
 * agenda-filters spec: exercises the desktop calendar filter bar (B-front-1,
 * cf docs/AGENDA_FILTERS_SPEC.md).
 *
 * Verifies the wiring UI -> query params -> backend, without depending on any
 * particular seeded event data:
 *   - the filter bar and its preset chips render on desktop
 *   - clicking the "A faire" preset issues GET /event?...status=todo
 *   - the Type dropdown opens and lists at least one dictionary type
 *   - toggling "Masquer les auto" issues GET /event?...hideAuto=1
 *
 * Network assertions are the point: they prove the filter actually reaches the
 * server with the right parameter.
 */
import { test, expect } from '../fixtures/authenticated.js';

async function gotoAgenda(page) {
    await page.goto('/#/agenda');
    await page.waitForURL(/#\/agenda$/, { timeout: 15_000 });
    await expect(page.getByTestId('agenda-filter-bar')).toBeVisible({ timeout: 15_000 });
}

test.describe('Agenda desktop filter bar', () => {
    test('presets render and "A faire" filters by status=todo', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);

        // Core presets are present.
        await expect(page.getByTestId('agenda-preset-all')).toBeVisible();
        await expect(page.getByTestId('agenda-preset-todo')).toBeVisible();
        await expect(page.getByTestId('agenda-preset-overdue')).toBeVisible();
        await expect(page.getByTestId('agenda-preset-done')).toBeVisible();

        // Clicking "A faire" must hit the backend with status=todo.
        const [req] = await Promise.all([
            page.waitForRequest(
                (r) => r.url().includes('/event') && r.url().includes('status=todo'),
                { timeout: 10_000 },
            ),
            page.getByTestId('agenda-preset-todo').click(),
        ]);
        expect(req.url()).toContain('status=todo');

        // The preset becomes active (filled).
        await expect(page.getByTestId('agenda-preset-todo')).toHaveClass(/bg-primary/);
    });

    test('type dropdown lists dictionary types', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);

        await page.getByTestId('agenda-type-toggle').click();
        // filter-options seeds at least AC_OTH / AC_OTH_AUTO -> >= 1 option row.
        await expect(page.getByTestId('agenda-type-option').first()).toBeVisible({ timeout: 10_000 });
        const count = await page.getByTestId('agenda-type-option').count();
        expect(count).toBeGreaterThan(0);
    });

    test('"Masquer les auto" filters by hideAuto=1', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);

        const [req] = await Promise.all([
            page.waitForRequest(
                (r) => r.url().includes('/event') && r.url().includes('hideAuto=1'),
                { timeout: 10_000 },
            ),
            page.getByTestId('agenda-hideauto').click(),
        ]);
        expect(req.url()).toContain('hideAuto=1');
    });

    test('"Anniversaires" toggle filters by showbirthday=1', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);
        const [req] = await Promise.all([
            page.waitForRequest(
                (r) => r.url().includes('/event') && r.url().includes('showbirthday=1'),
                { timeout: 10_000 },
            ),
            page.getByTestId('agenda-birthday').click(),
        ]);
        expect(req.url()).toContain('showbirthday=1');
        await expect(page.getByTestId('agenda-birthday')).toHaveClass(/border-primary/);
    });

    test('status select filters by status and surfaces a removable chip', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);

        // Selecting "En cours" (bucket 50) hits the backend with status=50.
        const [req] = await Promise.all([
            page.waitForRequest(
                (r) => r.url().includes('/event') && r.url().includes('status=50'),
                { timeout: 10_000 },
            ),
            page.getByTestId('agenda-status-select').selectOption('50'),
        ]);
        expect(req.url()).toContain('status=50');

        // An active chip appears. Removing it resets the status select.
        const chips = page.getByTestId('agenda-filter-chips');
        await expect(chips).toBeVisible();
        await chips.getByRole('button').first().click();
        await expect(page.getByTestId('agenda-status-select')).toHaveValue('');
    });

    test('entity pickers (third party + project + resource) are present', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);
        await expect(page.getByTestId('agenda-thirdparty-picker')).toBeVisible();
        await expect(page.getByTestId('agenda-project-picker')).toBeVisible();
        await expect(page.getByTestId('agenda-resource-picker')).toBeVisible();
    });

    test('month view renders (density heatmap path does not crash)', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);
        // Wait for the calendar to finish its initial mount (week time grid) so
        // the first view-switch click is not swallowed by the mount animation.
        await expect(page.getByTestId('day-column').first()).toBeVisible({ timeout: 10_000 });

        // First view switch after mount must work (AnimatePresence sync-mode fix)
        // and render the desktop month grid with the density heatmap.
        await page.getByRole('button', { name: /^Mois$/ }).click();
        await expect(page.getByTestId('calendar-month-grid')).toBeVisible({ timeout: 10_000 });
    });

    test('saved views: save current filters, clear, then reapply', async ({ authenticatedPage: page }) => {
        await gotoAgenda(page);

        // Activate a filter, save the state as a named view.
        await page.getByTestId('agenda-hideauto').click();
        await expect(page.getByTestId('agenda-hideauto')).toHaveClass(/border-primary/);
        await page.getByTestId('agenda-views-toggle').click();
        await page.getByTestId('agenda-view-name').fill('E2E view');
        await page.getByTestId('agenda-view-save').click();
        await expect(page.getByTestId('agenda-view-item')).toBeVisible();

        // Close the panel and clear all filters.
        await page.keyboard.press('Escape');
        await page.getByTestId('agenda-filter-clear').click();
        await expect(page.getByTestId('agenda-hideauto')).not.toHaveClass(/border-primary/);

        // Reapply the saved view -> the hideAuto=1 request fires again.
        await page.getByTestId('agenda-views-toggle').click();
        const [req] = await Promise.all([
            page.waitForRequest(
                (r) => r.url().includes('/event') && r.url().includes('hideAuto=1'),
                { timeout: 10_000 },
            ),
            page.getByTestId('agenda-view-item').first().click(),
        ]);
        expect(req.url()).toContain('hideAuto=1');
        await expect(page.getByTestId('agenda-hideauto')).toHaveClass(/border-primary/);
    });

    test('preset count badges are fed by GET /event/counts', async ({ authenticatedPage: page }) => {
        // The counts request fires on window load; the "Tout" preset shows a
        // numeric badge sourced from it.
        const [req] = await Promise.all([
            page.waitForRequest((r) => r.url().includes('/event/counts'), { timeout: 15_000 }),
            page.goto('/#/agenda'),
        ]);
        expect(req.url()).toContain('/event/counts');

        const badge = page.getByTestId('agenda-preset-count-all');
        await expect(badge).toBeVisible({ timeout: 10_000 });
        await expect(badge).toHaveText(/^\d+$/);
    });
});
