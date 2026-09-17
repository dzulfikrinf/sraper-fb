// Dedup: pakai canonical URL sebagai kunci utama.
// Fallback kombinasi (title, price, location).

function canonicalUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const p = u.pathname.replace(/\/$/, '');
    return `https://www.facebook.com${p}`;
  } catch {
    return null;
  }
}

function fingerprint(r) {
  return [
    String(r.title || '').toLowerCase().trim(),
    String(r.price ?? '').trim(),
    String(r.location || '').toLowerCase().trim(),
  ].join('|');
}

function dedupe(records) {
  const seen = new Set();
  const out = [];
  let dropped = 0;
  for (const r of records) {
    const key = canonicalUrl(r.url) || `fp::${fingerprint(r)}`;
    if (seen.has(key)) { dropped++; continue; }
    seen.add(key);
    out.push(r);
  }
  return { records: out, dropped };
}

module.exports = { dedupe, canonicalUrl, fingerprint };
