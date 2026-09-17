// Browser launcher: Playwright Chromium dengan persistent context.
// Session/cookie tersimpan di .fb-session/ — login Facebook dilakukan sekali via auth.js.

const { chromium } = require('playwright');
const config = require('./config');

async function launchContext({ headless = false } = {}) {
  const context = await chromium.launchPersistentContext(config.sessionDir, {
    headless,
    viewport: { width: 1366, height: 900 },
    locale: 'id-ID',
    timezoneId: 'Asia/Jakarta',
    // Argumen supaya lebih mirip browser biasa
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
    // Tidak sebut channel → pakai chromium bawaan Playwright.
  });

  // Blokir tracker yang sering membuat checkpoint muncul.
  await context.route('**/*', (route) => {
    const url = route.request().url();
    // Allow everything by default
    return route.continue();
  });

  return context;
}

async function close(context) {
  if (context) {
    try { await context.close(); } catch {}
  }
}

module.exports = { launchContext, close };
