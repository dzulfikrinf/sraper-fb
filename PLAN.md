# Rencana Scraper Facebook Marketplace

> Dokumen hidup: berisi target, struktur data, implementasi aktual, dan hasil pengujian. Diperbarui setelah setiap iterasi.

---

## 1. Target Pengambilan Data

- [x] Facebook Marketplace
- [x] Listing sepeda motor dengan brand Yamaha
- [x] Listing yang dibuat atau diperbarui dalam 1 bulan terakhir
- [x] Filter lokasi (parameter opsional `--location`)
- [x] Pembatasan jumlah data (parameter opsional `--max`)

Rentang tanggal default bersifat relatif terhadap waktu scraping:

```text
start_date = scraped_at - 30 hari
end_date   = scraped_at
```

Listing di luar rentang waktu dideteksi dari pola "Listed X ago" pada halaman detail dan otomatis dikeluarkan (early termination saat sort by newest).

---

## 2. Filter Pencarian Aktual

**Discovered during testing**: FB Marketplace tidak lagi memfilter berdasarkan kategori URL `motorcycles-scooters-electric-bikes/`. Hasil query mengandung banyak produk Yamaha non-motor (gitar, keyboard, drum) akibat algoritma rekomendasi FB.

**Strategi final yang dipakai**:

- Search endpoint: `/marketplace/search/?query=motor+Yamaha&sortBy=creation_time_descending&category_id=546583916084032` (category_id = Vehicles)
- Kata kunci utama: `motor Yamaha` (bukan hanya `Yamaha`) untuk mengeliminasi produk non-motor
- Filter kartu (client-side): reject jika judul mengandung kata Yamaha non-motor (gitar, keyboard, piano, drum, dll)
- Filter detail (client-side): reject jika halaman detail tidak mengandung sinyal motor (model, tahun, atau kata "motor"/"sepeda motor")
- Listing non-motor, duplikat, listing terhapus, dan listing di luar rentang waktu dikeluarkan

---

## 3. Skema Output

Setiap listing menghasilkan satu record:

```json
{
  "title": "Yamaha NMAX 155 2021 Bekas",
  "price": "Rp 20.500.000",
  "priceValue": 20500000,
  "priceCurrency": "IDR",
  "priceAnomaly": false,
  "priceFree": false,
  "url": "https://www.facebook.com/marketplace/item/...",
  "location": "Bandung Kota, Jawa Barat",
  "brand": "Yamaha",
  "model": "NMAX",
  "year": 2021,
  "cc": null,
  "mileage": 12000,
  "sellerType": "unknown"
}
```

Aturan normalisasi:

- `price` (string terformat `"Rp 20.500.000"`) dan `priceValue` (integer untuk analisis engine). `priceAnomaly` = true bila harga di luar rentang plausibel model-year. `priceFree` = true bila `Free`/`Nego`/`DM`/`Rp 0`.
- `year`, `cc`, `mileage`: integer bila dapat dipastikan; selain itu `null`.
- `sellerType`: `individual` | `dealer` | `unknown`; tidak ditebak dari nama penjual.
- `url`: URL listing kanonik FB Marketplace.
- Metadata (`scraped_at`, `search_location`, `date_filter`) disimpan di level root, bukan per-record.

---

## 4. Parser Harga

Format yang dikenali:

- `Rp 20.500.000` → `Rp 20.500.000` (20,5jt)
- `Rp 4,5jt` → `Rp 4.500.000` (4,5jt)
- `Rp 21,5jt` → `Rp 21.500.000` (21,5jt, koma desimal)
- `Rp 45jt`, `Rp 45rb`, `Rp 45K`, `Rp 45M` → dideteksi suffix
- `Rp 45` (ambigu) → kandidat `[4,5jt, 45jt]`, dipilih berdasarkan rentang plausibel model-year
- `Free`, `Nego`, `DM`, `IDR0`, `Rp 0` → `null` + `priceFree: true`
- `Rp 123.456.789`, `Rp 1` (out of range) → `null` + `priceAnomaly: true`

Referensi: `priceRanges` di `src/normalize.js` (rentang plausibel per model-year).

---

## 5. Cara Akses dan Keamanan

- Sesi browser persisten di `.fb-session/` (gitignored) — login sekali via `node src/auth.js`
- Login dan 2FA dilakukan user sendiri di browser; scraper **tidak** menerima/menyimpan password, kode 2FA, cookie mentah, atau token
- Akun FB dedicated (bukan akun utama) direkomendasikan untuk mitigasi risiko suspend
- Scraper auto-detect checkpoint/CAPTCHA dan berhenti untuk intervensi manual
- Hormati ToS FB. Jangan scrape di luar akun atau konteks penggunaan wajar

---

## 6. Arsitektur Implementasi

```
scrape-fb/
├── PLAN.md                 # dokumen ini
├── findings.md             # hasil pengujian & rekomendasi
├── README.md               # cara pakai singkat
├── debug-cards.js          # util debug kartu search
├── debug.js                # util debug halaman detail
├── .gitignore              # .fb-session/, output/, node_modules/
├── package.json
├── src/
│   ├── index.js            # entrypoint CLI
│   ├── auth.js             # login & save session (auto-detect)
│   ├── browser.js          # Playwright Chromium + persistent context
│   ├── config.js           # brand, daysBack, max, paths, daftar model
│   ├── search.js           # marketplace search + scroll + URL collect + filter
│   ├── listing.js          # parse detail (10 kolom + anomali)
│   ├── normalize.js        # price parser, year/cc/mileage/model, priceRanges
│   ├── dedupe.js           # dedup by canonical URL
│   ├── exporter.js         # JSON + CSV writer (12 kolom)
│   └── runner.js           # orkestrasi + checkpoint guard + early termination
└── output/
    ├── marketplace_yamaha_last_month.json   # latest (overwrite)
    ├── marketplace_yamaha_last_month.csv    # latest (overwrite)
    └── marketplace_yamaha_<timestamp>.{json,csv}  # snapshot per run
```

---

## 7. Alur Eksekusi

```
auth.js          → login 1× (user manual di browser, auto-detect `c_user` cookie)
       ↓
index.js         → orchestrator
       ↓
search.js        → buka marketplace, filter brand, scroll & collect URL
       ↓
listing.js       → untuk setiap URL, buka detail, parse 10 kolom
       ↓                  ↳ parsePrice(text, {model, year}) untuk resolver anomali
normalize.js     →      ↳ lookup rentang plausibel per model-year
dedupe.js        → dedup by canonical URL
exporter.js      → tulis JSON + CSV + summary
       ↓
output/*.json    → data siap untuk engine downstream
```

---

## 8. CLI

```bash
# Setup (sekali)
npm install
node src/auth.js                        # login FB di browser (manual)

# Scrape
node src/index.js                       # default: Yamaha, 30 hari, sampai habis
node src/index.js --max=30              # terbatas 30 listing
node src/index.js --headless=true       # tanpa window browser
node src/index.js --location="Jakarta"  # filter kota
node src/index.js --days=60 --max=200   # rentang + limit kustom
node src/index.js --brand="Honda"       # brand lain (eksperimental)

# Util debug
node src/debug.js "<url>"               # dump isi 1 halaman detail
node src/debug-cards.js "<url-search>"  # dump isi kartu search
```

| Flag | Default | Keterangan |
|---|---|---|
| `--brand` | `Yamaha` | Brand target |
| `--days` | `30` | Rentang hari ke belakang |
| `--max` | _(tanpa batas)_ | Maksimum listing per run |
| `--location` | _(kosong)_ | Filter kota (jika FB mendukung) |
| `--headless` | `false` | Browser tanpa window (untuk server) |
| `--out` | `output/` | Direktori output |

---

## 9. Hasil Pengujian Aktual

### 9.1 Coverage Field (15 listing, 2026-09-17)

| Field | Terisi | Kosong | Catatan |
|---|---|---|---|
| title | 15/15 | 0 | 100% — judul selalu terbaca |
| url | 15/15 | 0 | 100% — canonical URL otomatis |
| location | 15/15 | 0 | 100% — pola "Listed X ago in <Kota>" |
| year | 15/15 | 0 | 100% — dari judul atau fallback agregat |
| price valid | 9/15 | 6 (anomali) | 60% valid + 40% anomali ter-flag |
| price free | 0/15 | — | 0% (rentang ini tanpa listing "Free") |
| model | 9/15 | 6 | 60% — gagal pada judul generik |
| mileage | 8/15 | 7 | 53% — FB pakai "Driven X miles" |
| cc | 1/15 | 14 | 7% — FB tidak tampilkan kapasitas mesin |
| sellerType | 0/15 | 15 | 0% — FB hapus label individual/dealer |

### 9.2 Throughput

- **Sampling kecil** (`--max=5..30`): 1–2 menit per run
- **Tanpa `--max`**: scroll sampai habis atau auto-stop saat ketemu listing > 30 hari (50–150 listing per sesi, tergantung area)
- **Filter ketat**: dari 50 kandidat URL FB, hanya ~17% lolos filter Yamaha-motor (sisanya rekomendasi gitar/keyboard FB)

### 9.3 Akurasi Parser Harga

Tingkat keberhasilan resolver ambigu: **~70%** untuk teks harga pendek (1–3 digit), bergantung pada kelengkapan `priceRanges` per model-year. Selebihnya di-flag `priceAnomaly: true` untuk review manual.

### 9.4 Limitasi yang Dikonfirmasi dari Data Nyata

- **`cc` 0–12%**: halaman detail FB tidak memuat field kapasitas mesin untuk motor. Hanya muncul bila卖家 eksplisit mencantumkan di judul.
- **`sellerType` 0%**: FB tidak menampilkan label individual/dealer untuk kendaraan; tidak ada penanda di DOM yang bisa di-parse.
- **`model` 60–67%**: judul generik ("Yamaha motor", "2010 Yamaha") tidak punya nama model.
- **Harga FB = ekspektasi seller**, bukan harga transaksi. Gap 10–30% antara asking price dan deal aktual adalah hal umum di marketplace.

---

## 10. Status Pelaksanaan

- [x] Plan ditentukan
- [x] Setup project (folder, package, Playwright + Chromium, .gitignore)
- [x] Bangun scraper (search, listing, normalize, dedupe, exporter, runner)
- [x] Login FB (auto-detect `c_user` cookie) → `.fb-session/`
- [x] Filter rentang tanggal ≤ 30 hari + early termination
- [x] Parser harga dengan resolusi anomali dan validasi rentang
- [x] Output JSON + CSV (12 kolom termasuk priceValue, priceAnomaly, priceFree)
- [x] Ringkasan otomatis per run
- [x] Dokumentasi pengujian (findings.md)

---

## 11. Kriteria Selesai

- [x] Semua record memiliki kolom target `title`, `price`, `priceValue`, `url`, `location`, `brand`, `model`, `year`, `cc`, `mileage`, `sellerType`, `priceAnomaly`, `priceFree`
- [x] Field yang tidak tersedia bernilai `null` (bukan ditebak)
- [x] Record duplikat dan listing di luar periode dikeluarkan
- [x] File JSON dan CSV berhasil dibuat dan dapat dibaca kembali
- [x] Tidak ada password, 2FA, cookie, atau token yang ditulis ke output maupun repository
- [x] Findings ditulis dengan analisis kelayakan, keterbatasan, dan rekomendasi

---

## 12. Catatan Tambahan

- Scraper adalah **layer 1** dari beberapa sumber data. Untuk akurasi engine yang lebih tinggi, layer 2 (GridOto, Carmudi, atau OLX archive) perlu ditambahkan untuk cross-validation.
- Statistical aggregation (median, P25, P75 per model-year) saat ini belum diimplementasikan di scraper; direncanakan sebagai pipeline terpisah yang membaca dari output JSON.
- Lihat `findings.md` untuk analisis kelayakan, plus/minus, kendala, dan rekomendasi penggunaan untuk Market Price Analyst Engine.
