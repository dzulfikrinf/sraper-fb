// Buka detail listing dan ambil 10 kolom target.
// Catatan: FB Marketplace pakai layout multi-pane (sidebar Notifications + konten listing).
// Kita ambil elemen-elemen dengan teliti supaya tidak salah pilih.

const { extractYear, extractModel, parsePrice, formatPriceIDR, getPlausibleRange } = require('./normalize');
const config = require('./config');

// Selector h1 — ambil h1 yang BUKAN dari sidebar Notifications.
async function pickListingTitle(page) {
  return page.evaluate(() => {
    const allH1 = Array.from(document.querySelectorAll('h1'));
    // Buang h1 yang teksnya generik (sidebar, header FB)
    const generic = /^(notifications|home|marketplace|menu)$/i;
    const candidates = allH1
      .map((h) => (h.innerText || h.textContent || '').trim())
      .filter((t) => t && !generic.test(t));
    // Pilih yang terpanjang (judul listing biasanya paling panjang)
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0] || null;
  });
}

// Selector untuk label+value pair (untuk facts section)
async function readLabelValuePairs(page) {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('span, div'));
    const result = {};
    for (const el of all) {
      // Hanya proses leaf span (text pendek)
      const t = (el.innerText || '').trim();
      if (!t || t.length > 80 || el.children.length > 0) continue;
      // Deteksi pola "Label\nValue"
      if (el.nextElementSibling) {
        const next = el.nextElementSibling;
        const nt = (next.innerText || '').trim();
        if (nt && nt !== t && nt.length < 80 && next.children.length === 0) {
          result[t] = nt;
        }
      }
    }
    return result;
  });
}

async function parseListing(page, url) {
  const empty = () => ({
    title: null, price: null, url, location: null,
    brand: config.brand, model: null,
    year: null, cc: null, mileage: null, sellerType: 'unknown',
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  } catch (e) {
    console.warn(`[listing] Gagal navigasi: ${url} — ${e.message}`);
    return empty();
  }

  try { await page.waitForSelector('h1, [role="main"]', { timeout: 12000 }); } catch {}
  await page.waitForTimeout(1000); // render settle

  // Verifikasi: harus di halaman detail marketplace
  const finalUrl = page.url();
  if (!/marketplace\/item\//.test(finalUrl)) {
    console.warn(`[listing] Redirect bukan ke detail: ${finalUrl}`);
    return empty();
  }

  let allText = '';
  try {
    allText = (await page.evaluate(() => document.body?.innerText || '')).trim();
  } catch {}
  if (!allText) return empty();

  // FB Marketplace: teks halaman berisi listing detail + sidebar rekomendasi
  // (mis. "Today's picks", "Related searches") yang dapat mengganggu filter.
  // Potong teks sebelum rekomendasi agar filter只看 konten listing.
  allText = stripRecommendations(allText);

  // Title
  const title = (await pickListingTitle(page)) || null;

  // Price — pakai parser baru dengan konteks (model + year) untuk handle ambiguitas
  // Cocokkan ekspresi harga yang lebih lengkap: bisa mengandung suffix jt/rb/K/M
  const priceMatch = allText.match(/(?:Rp\.?|IDR)\s*[\d.,]+\s*(?:jt|rb|ribu|juta|K|M)?/i);
  const rawPriceText = priceMatch ? priceMatch[0].trim() : null;

  // Location — coba beberapa pola:
  //   "Listed X ago in <Location>" (tapi tolak kalau <Location> kelihatan seperti tahun)
  //   "Location is approximate" → lokasi tepat di baris sebelumnya
  //   "Lokasi: ..." atau "Location: ..."
  let location = null;
  const m1 = allText.match(/Listed\s+[^.\n]*?\s+in\s+([^\n]+?)(?:\s*Location\s+is\s+approximate|$)/i);
  if (m1 && !looksLikeYear(m1[1])) {
    location = m1[1].trim();
  } else {
    const m2 = allText.match(/([^\n]+?)\s*Location\s+is\s+approximate/i);
    if (m2 && !looksLikeYear(m2[1])) location = m2[1].trim();
    else {
      const m3 = allText.match(/(?:Lokasi|Location)\s*[:\-]\s*([^\n]+)/i);
      if (m3) location = m3[1].trim();
    }
  }
  if (location) {
    location = location.replace(/\s*Location\s+is\s+approximate.*$/i, '').trim();
    // Bersihkan trailing "·" / "•" / bullet & spasi tak terlihat
    location = location.replace(/\s*[·•]\s*$/u, '').trim();
    if (looksLikeYear(location)) location = null;
  }

  // Facts section — pakai label/value extraction
  const pairs = await readLabelValuePairs(page);

  // Year: coba (1) label, (2) "Tahun/Year ... 2022", (3) judul "2010 Yamaha mio",
  // (4) "Listed X ago in 2022" (tahun posting)
  let year = null;
  for (const k of Object.keys(pairs)) {
    if (/^(tahun|year)$/i.test(k)) {
      const y = extractYear(pairs[k]);
      if (y) { year = y; break; }
    }
  }
  if (year == null) {
    const m = allText.match(/\b(?:Tahun|Year)\b\s*[:\-]?\s*((?:19|20)\d{2})/i);
    if (m) year = parseInt(m[1], 10);
  }
  if (year == null && title) {
    const m = title.match(/\b((?:19|20)\d{2})\b/); // tahun di mana saja di judul
    if (m) year = parseInt(m[1], 10);
  }
  if (year == null) {
    const m = allText.match(/Listed\s+[^.\n]*?\s+in\s+((?:19|20)\d{2})/i);
    if (m) year = parseInt(m[1], 10);
  }

  // CC: (1) label, (2) "Kapasitas mesin: 155 cc" / "Engine displacement: 155cc",
  // (3) judul/teks "NNN CC" / "NNN+CC" / "NNN CC".
  let cc = null;
  for (const k of Object.keys(pairs)) {
    if (/^(kapasitas\s*mesin|engine\s*displacement|displacement|engine\s*size)$/i.test(k)) {
      const m = String(pairs[k]).match(/(\d{2,4})/);
      if (m) { cc = parseInt(m[1], 10); break; }
    }
  }
  if (cc == null) {
    const m = allText.match(/\b(?:Kapasitas\s*Mesin|Engine\s*Displacement|Displacement)\b\s*[:\-]?\s*(\d{2,4})\s*cc/i);
    if (m) cc = parseInt(m[1], 10);
  }
  if (cc == null) {
    // Pola umum "155 cc" / "155+CC" — tapi hanya kalau di dekat "cc" (bukan substring acak)
    const m = allText.match(/\b(\d{2,4})\s*[+\s]*cc\b/i);
    if (m) cc = parseInt(m[1], 10);
  }

  // Mileage: FB pakai "Driven X miles" (Inggris) atau "Jarak Tempuh / Kilometer".
  // Konversi miles → km saat disimpan (rounded).
  let mileageRaw = null;
  let mileageUnit = 'km';

  for (const k of Object.keys(pairs)) {
    if (/^(jarak\s*tempuh|mileage|odometer)$/i.test(k)) {
      const m = String(pairs[k]).match(/(\d{1,3}(?:[.,]\d{3})+|\d+)/);
      if (m) { mileageRaw = parseInt(m[1].replace(/[.,]/g, ''), 10); break; }
    }
  }
  if (mileageRaw == null) {
    // "Driven 123,486 miles" (page Inggris)
    const m = allText.match(/\bDriven\s+([\d.,]+)\s*(miles?|mi)\b/i);
    if (m) { mileageRaw = parseInt(m[1].replace(/[.,]/g, ''), 10); mileageUnit = 'miles'; }
  }
  if (mileageRaw == null) {
    // "Jarak tempuh: 12.345 km" / "Mileage: 12,000 km"
    const m = allText.match(/\b(?:Jarak\s*Tempuh|Mileage|Odometer)\b\s*[:\-]?\s*([\d.,]+)\s*(km|miles?)\b/i);
    if (m) {
      mileageRaw = parseInt(m[1].replace(/[.,]/g, ''), 10);
      mileageUnit = m[2].toLowerCase().startsWith('m') ? 'miles' : 'km';
    }
  }
  if (mileageRaw == null) {
    // Format singkat "12K miles" / "123K km" (kartu)
    const m = allText.match(/\b(\d+(?:\.\d+)?)\s*([Kk])\s*(?:miles?|mi|km)\b/i);
    if (m) {
      const num = parseFloat(m[1]);
      const mult = String(m[2]).toLowerCase() === 'k' ? 1000 : 1;
      mileageRaw = Math.round(num * mult);
      mileageUnit = /mi/.test(m[0]) ? 'miles' : 'km';
    }
  }
  if (mileageRaw == null) {
    const m = allText.match(/\b(\d{1,3}(?:[.,]\d{3})+|\d+)\s*km\b/i);
    if (m) {
      const n = parseInt(m[1].replace(/[.,]/g, ''), 10);
      if (n >= 100) mileageRaw = n;
    }
  }

  // Normalisasi ke km (sesuai plan) — bulatkan ke integer.
  let mileage = null;
  if (mileageRaw != null) {
    if (mileageUnit === 'miles') mileage = Math.round(mileageRaw * 1.609344);
    else mileage = mileageRaw;
  }

  // Brand & model
  const model = extractModel(title || allText);

  // Parse harga dengan konteks (model + year) — perlu model/year sudah diekstrak
  const parsedPrice = parsePrice(rawPriceText, { model, year });
  // Log anomaly untuk listing yang tidak bisa ditentukan harganya
  if (rawPriceText && (parsedPrice.isFree || parsedPrice.ambiguous || !parsedPrice.isPlausible)) {
    console.log(`[listing]   ⚠ harga anomali "${rawPriceText}" → ${parsedPrice.valueFormatted || 'null'} (kandidat: ${parsedPrice.candidates.join(', ')}, range: ${getPlausibleRange(model, year).join('-')})`);
  }

  // Seller type — dari section "Seller information"
  let sellerType = 'unknown';
  const sellerSection = allText.match(/Seller\s*information\s*([\s\S]{0,500})/i);
  if (sellerSection) {
    const block = sellerSection[1];
    if (/Business\s*account|Halaman\s*bisnis|Dealer\s*account/i.test(block)) sellerType = 'dealer';
    else if (/Personal\s*account|Akun\s*pribadi/i.test(block)) sellerType = 'individual';
  }
  if (sellerType === 'unknown') {
    // Fallback: cari "Tipe penjual"
    const m = allText.match(/(?:Tipe\s*penjual|Type\s*of\s*seller)\s*[:\-]?\s*([^\n]+)/i);
    if (m) {
      const v = m[1].toLowerCase();
      if (/dealer|business|resmi/i.test(v)) sellerType = 'dealer';
      else if (/individual|pribadi|personal|perorangan/i.test(v)) sellerType = 'individual';
    }
  }

  // Validasi akhir: judul harus mengandung Yamaha ATAU model dikenal
  if (!looksLikeYamahaListing(title, allText)) {
    console.log(`[listing] Skip non-Yamaha: ${url} (title="${title}")`);
    return empty();
  }

  // Parse tanggal posting ("Listed X ago") untuk filter rentang waktu
  const listingAgeDays = parseListingAgeDays(allText);

  return {
    title,
    price: parsedPrice.valueFormatted,    // string "Rp 20.500.000"
    priceValue: parsedPrice.value,        // integer untuk analisis engine
    priceCurrency: parsedPrice.currency,  // "IDR"
    priceAnomaly: parsedPrice.ambiguous || !parsedPrice.isPlausible,
    priceFree: parsedPrice.isFree,
    url,
    location,
    brand: config.brand,
    model,
    year,
    cc,
    mileage,
    sellerType,
    _listingAgeDays: listingAgeDays, // dipakai runner.js untuk filter
  };
}

function looksLikeYamahaListing(title, allText) {
  const hay = `${title || ''}\n${allText || ''}`.toLowerCase();
  if (!/\byamaha\b/.test(hay)) return false;
  // Tolak listing Yamaha non-motor (gitar, keyboard, dll.) — whole-word match supaya
  // substring di URL-encoded text tidak ikut menolak.
  if (matchesAnyWord(hay, config.rejectKeywords)) return false;
  return matchesAnyWord(hay, config.motorKeywords);
}

// Parse "Listed X minutes/hours/days/weeks/months ago" → usia dalam hari.
// Return null jika tidak terbaca (artinya tidak bisa memastikan → tetap inklusif).
function parseListingAgeDays(text) {
  if (!text) return null;
  // Pola: "Listed 4 weeks ago", "Listed 3 days ago", "Listed 1 hour ago", "Listed 39 minutes ago"
  // Hindari match "Rancaekek · Within 65 km" — kita cari "Listed"
  const m = text.match(/\bListed\s+(\d+)\s+(minute|hour|day|week|month)s?\s+ago\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  if (unit === 'minute' || unit === 'hour') return 0;
  if (unit === 'day') return n;
  if (unit === 'week') return n * 7;
  if (unit === 'month') return n * 30;
  return null;
}

// Helper: cek apakah salah satu kata/frasa ada di teks (whole-word, case-insensitive)
function matchesAnyWord(text, words) {
  for (const w of words) {
    const escaped = String(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, 'i');
    if (re.test(text)) return true;
  }
  return false;
}

// Apakah string ini terlihat seperti tahun (1900-2099) atau angka polos saja?
function looksLikeYear(s) {
  if (!s) return false;
  const t = String(s).trim();
  return /^(19|20)\d{2}$/.test(t);
}

// Buang bagian "Related searches / Today's picks" dari teks halaman supaya tidak
// memicu false-positive pada filter (FB menyisipkan rekomendasi produk Yamaha lain).
function stripRecommendations(text) {
  if (!text) return '';
  const markers = [
    'Related searches',
    'Today\'s picks',
    'Todays picks',
    'Similar listings',
    'You might also like',
    'Sponsored',
    'People also viewed',
  ];
  let cut = text.length;
  for (const m of markers) {
    const idx = text.indexOf(m);
    if (idx !== -1 && idx < cut) cut = idx;
  }
  return text.slice(0, cut).trim();
}

module.exports = { parseListing, looksLikeYamahaListing };
