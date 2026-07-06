// E2E — PIN lock, global search, map page
const { test, expect } = require('./fixtures');
const axios = require('axios');
const { API } = require('./helpers');

test.describe('PIN lock', () => {
  test('l\'app est déverrouillée quand un token PIN valide est présent', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Pin lock screen should NOT be visible
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toHaveCount(0);
    // Dashboard is visible
    await expect(page.locator('[data-testid="topbar-search"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-lock"]')).toBeVisible();
  });

  test('le bouton "Verrouiller" affiche l\'écran de PIN', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="topbar-lock"]').click();
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toBeVisible();
    await expect(page.locator('[data-testid="pin-title"]')).toContainText('Coiffure');
  });

  test('saisir le PIN 123456 déverrouille l\'app', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="topbar-lock"]').click();
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toBeVisible();
    for (const d of '123456') {
      await page.locator(`[data-testid="pin-key-${d}"]`).click();
    }
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toBeHidden({ timeout: 5000 });
    await expect(page.locator('[data-testid="topbar-search"]')).toBeVisible();
  });

  test('un PIN erroné secoue l\'écran et ne déverrouille pas', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="topbar-lock"]').click();
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toBeVisible();
    for (const d of '000000') {
      await page.locator(`[data-testid="pin-key-${d}"]`).click();
    }
    // Screen stays
    await expect(page.locator('[data-testid="pin-lock-screen"]')).toBeVisible();
  });
});

test.describe('Recherche globale', () => {
  let clientId;
  test.beforeAll(async () => {
    const c = (await axios.post(API + '/clients', {
      first_name: 'Testine',
      last_name: 'SearchE2E',
      phone: '0612345678',
      gender: 'F',
    })).data;
    clientId = c.id;
  });
  test.afterAll(async () => {
    if (clientId) await axios.delete(API + '/clients/' + clientId).catch(() => {});
  });

  test('ouvre le modal via l\'icône loupe, filtre et navigue', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await page.locator('[data-testid="topbar-search"]').click();
    await expect(page.locator('[data-testid="global-search-overlay"]')).toBeVisible();
    await page.locator('[data-testid="global-search-input"]').fill('SearchE2E');
    const result = page.locator(`[data-testid="search-result-${clientId}"]`);
    await expect(result).toBeVisible();
    await result.click();
    await expect(page).toHaveURL(new RegExp(`/clients/${clientId}$`));
  });
});

test.describe('Carte interactive', () => {
  test('la page /carte s\'affiche avec le container Leaflet et la légende', async ({ page }) => {
    await page.goto('/carte');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="map-page"]')).toBeVisible();
    await expect(page.locator('[data-testid="map-container"]')).toBeVisible();
    // Legend: check "Actif" pill exists
    await expect(page.getByText('Actif').first()).toBeVisible();
  });
});
