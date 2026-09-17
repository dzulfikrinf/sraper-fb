#!/usr/bin/env node
// CLI entrypoint: parse arg, panggil runner, tulis JSON+CSV.

const fs = require('fs');
const path = require('path');
const { run } = require('./runner');
const { exportJson, exportCsv } = require('./exporter');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    if (!m) continue;
    let val = m[2];
    if (val === '' || val == null) val = true;
    out[m[1]] = val;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);

  const opts = {
    brand: typeof args.brand === 'string' ? args.brand : undefined,
    days: args.days != null && args.days !== true ? parseInt(args.days, 10) : undefined,
    max: args.max != null && args.max !== true ? parseInt(args.max, 10) : undefined,
    location: typeof args.location === 'string' ? args.location : null,
    headless: args.headless === true || args.headless === 'true',
  };

  console.log('[index] scrape-fb');
  console.log('[index] opts:', JSON.stringify(opts));

  const { records, summary } = await run(opts);

  // Output
  const outDir = path.resolve(__dirname, '..', typeof args.out === 'string' ? args.out : 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const stampedJson = path.join(outDir, `marketplace_${(opts.brand || 'yamaha').toLowerCase()}_${ts}.json`);
  const stampedCsv = path.join(outDir, `marketplace_${(opts.brand || 'yamaha').toLowerCase()}_${ts}.csv`);
  const latestJson = path.join(outDir, 'marketplace_yamaha_last_month.json');
  const latestCsv = path.join(outDir, 'marketplace_yamaha_last_month.csv');

  const payload = { ...summary, data: records };

  await exportJson(stampedJson, payload);
  await exportJson(latestJson, payload);
  await exportCsv(stampedCsv, records);
  await exportCsv(latestCsv, records);

  // Ringkasan di terminal
  console.log('\n[index] ===== RINGKASAN =====');
  console.log(`[index] Total record  : ${summary.total}`);
  console.log(`[index] Dilewati      : ${summary.skipped}`);
  console.log(`[index] Duplikat      : ${summary.duplicates}`);
  if (summary.checkpointDetected) {
    console.log('[index] ⚠ Checkpoint terdeteksi — jalankan dihentikan lebih awal.');
  }
  console.log('[index] Field kosong  :');
  for (const [k, v] of Object.entries(summary.fields_empty)) {
    console.log(`[index]   - ${k.padEnd(10)}: ${v}`);
  }
  console.log('[index] File output  :');
  for (const f of [stampedJson, stampedCsv, latestJson, latestCsv]) {
    console.log(`[index]   - ${f}`);
  }
}

main().catch((err) => {
  console.error('[index] Gagal:', err);
  process.exit(1);
});
