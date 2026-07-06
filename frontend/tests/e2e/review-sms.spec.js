// E2E — Bouton "Demander un avis" sur la fiche client
const { test, expect } = require('@playwright/test');
const axios = require('axios');
const { API } = require('./helpers');

const REVIEW_URL = 'https://www.google.com/search?q=this+is+a+very+long+placeholder+url+for+e2e';

test.describe('Fiche client — Demander un avis Google', () => {
  let clientId;
  let expectedUrlInSms;

  test.beforeAll(async () => {
    // Set the Google review URL (backend will auto-shorten it)
    const updated = (await axios.put(API + '/settings', { google_review_url: REVIEW_URL })).data;
    // The SMS should contain either the short or the long URL depending on shortener availability.
    expectedUrlInSms = updated.google_review_url_short || updated.google_review_url;
    // Create a test client WITH a phone
    const c = (await axios.post(API + '/clients', {
      first_name: 'AvisTest',
      last_name: 'E2E',
      phone: '0600000099',
      address: '',
      gender: 'F',
    })).data;
    clientId = c.id;
  });

  test.afterAll(async () => {
    if (clientId) await axios.delete(API + '/clients/' + clientId).catch(() => {});
    await axios.put(API + '/settings', { google_review_url: '' });
  });

  test('affiche le bouton "Demander un avis" avec un lien SMS prérempli', async ({ page }) => {
    await page.goto('/clients/' + clientId);
    await page.waitForLoadState('networkidle');

    const btn = page.locator('[data-testid="ask-review-btn"]');
    await expect(btn).toBeVisible();
    const href = await btn.getAttribute('href');
    expect(href).not.toBeNull();
    expect(href.startsWith('sms:')).toBe(true);
    // Number is included
    expect(href).toContain('0600000099');
    // URL is embedded in the encoded body (short or long)
    expect(decodeURIComponent(href)).toContain(expectedUrlInSms);
    expect(decodeURIComponent(href)).toContain('AvisTest');
  });

  test('affiche un état désactivé quand le lien n\'est pas configuré', async ({ page }) => {
    await axios.put(API + '/settings', { google_review_url: '' });
    await page.goto('/clients/' + clientId);
    await page.waitForLoadState('networkidle');

    await expect(page.locator('[data-testid="ask-review-btn"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="ask-review-disabled"]')).toBeVisible();
  });
});
