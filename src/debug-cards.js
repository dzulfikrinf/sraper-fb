// debug-cards.js — lihat isi kartu dari halaman search.

const { launchContext, close } = require('./browser');

const URLS = [
  process.argv[2] || 'https://www.facebook.com/marketplace/search/?query=motor+Yamaha&sortBy=creation_time_descending&exact=false',
  // Tambahan URL yang ingin diuji (tidak diproses, hanya argumen pertama)
];

async function main() {
  const ctx = await launchContext({ headless: true });
  const page = await ctx.newPage();

  const url = URLS[0];
  console.log('[debug-cards] Buka:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 2; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500);
  }

  const cards = await page.$$eval('a[href*="/marketplace/item/"]', (els) =>
    els.slice(0, 30).map((a) => ({
      href: a.getAttribute('href'),
      linkText: (a.innerText || '').trim(),
    }))
  );

  let motorCount = 0;
  console.log(`\n[debug-cards] ${cards.length} kartu:\n`);
  for (const c of cards) {
    const text = c.linkText.toLowerCase();
    const hasMotor = /\b(nmax|aerox|mt-?\d|r\d{1,2}|fz|jupiter|vega|sirius|mio|fino|vixion|byson|xsr|wr|scooter|motor)\b/.test(text);
    if (hasMotor) motorCount++;
    console.log(`[${hasMotor ? '✓ MOTOR' : '  --'}]`, c.linkText.replace(/\s+/g, ' ').slice(0, 120));
  }
  console.log(`\n[debug-cards] Motor hits: ${motorCount}/${cards.length}`);

  await close(ctx);
}

main().catch((e) => { console.error(e); process.exit(1); });
