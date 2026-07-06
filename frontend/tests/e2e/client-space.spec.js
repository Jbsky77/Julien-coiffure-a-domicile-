// E2E — Espace client + demandes de RDV + notifications
const { test, expect } = require('./fixtures');
const axios = require('axios');
const { API } = require('./helpers');

test.describe('Espace client & Demandes RDV', () => {
  let clientId;
  let accessToken;

  test.beforeAll(async () => {
    const c = (await axios.post(API + '/clients', {
      first_name: 'Espace',
      last_name: 'TestE2E',
      phone: '0611223344',
      gender: 'F',
    })).data;
    clientId = c.id;
    accessToken = c.access_token;
    expect(accessToken).toBeTruthy();
    expect(accessToken.length).toBeGreaterThan(20);
  });

  test.afterAll(async () => {
    if (clientId) await axios.delete(API + '/clients/' + clientId).catch(() => {});
  });

  test('l\'espace client public s\'affiche via le lien magique', async ({ page }) => {
    // Client space is a public route — no PIN needed
    await page.goto('/c/' + accessToken);
    await expect(page.locator('[data-testid="client-space-title"]')).toContainText('Espace');
    // Tabs are present
    await expect(page.locator('[data-testid="tab-fidelite"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-historique"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-rdv"]')).toBeVisible();
    // Loyalty summary card
    await expect(page.locator('[data-testid="loyalty-summary"]')).toBeVisible();
  });

  test('un lien invalide → page d\'erreur claire', async ({ page }) => {
    await page.goto('/c/token_completely_invalid_1234567890');
    await expect(page.getByText('Accès impossible')).toBeVisible();
  });

  test('le client soumet une demande de RDV → admin la voit', async ({ page }) => {
    // Fetch a service id via API
    const services = (await axios.get(API + '/public/client/' + accessToken + '/services')).data;
    expect(services.length).toBeGreaterThan(0);
    const svcId = services[0].id;

    await page.goto('/c/' + accessToken);
    await page.locator('[data-testid="tab-rdv"]').click();
    // Pick a service
    await page.locator(`[data-testid="req-svc-${svcId}"]`).click();
    // Set a future date
    const future = new Date(Date.now() + 7 * 86400e3);
    future.setHours(10, 0, 0, 0);
    await page.locator('[data-testid="req-date"]').fill(future.toISOString().slice(0, 16));
    await page.locator('[data-testid="req-comment"]').fill('E2E test comment');

    const resp = page.waitForResponse(
      (r) => r.url().includes('/appointment-requests') && r.request().method() === 'POST'
    );
    await page.locator('[data-testid="submit-request-btn"]').click();
    const r = await resp;
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('pending');

    // Now visit admin /demandes and see the request appears
    await page.goto('/demandes');
    await expect(page.locator('[data-testid="requests-page"]')).toBeVisible();
    await expect(page.locator(`[data-testid="request-${body.id}"]`)).toBeVisible();
    await expect(page.locator(`[data-testid="accept-${body.id}"]`)).toBeVisible();
  });

  test('l\'admin accepte une demande → RDV créé', async ({ page }) => {
    // Create a fresh request
    const services = (await axios.get(API + '/public/client/' + accessToken + '/services')).data;
    const future = new Date(Date.now() + 7 * 86400e3).toISOString();
    const req = (await axios.post(API + '/public/client/' + accessToken + '/appointment-requests', {
      requested_date: future,
      service_ids: [services[0].id],
      comment: 'accepted flow',
    })).data;

    await page.goto('/demandes');
    await page.locator(`[data-testid="request-${req.id}"]`).scrollIntoViewIfNeeded();
    const apiResp = page.waitForResponse((r) => r.url().includes(`/appointment-requests/${req.id}/action`));
    await page.locator(`[data-testid="accept-${req.id}"]`).click();
    const r = await apiResp;
    expect(r.status()).toBe(200);
    const body = await r.json();
    expect(body.status).toBe('accepted');
    expect(body.linked_appointment_id).toBeTruthy();
  });

  test('badge nav affiche le nombre de demandes en cours', async ({ page }) => {
    // Create a pending request
    const services = (await axios.get(API + '/public/client/' + accessToken + '/services')).data;
    await axios.post(API + '/public/client/' + accessToken + '/appointment-requests', {
      requested_date: new Date(Date.now() + 14 * 86400e3).toISOString(),
      service_ids: [services[0].id],
      comment: '',
    });
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    // Wait a moment for the polling call
    await page.waitForTimeout(2000);
    await expect(page.locator('[data-testid="pending-badge"]')).toBeVisible();
  });

  test('la fiche client affiche le bouton "Envoyer la carte de fidélité"', async ({ page }) => {
    await page.goto('/clients/' + clientId);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('[data-testid="client-space-card"]')).toBeVisible();
    const btn = page.locator('[data-testid="send-card-sms"]');
    await expect(btn).toBeVisible();
    const href = await btn.getAttribute('href');
    expect(href.startsWith('sms:')).toBe(true);
    expect(href).toContain('0611223344');
    expect(decodeURIComponent(href)).toContain('/c/' + accessToken);
  });
});
