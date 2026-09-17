// Buka Marketplace (search endpoint), set query brand, sort terbaru, scroll & collect URL.

const config = require('./config');

function buildMarketplaceUrl({ brand, querySuffix = 'motor', location, categoryId }) {
  const u = new URL(config.marketplace.baseUrl);
  // FB Marketplace search butuh kata "motor" supaya hasil yang muncul adalah kendaraan,
  // bukan produk Yamaha lain (gitar, keyboard, dll.).
  const query = querySuffix ? `${querySuffix} ${brand}` : brand;
  u.searchParams.set('query', query);
  u.searchParams.set('sortBy', config.marketplace.sortBy);
  u.searchParams.set('exact', String(config.marketplace.exact));
  if (categoryId) u.searchParams.set('category_id', categoryId);
  if (location) u.searchParams.set('location', String(location));
  return u.toString();
}

async function openMarketplace(page, { brand = config.brand, querySuffix = 'motor', location, categoryId } = {}) {
  // Default: filter ke kategori Vehicles supaya hasilnya relevan.
  const url = buildMarketplaceUrl({
    brand,
    querySuffix,
    location,
    categoryId: categoryId || config.marketplace.vehiclesCategoryId,
  });
  console.log(`[search] Buka: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(config.timing.navDelayMs);

  const cur = page.url();
  if (/login|checkpoint|verify/i.test(cur)) {
    throw new Error(`Dialihkan ke halaman login/checkpoint: ${cur}. Jalankan "node src/auth.js" dulu.`);
  }
}

async function collectListingUrls(page, { max = null } = {}) {
  const sel = 'a[href*="/marketplace/item/"]';
  const seen = new Set();

  await collectFromPage(page, sel, seen);
  console.log(`[search] Awal: ${seen.size} listing termuat`);

  let noNewCount = 0;
  for (let i = 0; i < config.scroll.maxScrolls; i++) {
    if (max && seen.size >= max) break;

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(config.scroll.pauseMs);

    const before = seen.size;
    await collectFromPage(page, sel, seen);
    const added = seen.size - before;

    console.log(`[search] Scroll #${i + 1}: +${added} baru (total ${seen.size})`);

    if (added === 0) {
      noNewCount++;
      if (noNewCount >= config.scroll.noNewLimit) {
        console.log('[search] 3× scroll tanpa listing baru → berhenti.');
        break;
      }
    } else {
      noNewCount = 0;
    }
  }

  const list = Array.from(seen);
  return max ? list.slice(0, max) : list;
}

async function collectFromPage(page, sel, seen) {
  const links = await page.$$eval(sel, (els) =>
    els.map((a) => a.getAttribute('href') || a.href)
  );
  for (const href of links) {
    const key = canonical(href);
    if (key) seen.add(key);
  }
}

function canonical(href) {
  try {
    const u = new URL(href, 'https://www.facebook.com');
    const p = u.pathname.replace(/\/$/, '');
    return `https://www.facebook.com${p}`;
  } catch {
    return null;
  }
}

// Filter URL berdasarkan judul kartu (teks) yang mengandung kata motor+Yamaha.
// Mengurangi kunjungan ke detail page FB untuk listing yang jelas-jelas bukan motor.
async function filterUrlsByCardText(page, urls) {
  // Ambil map: url → teks kartu terpendek (gabungan span di sekitar link)
  const cards = await page.$$eval('a[href*="/marketplace/item/"]', (els) =>
    els.map((a) => {
      const href = a.getAttribute('href') || a.href;
      // Ambil teks dalam hirarki ancestor yang wajar
      let parent = a;
      for (let i = 0; i < 4 && parent.parentElement; i++) parent = parent.parentElement;
      return { href, text: (parent.innerText || '').toLowerCase() };
    })
  );

  const map = new Map();
  for (const c of cards) {
    const k = canonical(c.href);
    if (k && !map.has(k)) map.set(k, c.text);
  }

  const filtered = [];
  const rejected = [];
  for (const u of urls) {
    const text = map.get(u) || '';
    if (isLikelyMotorcycle(text)) filtered.push(u);
    else rejected.push(u);
  }
  return { filtered, rejected };
}

function isLikelyMotorcycle(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  if (!/\byamaha\b/.test(t)) return false;            // Harus Yamaha
  if (config.rejectKeywords.some((k) => t.includes(k))) return false; // Bukan produk Yamaha lain
  return config.motorKeywords.some((k) => t.includes(k)); // Wajib ada sinyal motor
}

module.exports = { openMarketplace, collectListingUrls, buildMarketplaceUrl, filterUrlsByCardText, isLikelyMotorcycle };
