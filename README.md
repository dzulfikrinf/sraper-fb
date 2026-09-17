# scrape-fb

Scraper **Facebook Marketplace** untuk listing **motor Yamaha** yang dibuat/diperbarui dalam **1 bulan terakhir**. Output: JSON + CSV.

Lihat [`PLAN.md`](./PLAN.md) untuk detail ruang lingkup, filter, dan keamanan.

## 🚀 Cara Pakai (Singkat)

### 1) Install dependency

```bash
npm install
```

> Chromium sudah ter-install otomatis lewat `playwright`. Jika gagal, jalankan `npx playwright install chromium`.

### 2) Login Facebook (sekali)

```bash
node src/auth.js
```

Akan terbuka **browser Chromium** dengan profile persistent di `.fb-session/`. Login + 2FA sendiri di browser, lalu kembali ke terminal dan tekan **Enter** ketika sudah selesai. Session akan tersimpan otomatis.

### 3) Jalankan scraper

```bash
# Default: brand Yamaha, rentang 1 bulan terakhir, sampai hasil habis
node src/index.js

# Tes kecil dulu (5 listing)
node src/index.js --max=5

# Override opsional
node src/index.js --location="Jakarta" --max=200 --days=30
```

Output ada di:

- `output/marketplace_yamaha_last_month.json`
- `output/marketplace_yamaha_last_month.csv`

## 📂 Struktur

```
src/
├─ index.js      # CLI entrypoint
├─ auth.js       # login & save session
├─ browser.js    # Playwright launcher (persistent context)
├─ config.js     # parameter global
├─ search.js     # buka marketplace, filter Yamaha, sort
├─ listing.js    # buka detail, parse 10 kolom
├─ normalize.js  # regex harga/tahun/cc/mileage
├─ dedupe.js     # dedup by URL
├─ exporter.js   # JSON + CSV writer
└─ runner.js     # loop scroll → detail → collect
```

## ⚠️ Keamanan

- **Tidak** menyimpan password/2FA/cookie mentah. Session hidup di profile browser lokal (`.fb-session/`, di-gitignore).
- Hormati ToS Facebook. Hentikan jika muncul checkpoint/verifikasi.
- Idealnya pakai **akun FB kedua** khusus scraping.

## ⚙️ CLI Flags

| Flag | Default | Keterangan |
|---|---|---|
| `--brand` | `Yamaha` | Brand motor |
| `--days` | `30` | Rentang hari ke belakang |
| `--max` | (tanpa batas) | Maksimum listing |
| `--location` | _(kosong)_ | Filter kota/provinsi |
| `--headless` | `false` | Browser non-headless (lihat apa yang terjadi) |
| `--out` | `output/` | Direktori output |
