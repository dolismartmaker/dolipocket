/**
 * agenda-quickcreate spec: exercises the quick event creation modal (Nextcloud-style)
 * from the calendar time grid (week/day view).
 *
 * The test verifies that:
 *   - clicking a time slot opens the EventQuickCreateModal
 *   - dragging over the grid creates a selection and pre-fills start/end
 *   - filling the form (title, dates, location, description) works
 *   - submitting creates the event on the backend
 *   - the event appears in the calendar after creation
 *
 * Desktop-focused (the time grid is only visible on week/day views).
 */
import { test, expect } from '../fixtures/authenticated.js';

const EVENT_TITLE = `E2E Quick Event ${Date.now()}`;
const EVENT_LOCATION = 'Siège social';
const EVENT_DESCRIPTION = 'Test création rapide événement';

// Open the agenda, ensure we are on the week view with the time grid visible.
async function gotoWeekView(page) {
    await page.goto('/#/agenda');
    await page.waitForURL(/#\/agenda$/, { timeout: 15_000 });

    const weekButton = page.getByRole('button', { name: /^Semaine$/ });
    if (await weekButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await weekButton.click();
        await page.waitForTimeout(500); // transition
    }

    // Day columns of the time grid.
    const columns = page.getByTestId('day-column');
    await expect(columns.first()).toBeVisible({ timeout: 10_000 });
    return columns;
}

// The time grid is a tall (24h) scrollable area. Pin the scroll to midnight so
// pixel offsets map linearly to the hour we want to target.
async function pinScrollToTop(page) {
    await page.evaluate(() => {
        const col = document.querySelector('[data-testid="day-column"]');
        const scroller = col && col.closest('.overflow-y-auto');
        if (scroller) scroller.scrollTop = 0;
    });
    await page.waitForTimeout(100);
}

const modalLocator = (page) =>
    page.locator('[class*="fixed"][class*="inset-0"]').filter({ hasText: /principal/ });

test.describe('Agenda quick event creation from calendar time grid', () => {
    test('create: filling modal, submitting, and event appears in calendar', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);

        // Click a mid-morning slot (~09:00) on a mid-week column.
        // Column full height covers 24h; 09:00 -> 9/24 of the height.
        const col = columns.nth(2);
        const box = await col.boundingBox();
        await col.click({ position: { x: 20, y: Math.round((9 / 24) * box.height) } });

        // Modal should appear
        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Fill the title field (required)
        const titleInput = page.locator('input[placeholder*="Titre"]').first();
        await titleInput.fill(EVENT_TITLE);

        // Fill location
        const locationInput = page.locator('input[placeholder*="lieu"]').first();
        await locationInput.fill(EVENT_LOCATION);

        // Fill description
        const descInput = page.locator('textarea[placeholder*="description"]').first();
        await descInput.fill(EVENT_DESCRIPTION);

        // Submit via "Enregistrer" button
        const submitButton = page.getByRole('button', { name: /^Enregistrer$/ });
        await submitButton.click();

        // Modal should close after successful submission
        await expect(modal).not.toBeVisible({ timeout: 5_000 });

        // Give time for the list to revalidate
        await page.waitForTimeout(1_000);

        // Verify the event appears in the calendar (text content should include the title)
        const eventChip = page.locator(`text=${EVENT_TITLE}`);
        await expect(eventChip).toBeVisible({ timeout: 10_000 });

        // Click the event to verify it opened and has the data we filled
        await eventChip.first().click();
        const eventDetail = page.locator('[class*="fixed"][class*="inset-0"]').filter({ hasText: EVENT_TITLE });
        await expect(eventDetail).toBeVisible({ timeout: 5_000 });
        await expect(eventDetail.locator(`text=${EVENT_LOCATION}`)).toBeVisible({ timeout: 5_000 });
    });

    test('drag: dragging over the grid pre-fills start/end and creates a timed event', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);
        await pinScrollToTop(page);

        // Drag from 06:00 to 08:00 on a mid-week column.
        const col = columns.nth(3);
        const box = await col.boundingBox();
        const yFor = (hour) => box.y + (hour / 24) * box.height;
        const x = box.x + Math.min(box.width / 2, 30);

        await page.mouse.move(x, yFor(6));
        await page.mouse.down();
        await page.mouse.move(x, yFor(7)); // intermediate to trigger a real drag
        await page.mouse.move(x, yFor(8));
        await page.mouse.up();

        // Modal appears with the dragged range pre-filled.
        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });

        const dateInputs = page.locator('input[type="datetime-local"]');
        await expect(dateInputs).toHaveCount(2, { timeout: 5_000 });

        // Start ends at 06:00, end at 08:00 (drag defined a 2h duration).
        const startVal = await dateInputs.nth(0).inputValue();
        const endVal = await dateInputs.nth(1).inputValue();
        expect(startVal).toMatch(/T06:00$/);
        expect(endVal).toMatch(/T08:00$/);

        // Complete the creation to prove the dragged duration persists.
        const dragTitle = `E2E Drag Event ${Date.now()}`;
        await page.locator('input[placeholder*="Titre"]').first().fill(dragTitle);
        await page.getByRole('button', { name: /^Enregistrer$/ }).click();
        await expect(modal).not.toBeVisible({ timeout: 5_000 });

        await page.waitForTimeout(1_000);
        await expect(page.locator(`text=${dragTitle}`)).toBeVisible({ timeout: 10_000 });
    });

    test('validate: title is required in the modal', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);

        // Empty slot (distinct from the create/drag tests, which occupy
        // columns 2 and 3) so the click is not intercepted by an event block.
        const col = columns.nth(4);
        const box = await col.boundingBox();
        await col.click({ position: { x: 20, y: Math.round((10 / 24) * box.height) } });

        // Modal appears
        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Try to submit without filling title
        const submitButton = page.getByRole('button', { name: /^Enregistrer$/ });
        await submitButton.click();

        // Error message should appear
        const errorMsg = page.locator(`text=Veuillez saisir un titre`);
        await expect(errorMsg).toBeVisible({ timeout: 5_000 });

        // Modal should still be open
        await expect(modal).toBeVisible({ timeout: 5_000 });
    });

    test('openDetails: "Plus de détails" button navigates to full edit form', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);

        // Empty slot (distinct from the create/drag/validate tests).
        const col = columns.nth(5);
        const box = await col.boundingBox();
        await col.click({ position: { x: 20, y: Math.round((11 / 24) * box.height) } });

        // Modal appears
        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });

        // Fill just the title
        const titleInput = page.locator('input[placeholder*="Titre"]').first();
        await titleInput.fill(EVENT_TITLE);

        // Click "Plus de détails"
        const detailsButton = page.getByRole('button', { name: /^Plus de détails$/ });
        await detailsButton.click();

        // Should navigate to /agenda/new with query params
        await page.waitForURL(/\/#\/agenda\/new/, { timeout: 15_000 });

        // The full edit page (AutoForm) should load. It renders inputs but no
        // <form> tag, so assert on the page heading instead.
        await expect(page.getByText('Nouvel évènement').first()).toBeVisible({ timeout: 10_000 });

        // Verify the title typed in the modal is carried over and pre-filled.
        const fullTitleInput = page.locator(`input[value="${EVENT_TITLE}"]`).first();
        await expect(fullTitleInput).toBeVisible({ timeout: 5_000 });
    });
});
