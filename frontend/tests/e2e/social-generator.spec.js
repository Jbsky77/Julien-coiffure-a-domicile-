// E2E — Avant/Après social media generator
const { test, expect } = require('./fixtures');
const { seedSocialGenerator, cleanupClient } = require('./helpers');

async function openPhotosTab(page, clientId) {
  await page.goto('/clients/' + clientId);
  await page.waitForLoadState('networkidle');
  await page.locator('[data-testid="tab-photos"]').click();
  await page.waitForLoadState('networkidle');
}

test.describe('Social generator — Avant·Après', () => {
  let clientId;
  let pairId;

  test.beforeAll(async () => {
    const seed = await seedSocialGenerator();
    clientId = seed.client.id;
    pairId = seed.photo.id;
  });

  test.afterAll(async () => {
    await cleanupClient(clientId);
  });

  test('génère un visuel carré (Insta post) avec preview + bouton télécharger/partager', async ({ page }) => {
    await openPhotosTab(page, clientId);

    // Photo pair card should be present.
    await expect(page.locator(`[data-testid="photo-pair-${pairId}"]`)).toBeVisible();

    await page.locator(`[data-testid="social-square-${pairId}"]`).click();
    const modal = page.locator('[data-testid="social-preview-modal"]');
    await expect(modal).toBeVisible();
    // Generated image must be present and non-empty.
    const img = modal.locator('img');
    await expect(img).toBeVisible();
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^data:image\/jpeg;base64,/);
    expect(src.length).toBeGreaterThan(2000);

    await expect(page.locator('[data-testid="social-dl-btn"]')).toBeVisible();
    await expect(page.locator('[data-testid="social-share-btn"]')).toBeVisible();

    await page.locator('[data-testid="social-close"]').click();
    await expect(modal).toBeHidden();
  });

  test('génère un visuel story (1080x1920) sans crash', async ({ page }) => {
    await openPhotosTab(page, clientId);

    await page.locator(`[data-testid="social-story-${pairId}"]`).click();
    const modal = page.locator('[data-testid="social-preview-modal"]');
    await expect(modal).toBeVisible();
    const img = modal.locator('img');
    const src = await img.getAttribute('src');
    expect(src).toMatch(/^data:image\/jpeg;base64,/);
    // Verify intrinsic dimensions correspond to 1080x1920.
    const dims = await img.evaluate((el) => ({ w: el.naturalWidth, h: el.naturalHeight }));
    expect(dims.w).toBe(1080);
    expect(dims.h).toBe(1920);
  });

  test('téléchargement fonctionne (pas de crash, fichier .jpg)', async ({ page }) => {
    await openPhotosTab(page, clientId);

    await page.locator(`[data-testid="social-square-${pairId}"]`).click();
    await expect(page.locator('[data-testid="social-preview-modal"]')).toBeVisible();

    const dlPromise = page.waitForEvent('download');
    await page.locator('[data-testid="social-dl-btn"]').click();
    const download = await dlPromise;
    expect(download.suggestedFilename()).toMatch(/avant-apres-square-.*\.jpg$/);
  });
});
