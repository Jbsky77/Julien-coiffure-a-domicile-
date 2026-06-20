// E2E — Ajout d'une prestation depuis Réglages (avec durée moyenne)
const { test, expect } = require('@playwright/test');
const axios = require('axios');
const { API } = require('./helpers');

const TEST_NAME = 'E2E_TEST_Prestation_' + Date.now();

test.describe('Settings — Add prestation with duration', () => {
  test.afterAll(async () => {
    try {
      const services = (await axios.get(API + '/services')).data;
      for (const s of services) {
        if (s.name === TEST_NAME) {
          await axios.delete(API + '/services/' + s.id);
        }
      }
    } catch (_) { /* ignore */ }
  });

  test('peut ajouter une prestation Femme avec un prix et une durée moyenne', async ({ page }) => {
    await page.goto('/reglages');
    await page.waitForLoadState('networkidle');

    // Fields exist
    await expect(page.locator('[data-testid="svc-add-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="svc-add-price"]')).toBeVisible();
    await expect(page.locator('[data-testid="svc-add-duration"]')).toBeVisible();

    await page.locator('[data-testid="svc-add-name"]').fill(TEST_NAME);
    await page.locator('[data-testid="svc-add-price"]').fill('33');
    await page.locator('[data-testid="svc-add-duration"]').fill('55');
    await page.locator('[data-testid="svc-add-cat-FEMME"]').click();

    const apiResp = page.waitForResponse(
      (r) => r.url().endsWith('/api/services') && r.request().method() === 'POST'
    );
    await page.locator('[data-testid="svc-add-btn"]').click();
    const resp = await apiResp;
    expect(resp.status()).toBe(200);

    const body = await resp.json();
    expect(body.name).toBe(TEST_NAME);
    expect(body.price).toBe(33);
    expect(body.duration_minutes).toBe(55);
    expect(body.category).toBe('FEMME');
  });

  test('peut modifier la durée d\'une prestation existante', async ({ page }) => {
    // Create a fresh prestation via API
    const seed = (await axios.post(API + '/services', {
      name: TEST_NAME + '_EDIT',
      price: 20,
      category: 'HOMME',
      duration_minutes: 30,
    })).data;

    await page.goto('/reglages');
    await page.waitForLoadState('networkidle');

    const durInput = page.locator(`[data-testid="svc-duration-${seed.id}"]`);
    await durInput.scrollIntoViewIfNeeded();

    const apiResp = page.waitForResponse(
      (r) => r.url().endsWith('/api/services/' + seed.id) && r.request().method() === 'PUT'
    );
    await durInput.fill('75');
    await durInput.blur();
    const resp = await apiResp;
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.duration_minutes).toBe(75);

    // Cleanup
    await axios.delete(API + '/services/' + seed.id);
  });
});
