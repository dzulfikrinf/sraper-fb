// Ekspor ke JSON & CSV.

const fs = require('fs');

// 10 kolom inti sesuai PLAN.md, ditambah priceValue (integer untuk engine)
// dan priceAnomaly (flag untuk review harga anomali).
const COLUMNS = [
  'title', 'price', 'priceValue', 'url', 'location',
  'brand', 'model', 'year', 'cc', 'mileage', 'sellerType',
  'priceAnomaly',
];

function csvCell(v) {
  if (v == null) return '';
  const s = String(v).replace(/\r?\n/g, ' ');
  if (/[",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  const head = COLUMNS.join(',');
  const body = rows
    .map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))
    .join('\n');
  return head + '\n' + body + '\n';
}

async function exportJson(filePath, payload) {
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

async function exportCsv(filePath, records) {
  await fs.promises.writeFile(filePath, toCsv(records), 'utf8');
}

module.exports = { exportJson, exportCsv, COLUMNS, toCsv };
