/**
 * Smoke spec: validates the full auth bridge from Blade login to the PWA
 * authenticated layout, plus the navigation menu rendered by the Sidebar.
 *
 * If this spec fails the rest of the suite cannot pass, so it is the first
 * one to inspect when the harness misbehaves.
 */
import { test, expect } from '../fixtures/authenticated.js';

test('login Blade -> handoff -> HomePage with menu', async ({ authenticatedPage: page }) => {
    // Sanity: we should be on the PWA root after the handoff has been consumed.
    expect(page.url()).toMatch(new RegExp(`^http://127\\.0\\.0\\.1:${process.env.DOLIPOCKET_TEST_PWA_PORT || 5195}/`));

    // The HomePage exposes the "Dolipocket" brand string in the gradient
    // header (mobile) and in the desktop welcome heading. Either is fine.
    await expect(page.getByText(/Dolipocket/i).first()).toBeVisible();

    // The Sidebar (desktop) lists section titles (Relations / Vente / Achat
    // / Catalogue / Transverse / Principal). Only the active media query
    // (md: ...) shows it; Playwright Chromium runs at desktop width by
    // default so all sections must be present in the DOM.
    for (const section of ['Principal', 'Relations', 'Vente', 'Achat', 'Catalogue', 'Transverse']) {
        await expect(page.getByText(section, { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    }

    // The Sidebar should expose "Tiers" as a clickable nav item.
    await expect(page.getByText('Tiers', { exact: true }).first()).toBeVisible();
});
