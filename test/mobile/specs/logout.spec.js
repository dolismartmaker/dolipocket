/**
 * logout spec: from the authenticated PWA, click the sidebar Logout button
 * and assert the user lands back on the login flow.
 *
 * The logout call clears the smartcommon session and the smartauth tokens.
 * After logout, the PrivatePagesLayout should bounce the user to /login or
 * /welcome. We simply assert we are no longer on the home dashboard.
 */
import { test, expect } from '../fixtures/authenticated.js';

test('logout returns to a public route', async ({ authenticatedPage: page }) => {
    // Sanity: we start authenticated on /.
    expect(new URL(page.url()).pathname).toBe('/');

    // Click the desktop sidebar Logout button (visible at md+ widths).
    // The button has title="Deconnexion" and a text span "Deconnexion" inside.
    await page.getByRole('button', { name: /Deconnexion/i }).first().click();

    // After logout, the route guard should send the user to either /login,
    // /welcome, or the public Blade login (which lives on a different origin
    // and is reached via a hard redirect). Accept any of these as success.
    await page.waitForURL(
        (url) =>
            url.pathname === '/login' ||
            url.pathname === '/welcome' ||
            url.pathname.startsWith('/custom/dolipocket/public'),
        { timeout: 10_000 }
    );

    // The HomePage's "Tableau de bord" should no longer be visible.
    await expect(page.getByText(/Tableau de bord/i)).toHaveCount(0);
});
