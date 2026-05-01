// Helper that seeds and tears down test data via the public API.
// No auth required — backend uses a hardcoded local user.
const axios = require('axios');

const API = (process.env.PLAYWRIGHT_BASE_URL || process.env.REACT_APP_BACKEND_URL) + '/api';

const TINY_JPEG_BEFORE =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD0r/PnX//Z';
const TINY_JPEG_AFTER = TINY_JPEG_BEFORE; // a different image not needed for E2E correctness

async function seedSmartSlots() {
  // Create a client with an address (auto-geocoded) so suggestions can score.
  const c = await axios.post(API + '/clients', {
    first_name: 'E2E',
    last_name: 'SmartSlots',
    phone: '0600000001',
    address: '5 Place Bellecour, Lyon',
    gender: 'F',
  });
  const client = c.data;
  return { client };
}

async function seedSocialGenerator() {
  const c = await axios.post(API + '/clients', {
    first_name: 'E2E',
    last_name: 'SocialGen',
    phone: '0600000002',
    address: '',
    gender: 'F',
  });
  const client = c.data;
  const photo = await axios.post(`${API}/clients/${client.id}/photos`, {
    before: TINY_JPEG_BEFORE,
    after: TINY_JPEG_AFTER,
    note: 'E2E generated',
    date: new Date().toISOString().slice(0, 10),
  });
  return { client, photo: photo.data };
}

async function cleanupClient(clientId) {
  if (!clientId) return;
  try {
    await axios.delete(API + '/clients/' + clientId);
  } catch (_) { /* ignore */ }
}

module.exports = {
  API,
  seedSmartSlots,
  seedSocialGenerator,
  cleanupClient,
};
