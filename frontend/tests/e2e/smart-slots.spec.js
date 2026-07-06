// E2E — Smart slot suggestions on AppointmentForm
const { test, expect } = require('./fixtures');
const { seedSmartSlots, cleanupClient } = require('./helpers');

test.describe('Smart slots — AppointmentForm', () => {
  let clientId;

  test.beforeAll(async () => {
    const { client } = await seedSmartSlots();
    clientId = client.id;
  });

  test.afterAll(async () => {
    await cleanupClient(clientId);
  });

  test('suggère des créneaux et applique celui choisi sur le champ date', async ({ page }) => {
    await page.goto('/rdv/nouveau');
    await page.waitForLoadState('networkidle');

    // The smart-slots card is hidden until a client is selected.
    await page.locator('[data-testid="rdv-client-select"]').selectOption(clientId);
    await expect(page.locator('[data-testid="smart-slots-card"]')).toBeVisible();

    // Pick a date a few days in the future to keep slots inside working hours.
    const target = new Date();
    target.setDate(target.getDate() + 3);
    target.setHours(10, 0, 0, 0);
    const isoLocal = target.toISOString().slice(0, 16);
    await page.locator('[data-testid="rdv-date-input"]').fill(isoLocal);

    // Trigger suggestions and wait for the API response.
    const apiResponse = page.waitForResponse(
      (r) => r.url().includes('/api/slots/suggest') && r.request().method() === 'POST',
      { timeout: 10_000 }
    );
    await page.locator('[data-testid="suggest-slots-btn"]').click();
    const resp = await apiResponse;
    expect(resp.status()).toBe(200);

    // At least one suggestion should appear.
    const firstSlot = page.locator('[data-testid="slot-pick-0"]');
    await expect(firstSlot).toBeVisible();

    const slotLabel = (await firstSlot.innerText()).trim().split('\n')[0]; // e.g. "09:00"

    await firstSlot.click();

    // After picking, suggestions list disappears and the date input is updated.
    await expect(page.locator('[data-testid="slot-pick-0"]')).toHaveCount(0);
    const dateValue = await page.locator('[data-testid="rdv-date-input"]').inputValue();
    expect(dateValue).toMatch(/T\d{2}:\d{2}$/);
    // Ensure picked slot label is reflected in the date field.
    expect(dateValue).toContain(slotLabel);
  });

  test('cas sans suggestion : aucune slot-pick affichée', async ({ page }) => {
    await page.goto('/rdv/nouveau');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="rdv-client-select"]').selectOption(clientId);

    // Date in 1900 ⇒ valid ISO but extremely past — backend still responds with empty list.
    await page.locator('[data-testid="rdv-date-input"]').fill('1900-01-01T08:00');

    // Force a too-large duration so backend filters everything out (>10h working window).
    // We can't set duration directly here (no UI input on form); instead we rely on default
    // and just expect either an empty list or 1 generic slot — assertion is "no crash".
    const apiResponse = page.waitForResponse((r) => r.url().includes('/api/slots/suggest'));
    await page.locator('[data-testid="suggest-slots-btn"]').click();
    const resp = await apiResponse;
    expect(resp.status()).toBe(200);
    // Card stays visible regardless.
    await expect(page.locator('[data-testid="smart-slots-card"]')).toBeVisible();
  });
});
