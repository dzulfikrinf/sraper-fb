// Orkestrasi: search → loop URL → parseListing → dedupe → summary.

const { launchContext, close } = require('./browser');
const { openMarketplace, collectListingUrls, filterUrlsByCardText, isLikelyMotorcycle } = require('./search');
const { parseListing } = require('./listing');
const { dedupe } = require('./dedupe');
const { exportJson, exportCsv } = require('./exporter');
const config = require('./config');

async function run(opts = {}) {
  const brand = opts.brand || config.brand;
  const daysBack = Number.isFinite(opts.days) ? opts.days : config.daysBack;
  const max = Number.isFinite(opts.max) ? opts.max : config.maxListings;
  const location = opts.location || null;
  const headless = opts.headless ?? false;

  const ctx = await launchContext({ headless });
  const page = await ctx.newPage();
  const records = [];
  const skipped = [];
  let outsideDateRange = 0;
  let checkpointDetected = false;
  let tooOld = false;

  try {
    await openMarketplace(page, { brand, location });

    // Kumpulkan URL lebih dari `max` karena banyak yang akan difilter client-side.
    const collectMax = max ? Math.min(Math.max(max * 5, 50), 500) : 500;
    const urls = await collectListingUrls(page, { max: collectMax });
    console.log(`\n[runner] Kandidat URL dari search: ${urls.length}`);

    // Filter awal berdasarkan teks kartu (supaya hemat kunjungan ke detail)
    const { filtered, rejected } = await filterUrlsByCardText(page, urls);
    console.log(`[runner] Filter teks kartu: ${filtered.length} lolos, ${rejected.length} ditolak (bukan motor/Yamaha)`);

    const targets = max ? filtered.slice(0, max) : filtered;
    console.log(`[runner] Akan scrape: ${targets.length} listing\n`);

    for (let i = 0; i < targets.length; i++) {
      const url = targets[i];
      console.log(`[runner] (${i + 1}/${targets.length}) ${url}`);

      if (await isCheckpoint(page)) {
        console.error('[runner] Checkpoint terdeteksi. Berhenti untuk menghindari banned.');
        checkpointDetected = true;
        break;
      }

      try {
        const r = await parseListing(page, url);
        if (!r.title) {
          skipped.push(url);
          console.log(`[runner]   → dilewati (tidak dapat mengekstrak data).`);
        } else if (r._listingAgeDays != null && r._listingAgeDays > daysBack) {
          // Sudah di luar rentang waktu → stop scraping seluruhnya (sort by newest)
          skipped.push(url);
          console.log(`[runner]   ⊘ di luar rentang (${r._listingAgeDays} hari > ${daysBack})`);
          outsideDateRange++;
          console.log(`[runner] Listing lebih lama dari ${daysBack} hari ditemukan → berhenti scrape.`);
          tooOld = true;
          break;
        } else {
          // Hapus field internal sebelum simpan
          delete r._listingAgeDays;
          records.push(r);
          const ageTag = r._listingAgeDays != null ? ` · ${r._listingAgeDays}hari` : '';
          console.log(`[runner]   ✓ "${r.title}"${ageTag}`);
        }
      } catch (e) {
        console.warn(`[runner] Skip ${url}: ${e.message}`);
        skipped.push(url);
      }
      await page.waitForTimeout(config.timing.betweenListingsMs);
    }
  } finally {
    await close(ctx);
  }

  // Dedup
  const { records: deduped, dropped } = dedupe(records);

  // Ringkasan
  const summary = {
    scraped_at: new Date().toISOString(),
    target: { brand, daysBack, location, max },
    total: deduped.length,
    skipped: skipped.length,
    outside_date_range: outsideDateRange,
    duplicates: dropped,
    checkpointDetected,
    fields_empty: countEmpty(deduped),
    date_filter: {
      start: new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString(),
      end: new Date().toISOString(),
    },
    skipped_urls: skipped,
  };

  return { records: deduped, summary };
}

async function isCheckpoint(page) {
  const url = page.url();
  return /\/login|checkpoint|verify|recaptcha|captcha|contactpoint/i.test(url);
}

function countEmpty(records) {
  const out = {};
  for (const c of ['title', 'price', 'location', 'model', 'year', 'cc', 'mileage', 'sellerType']) {
    out[c] = records.filter((r) => r[c] == null || r[c] === '').length;
  }
  out.priceAnomaly = records.filter((r) => r.priceAnomaly).length;
  out.priceFree = records.filter((r) => r.priceFree).length;
  return out;
}

module.exports = { run };
