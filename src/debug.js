// debug.js — buka satu URL listing & dump apa yang sebenarnya ada di halaman.
// Simpan screenshot + teks halaman ke folder debug/.

const fs = require('fs');
const path = require('path');
const { launchContext, close } = require('./browser');

const URL = process.argv[2] || 'https://www.facebook.com/marketplace/item/1118900331081078';
const DEBUG_DIR = path.resolve(__dirname, '..', 'debug');

async function main() {
  fs.mkdirSync(DEBUG_DIR, { recursive: true });
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();

  console.log(`[debug] Buka: ${URL}`);
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.error('[debug] Gagal:', e.message);
    process.exit(1);
  }
  await page.waitForTimeout(4000); // beri waktu render

  const finalUrl = page.url();
  console.log(`[debug] URL akhir: ${finalUrl}`);

  // Capture
  const meta = {
    finalUrl,
    pageTitle: await page.title(),
    h1Texts: await page.$$eval('h1', (els) => els.map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 10)),
    h2Texts: await page.$$eval('h2', (els) => els.map((e) => (e.innerText || '').trim()).filter(Boolean).slice(0, 10)),
  };

  const text = (await page.evaluate(() => document.body?.innerText || '')).trim();
  const html = await page.content();

  fs.writeFileSync(path.join(DEBUG_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
  fs.writeFileSync(path.join(DEBUG_DIR, 'text.txt'), text);
  fs.writeFileSync(path.join(DEBUG_DIR, 'page.html'), html);

  try {
    await page.screenshot({ path: path.join(DEBUG_DIR, 'screenshot.png'), fullPage: true });
  } catch {}

  console.log('\n[debug] Page title:', meta.pageTitle);
  console.log('[debug] h1 (first 10):');
  for (const t of meta.h1Texts) console.log('  -', t);
  console.log('[debug] h2 (first 10):');
  for (const t of meta.h2Texts) console.log('  -', t);
  console.log('\n[debug] Body text (first 1500 chars):');
  console.log(text.slice(0, 1500));
  console.log('\n[debug] Saved: debug/meta.json, debug/text.txt, debug/page.html, debug/screenshot.png');

  await close(ctx);
}

main().catch((e) => { console.error(e); process.exit(1); });
