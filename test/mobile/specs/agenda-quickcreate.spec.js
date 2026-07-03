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

// Pin the vertical scroll so a given hour sits at the top of the viewport
// (HOUR_H = 64px per hour), keeping source and target slots both visible.
async function setScrollToHour(page, hour) {
    await page.evaluate((h) => {
        const col = document.querySelector('[data-testid="day-column"]');
        const scroller = col && col.closest('.overflow-y-auto');
        if (scroller) scroller.scrollTop = h * 64;
    }, hour);
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

    test('drag-move: rescheduling an event to another slot updates its time', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);
        await setScrollToHour(page, 6);

        // Create a 30-min event at column 1, ~07:00 (a slot no other test uses).
        const srcCol = columns.nth(1);
        const srcBox = await srcCol.boundingBox();
        await srcCol.click({ position: { x: 20, y: Math.round((7 / 24) * srcBox.height) } });

        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });
        const moveTitle = `E2E Move Event ${Date.now()}`;
        await page.locator('input[placeholder*="Titre"]').first().fill(moveTitle);
        await page.getByRole('button', { name: /^Enregistrer$/ }).click();
        await expect(modal).not.toBeVisible({ timeout: 5_000 });
        await page.waitForTimeout(1_000);

        const block = page.locator('[data-event-block]', { hasText: moveTitle });
        await expect(block).toBeVisible({ timeout: 10_000 });

        // Drag the block (grab 4px below its top) to the last column (index 6),
        // 11:00 -- a slot no other test occupies.
        await setScrollToHour(page, 6);
        const blockBox = await block.boundingBox();
        const tgtCol = columns.nth(6);
        const tgtBox = await tgtCol.boundingBox();
        const grab = 4;
        const cx = blockBox.x + blockBox.width / 2;
        const targetX = tgtBox.x + tgtBox.width / 2;
        const targetY = tgtBox.y + (11 / 24) * tgtBox.height + grab;

        await page.mouse.move(cx, blockBox.y + grab);
        await page.mouse.down();
        await page.mouse.move(cx, blockBox.y + grab + 16); // exceed the 4px drag threshold
        await page.mouse.move(targetX, targetY, { steps: 6 });
        await page.mouse.up();

        // Optimistic update + revalidation.
        await page.waitForTimeout(1_500);

        // Open the moved event and verify its new start time is 11:00.
        const movedBlock = page.locator('[data-event-block]', { hasText: moveTitle });
        await expect(movedBlock).toBeVisible({ timeout: 10_000 });
        await movedBlock.click();

        const quickView = page
            .locator('[class*="fixed"][class*="inset-0"]')
            .filter({ hasText: moveTitle });
        await expect(quickView).toBeVisible({ timeout: 5_000 });
        await expect(quickView).toContainText('11:00');
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

    // Create a timed event at the given column/hour via the quick-create modal.
    async function createEvent(page, columns, colIndex, hour, title) {
        await setScrollToHour(page, Math.max(0, hour - 1));
        const col = columns.nth(colIndex);
        const box = await col.boundingBox();
        await col.click({ position: { x: 20, y: Math.round((hour / 24) * box.height) } });
        const modal = modalLocator(page);
        await expect(modal).toBeVisible({ timeout: 5_000 });
        await page.locator('input[placeholder*="Titre"]').first().fill(title);
        await page.getByRole('button', { name: /^Enregistrer$/ }).click();
        await expect(modal).not.toBeVisible({ timeout: 5_000 });
        await page.waitForTimeout(800);
    }

    const quickViewFor = (page, title) =>
        page.locator('[class*="fixed"][class*="inset-0"]').filter({ hasText: title });

    test('quickview: editing the title saves and reflects on the event', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);
        const title = `QV Save ${Date.now()}`;
        await createEvent(page, columns, 1, 8, title);

        const block = page.locator('[data-event-block]', { hasText: title });
        await expect(block).toBeVisible({ timeout: 10_000 });
        await block.click();

        const qv = quickViewFor(page, title);
        await expect(qv).toBeVisible({ timeout: 5_000 });
        await qv.getByRole('button', { name: /^Éditer$/ }).click();

        const edited = `${title} EDITED`;
        await qv.locator('input[type="text"]').first().fill(edited);
        await qv.getByRole('button', { name: /^Enregistrer$/ }).click();

        // Popup closes on success and the grid reflects the new title.
        await expect(quickViewFor(page, edited)).not.toBeVisible({ timeout: 5_000 });
        await expect(
            page.locator('[data-event-block]', { hasText: edited }),
        ).toBeVisible({ timeout: 10_000 });
    });

    test('quickview: an unsaved title draft does NOT leak to another event', async ({
        authenticatedPage: page,
    }) => {
        const columns = await gotoWeekView(page);
        const ts = Date.now();
        const titleA = `QV Leak A ${ts}`;
        const titleB = `QV Leak B ${ts}`;
        await createEvent(page, columns, 1, 6, titleA);
        await createEvent(page, columns, 1, 10, titleB);

        // Open A, enter edit mode, type a draft, then CLOSE without saving.
        const blockA = page.locator('[data-event-block]', { hasText: titleA });
        await expect(blockA).toBeVisible({ timeout: 10_000 });
        await blockA.click();
        const qvA = quickViewFor(page, titleA);
        await expect(qvA).toBeVisible({ timeout: 5_000 });
        await qvA.getByRole('button', { name: /^Éditer$/ }).click();
        await qvA.locator('input[type="text"]').first().fill('LEAKED-DRAFT');
        // Close via the header X (first button in the popup), WITHOUT saving.
        await qvA.locator('button').first().click();
        await page.waitForTimeout(300);

        // Open B: it must show B in VIEW mode, never the leaked draft.
        const blockB = page.locator('[data-event-block]', { hasText: titleB });
        await blockB.click();
        const qvB = quickViewFor(page, titleB);
        await expect(qvB).toBeVisible({ timeout: 5_000 });
        // Not stuck in edit mode -> the "Éditer" button is present.
        await expect(qvB.getByRole('button', { name: /^Éditer$/ })).toBeVisible();
        // The leaked draft must not appear anywhere in B's popup.
        await expect(qvB).not.toContainText('LEAKED-DRAFT');
    });
});
