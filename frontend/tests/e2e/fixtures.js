// Playwright fixture — auto-unlocks the app for every test.
// Sets PIN 123456 (default seed) if not configured, and injects the token in
// localStorage so PinGate skips straight to the unlocked state.
const base = require('@playwright/test');
const axios = require('axios');

const API = (process.env.PLAYWRIGHT_BASE_URL || process.env.REACT_APP_BACKEND_URL) + '/api';

async function ensurePinAndToken() {
  const status = (await axios.get(API + '/pin/status')).data;
  if (!status.configured) {
    const r = await axios.post(API + '/pin/set', { pin: '123456', ttl_seconds: 3600 });
    return { token: r.data.token, expiresIn: r.data.expires_in };
  }
  const r = await axios.post(API + '/pin/unlock', { pin: '123456', ttl_seconds: 3600 });
  return { token: r.data.token, expiresIn: r.data.expires_in };
}

exports.test = base.test.extend({
  page: async ({ page }, use) => {
    const { token, expiresIn } = await ensurePinAndToken();
    // Attach cookie/localStorage before first navigation.
    await page.addInitScript(({ tok, exp }) => {
      localStorage.setItem('jb_pin_token', tok);
      localStorage.setItem('jb_pin_exp', String(Date.now() + exp * 1000));
    }, { tok: token, exp: expiresIn });
    await use(page);
  },
});
exports.expect = base.expect;
