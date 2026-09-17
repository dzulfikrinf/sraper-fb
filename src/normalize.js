// Parsing & normalisasi field dari teks bebas hasil scrape FB.
// Termasuk parser harga dengan deteksi notasi Indonesia (jt/rb/K/M), resolusi
// ambiguitas "Rp 45" (4,5jt vs 45jt), validasi rentang plausibel per model-year,
// dan formatter "Rp 20.500.000".

const config = require('./config');

// =====================================================================
// PRICE RANGES — rentang plausibel per model-year (IDR)
// =====================================================================
// Sumber: harga pasar motor bekas Yamaha di Indonesia, 2024–2026.
// Tujuan: membantu parser memilih antara "Rp 45" → 4,5jt vs 45jt.
// Range default [_default]['*'] jadi fallback saat model/tahun tidak dikenal.

const priceRanges = {
  // Premium baru
  'NMAX':         { 2018: [13000000, 22000000], 2019: [16000000, 25000000], 2020: [18000000, 27000000], 2021: [20000000, 29000000], 2022: [22000000, 32000000], 2023: [24000000, 33000000] },
  'AEROX':        { 2018: [15000000, 24000000], 2019: [17000000, 26000000], 2020: [19000000, 27000000], 2021: [21000000, 29000000], 2022: [24000000, 33000000], 2023: [26000000, 36000000] },
  'MT-15':        { 2018: [22000000, 30000000], 2019: [24000000, 32000000], 2020: [26000000, 36000000], 2021: [28000000, 38000000], 2022: [30000000, 42000000] },
  'MT-25':        { 2019: [33000000, 43000000], 2020: [36000000, 47000000], 2021: [40000000, 50000000], 2022: [43000000, 55000000] },
  'R15':          { 2017: [18000000, 25000000], 2018: [20000000, 28000000], 2019: [23000000, 32000000], 2020: [26000000, 35000000], 2021: [28000000, 38000000] },
  'R25':          { 2018: [28000000, 38000000], 2019: [30000000, 40000000], 2020: [33000000, 43000000], 2021: [36000000, 47000000] },
  'XSR':          { 2020: [28000000, 36000000], 2021: [30000000, 38000000], 2022: [33000000, 40000000] },
  'XSR 155':      { 2020: [28000000, 36000000], 2021: [30000000, 38000000] },
  'WR 155':       { 2020: [28000000, 36000000], 2021: [30000000, 38000000] },
  'WR155':        { 2020: [28000000, 36000000], 2021: [30000000, 38000000] },
  'FZ':           { 2016: [16000000, 23000000], 2017: [18000000, 25000000], 2018: [20000000, 28000000], 2019: [22000000, 30000000] },
  'FZ25':         { 2018: [22000000, 30000000], 2019: [25000000, 32000000], 2020: [27000000, 35000000] },
  'VIXION':       { 2017: [16000000, 24000000], 2018: [18000000, 26000000], 2019: [20000000, 28000000] },
  'BYSON':        { 2017: [14000000, 20000000], 2018: [16000000, 22000000], 2019: [18000000, 25000] },
  'TENERE':       { 2019: [35000000, 48000000], 2020: [38000000, 52000000] },
  'TRACER':       { 2018: [28000000, 36000000], 2019: [30000000, 38000000] },
  // Skuter modern
  'MIO':          { 2012: [3000000, 6000000], 2015: [5000000, 9000000], 2018: [7000000, 13000000], 2020: [9000000, 15000000] },
  'MIO SOUL':     { 2012: [3000000, 6500000], 2015: [5500000, 9500000], 2018: [8000000, 14000000] },
  'MIO Z':        { 2018: [8000000, 13000000], 2020: [10000000, 16000000] },
  'MIO M3':       { 2018: [8000000, 13000000] },
  'FINO':         { 2015: [6000000, 11000000], 2018: [8000000, 14000000], 2020: [10000000, 16000000] },
  'GRAND FILANO': { 2020: [12000000, 18000000], 2021: [13000000, 20000000], 2022: [14000000, 22000000] },
  'FREE GO':      { 2018: [11000000, 16000000], 2020: [12000000, 18000000] },
  'FREEGO':       { 2018: [11000000, 16000000] },
  'X-RIDE':       { 2015: [7000000, 12000000], 2018: [8000000, 14000000] },
  'XRIDE':        { 2015: [7000000, 12000000] },
  'XEON':         { 2015: [7000000, 12000000] },
  // Sport klasik / bebek lawas
  'JUPITER':      { 2010: [3500000, 7000000], 2013: [5000000, 9000000], 2016: [7000000, 12000000] },
  'JUPITER Z':    { 2012: [4000000, 8000000], 2015: [6000000, 11000000], 2018: [8000000, 14000000] },
  'JUPITER MX':   { 2012: [4000000, 8000000], 2015: [6000000, 11000000] },
  'VEGA':         { 2009: [2500000, 5500000], 2012: [3500000, 7000000], 2014: [4500000, 8500000] },
  'VEGA R':       { 2009: [3000000, 6000000], 2012: [4000000, 8000000] },
  'SIRIUS':       { 2010: [3000000, 6000000], 2013: [4500000, 8500000] },
  'RX-KING':      { 2002: [5000000, 13000000], 2005: [7000000, 16000000], 2008: [10000000, 22000000] },
  'RX KING':      { 2002: [5000000, 13000000], 2005: [7000000, 16000000] },
  'SCORPIO':      { 2005: [5000000, 12000000], 2008: [8000000, 18000000] },
  'F1ZR':         { 2002: [4000000, 10000000], 2005: [5500000, 12000000] },
  'FZR':          { 2002: [4000000, 10000000], 2005: [5500000, 12000000] },
  'CRYPTO':       { 2002: [4000000, 9000000] },
  'X-RAY':        { 2002: [4000000, 9000000] },
  'VIKSEN S':     { 2012: [4000000, 9000000] },
  'VIKSEN':       { 2012: [4000000, 9000000] },
  'ALFA':         { 2002: [3000000, 7000000] },
  'KAZE':         { 2002: [3000000, 7000000] },
  '_default':     { '*': [1500000, 80000000] },
};

function getPlausibleRange(model, year) {
  if (!model || !priceRanges[model]) return priceRanges._default['*'];
  const m = priceRanges[model];
  if (year && m[year]) return m[year];
  // Year tidak diketahui → pakai agregat (min of mins, max of maxes) supaya lebih宽容
  const years = Object.keys(m).map(Number).filter((y) => Number.isFinite(y)).sort((a, b) => a - b);
  if (!years.length) return priceRanges._default['*'];
  if (!year) {
    let lo = Infinity, hi = 0;
    for (const y of years) {
      if (m[y][0] < lo) lo = m[y][0];
      if (m[y][1] > hi) hi = m[y][1];
    }
    return [lo, hi];
  }
  // Year ada tapi tidak exact → cari terdekat
  const closest = years.reduce((acc, y) => (Math.abs(y - year) < Math.abs(acc - year) ? y : acc), years[0]);
  return m[closest];
}

function isPricePlausible(value, model, year) {
  if (value == null || !Number.isFinite(value)) return false;
  const [min, max] = getPlausibleRange(model, year);
  return value >= min && value <= max;
}

// =====================================================================
// PRICE PARSER
// =====================================================================
// Input bisa berupa "Rp 45", "Rp 4.500.000", "IDR45,000", "Rp 4,5jt",
// "Rp 45jt", "Rp 45rb", "Free", "Nego", dst.
// Untuk harga yang ambigu (e.g. "Rp 45"), parser menghasilkan beberapa
// kandidat dan memilih yang paling plausibel berdasarkan range model-year.

function parsePrice(text, ctx = {}) {
  const empty = { value: null, valueFormatted: null, candidates: [], currency: 'IDR', raw: text || null, isFree: false, ambiguous: false, isPlausible: false, confidence: 0 };
  if (!text) return empty;

  const s = String(text).trim();

  // "Free" / "Nego" / "DM" → tidak ada harga
  if (/^(free|nego|hubungi|dm|chat|pm|hub)\.?$/i.test(s.replace(/[^a-z]/gi, ''))) {
    return { ...empty, isFree: true, raw: s };
  }

  // "Rp 0" / "IDR 0" / "Rp -" → anggap "belum set harga" (free)
  if (/^(rp\.?|idr)?\s*[-0]+$/i.test(s.trim())) {
    return { ...empty, isFree: true, raw: s };
  }

  // Strip currency prefix/suffix
  let cleaned = s.replace(/rp\.?|idr|rupiah|\$|usd/gi, '').trim();

  // Deteksi multiplier
  let multiplier = 1;
  if (/(jt|juta)(?![a-z0-9])/i.test(cleaned)) {
    multiplier = 1_000_000;
    cleaned = cleaned.replace(/(jt|juta)(?![a-z0-9])/gi, '');
  } else if (/(rb|ribu)(?![a-z0-9])/i.test(cleaned)) {
    multiplier = 1_000;
    cleaned = cleaned.replace(/(rb|ribu)(?![a-z0-9])/gi, '');
  } else if (/\bK(?![a-z0-9])/i.test(cleaned)) {
    multiplier = 1_000;
    cleaned = cleaned.replace(/\bK(?![a-z0-9])/gi, '');
  } else if (/\bM(?![a-z0-9])/i.test(cleaned)) {
    multiplier = 1_000_000;
    cleaned = cleaned.replace(/\bM(?![a-z0-9])/gi, '');
  }
  cleaned = cleaned.trim();

  // Extract angka
  const numMatch = cleaned.match(/[\d.,]+/);
  if (!numMatch) return { ...empty, raw: s };
  const parsed = normalizeNumericString(numMatch[0]);
  if (!Number.isFinite(parsed) || parsed <= 0) return { ...empty, raw: s };

  const value = parsed * multiplier;

  // Kalau value plausibel langsung → return
  const directlyPlausible = isPricePlausible(value, ctx.model, ctx.year);
  if (directlyPlausible) {
    return {
      value,
      valueFormatted: formatPriceIDR(value),
      candidates: [value],
      currency: 'IDR',
      raw: s,
      isFree: false,
      ambiguous: false,
      isPlausible: true,
      confidence: 1,
    };
  }

  // Kalau tidak plausibel dan tidak ada suffix eksplisit, generate kandidat alternatif
  // Hanya untuk nilai "kecil" (raw < 100.000) yang mungkin terpotong di mobile view.
  if (multiplier === 1 && Number.isInteger(parsed) && parsed < 100_000) {
    // Kandidat: literal, ×1.000 (rb), ×100.000 (jt kecil mis. 4,5jt dari "Rp 45"),
    // ×1.000.000 (jt bulat mis. 45jt dari "Rp 45").
    const candidates = [parsed];
    if (parsed * 1_000 >= 1_000_000) candidates.push(parsed * 1_000);          // rb → minimal 1jt
    if (parsed * 100_000 >= 1_000_000) candidates.push(parsed * 100_000);      // 4,5jt-style (decimal hilang)
    if (parsed * 1_000_000 >= 1_000_000) candidates.push(parsed * 1_000_000);  // jt → minimal 1jt
    // Buang duplikat
    const candUnique = [...new Set(candidates)].filter((c) => c >= 1_000_000 && c <= 100_000_000);

    if (candUnique.length === 0) {
      // Bahkan literal pun di luar range → null
      return {
        value: null,
        valueFormatted: null,
        candidates: candidates,
        currency: 'IDR',
        raw: s,
        isFree: false,
        ambiguous: true,
        isPlausible: false,
        confidence: 0,
      };
    }
    if (candUnique.length === 1) {
      const v = candUnique[0];
      const plausible = isPricePlausible(v, ctx.model, ctx.year);
      return {
        value: plausible ? v : null,
        valueFormatted: plausible ? formatPriceIDR(v) : null,
        candidates: candUnique,
        currency: 'IDR',
        raw: s,
        isFree: false,
        ambiguous: !plausible,
        isPlausible: plausible,
        confidence: plausible ? 0.9 : 0,
      };
    }

    // Multiple kandidat → pilih berdasarkan rentang model-year
    const [rangeMin, rangeMax] = getPlausibleRange(ctx.model, ctx.year);
    const fits = candUnique.filter((c) => c >= rangeMin && c <= rangeMax);

    let chosen = null;
    let confidence = 0;
    if (fits.length === 1) {
      chosen = fits[0];
      confidence = 0.9;
    } else if (fits.length > 1) {
      // Lebih dari satu yang masuk → ambil median, tandai ambiguous
      chosen = fits[Math.floor(fits.length / 2)];
      confidence = 0.5;
    }

    return {
      value: chosen,
      valueFormatted: formatPriceIDR(chosen),
      candidates: candUnique,
      currency: 'IDR',
      raw: s,
      isFree: false,
      ambiguous: fits.length !== 1,
      isPlausible: !!chosen,
      confidence,
    };
  }

  // punya suffix eksplisit tapi tetap di luar range → null (flagged)
  return {
    value: null,
    valueFormatted: null,
    candidates: [value],
    currency: 'IDR',
    raw: s,
    isFree: false,
    ambiguous: false,
    isPlausible: false,
    confidence: 0,
  };
}

function normalizeNumericString(s) {
  // Bisa return float kalau ada desimal eksplisit (mis. "21,5" → 21.5)
  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots > 1 || commas > 1) {
    // Multiple separator = thousand separator
    return parseInt(s.replace(/[.,]/g, ''), 10);
  }
  if (dots === 1 && commas === 0) {
    const parts = s.split('.');
    if (parts[1].length === 3) {
      // "5.000" (Indonesian thousand) → 5000
      return parseInt(s.replace(/\./g, ''), 10);
    }
    // 1-2 digit setelah dot = desimal → kembalikan float
    return parseFloat(s);
  }
  if (commas === 1 && dots === 0) {
    const parts = s.split(',');
    if (parts[1].length === 3) {
      return parseInt(s.replace(/,/g, ''), 10);
    }
    // "21,5" — koma desimal (umum di Indonesia). Ganti ke titik supaya parseFloat bisa.
    return parseFloat(s.replace(',', '.'));
  }
  return parseInt(s.replace(/[.,]/g, ''), 10);
}

// Format integer IDR → "Rp 20.500.000"
function formatPriceIDR(value) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  return 'Rp ' + rounded.toLocaleString('id-ID');
}

// =====================================================================
// OTHER NORMALIZERS
// =====================================================================

function parseIntSafe(text) {
  if (text == null) return null;
  const m = String(text).match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

function extractYear(text) {
  if (!text) return null;
  const m = String(text).match(/\b((?:19|20)\d{2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

function extractCc(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{2,4})\s*cc\b/i);
  return m ? parseInt(m[1], 10) : null;
}

function extractMileageKm(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{1,3}(?:[.,]\d{3})+|\d+)\s*km\b/i);
  if (!m) return null;
  const num = parseInt(m[1].replace(/[.,]/g, ''), 10);
  return Number.isFinite(num) ? num : null;
}

function extractModel(text, known = config.knownYamahaModels) {
  if (!text) return null;
  const t = String(text).toUpperCase();
  const hits = known.filter((m) => t.includes(String(m).toUpperCase()));
  hits.sort((a, b) => String(b).length - String(a).length);
  return hits[0] || null;
}

module.exports = {
  parsePrice,
  formatPriceIDR,
  normalizeNumericString,
  getPlausibleRange,
  isPricePlausible,
  priceRanges,
  parseIntSafe,
  extractYear,
  extractCc,
  extractMileageKm,
  extractModel,
};
