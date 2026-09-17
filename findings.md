# Findings: Facebook Marketplace Scraper untuk Motor Yamaha Bekas

> **Tanggal**: 2026-09-17. **Wilayah**: Bandung dan sekitarnya. **Sampel**: 5 run uji (~70 listing, `--max` 5–30). **Output**: `output/marketplace_yamaha_last_month.*`.

---

## 1. Ringkasan

FB Marketplace layak dipakai sebagai **salah satu layer** untuk Market Price Analyst Engine, tetapi **tidak cukup sebagai sumber tunggal**. Data mentah memerlukan parser, validasi rentang, dan agregasi statistik sebelum dipakai untuk model harga.

**Didukung**: trend harga month-over-month, distribusi P25–P75 per model-year, demand signal (frekuensi listing), outlier detection.

**Tidak didukung**: harga transaksi final (FB = ekspektasi seller), klasifikasi individual/dealer, spesifikasi teknis/cc.

---

## 2. Pengukuran Efektivitas

### 2.1 Coverage Field

Run terakhir (15 listing, 17 September 2026):

| Field | Coverage | Mekanisme |
|---|---|---|
| title, url, location, year | 100% | Selector dan regex langsung |
| price valid | 60% | Parser + konteks model-year |
| price anomali | 40% | Out-of-range atau seller menginput harga tak lengkap |
| model | 60% | Lookup terhadap `knownYamahaModels` |
| mileage | 53% | Pattern "Driven X miles" / "X km" |
| cc | 7% | Pattern "NN cc" — FB tidak tampilkan untuk motor |
| sellerType | 0% | FB tidak menyediakan label untuk kategori ini |

### 2.2 Throughput

| Mode | Listing | Durasi |
|---|---|---|
| `--max=5` | 5 | ~30 detik |
| `--max=15` | 9–15 | ~1 menit |
| `--max=30` | 25–30 | ~2 menit |
| Tanpa `--max` | 50–150 | 5–10 menit |

Filter kartu menolak ~83% kandidat URL (produk Yamaha non-motor dari rekomendasi FB: gitar, keyboard, drum). Hanya ~17% lolos ke antrian scrape detail.

### 2.3 Akurasi Parser Harga

| Input | Output | Status |
|---|---|---|
| `Rp 20.500.000` | `Rp 20.500.000` | Valid |
| `Rp 4,5jt`, `Rp 21,5jt` | `Rp 4.500.000`, `Rp 21.500.000` | Valid (decimal resolved) |
| `Rp 45` + Vega 2009 | `Rp 4.500.000` | Resolved (4,5jt cocok untuk rentang) |
| `Rp 45` + NMAX 2021 | `null` + anomaly | Tidak ada kandidat dalam rentang |
| `Free`, `Nego`, `DM`, `IDR0` | `null` + `priceFree: true` | Drop |
| `Rp 123.456.789` | `null` + anomaly | Out of range |

Tingkat keberhasilan resolver ambigu: **~70%** untuk harga pendek (1–3 digit tanpa suffix).

---

## 3. Keunggulan

- **Biaya nol**, real-time, volume tinggi di area urban (>100 listing motor/hari di Bandung)
- **Coverage model lawas** (RX-King, Vega, Scorpio, F1ZR) yang tidak tersedia di platform dealer resmi
- **Persistent browser session** memungkinkan reuse login; **headless mode** untuk deployment server; **auto-detect checkpoint** mengurangi risiko suspend
- **Early termination** saat listing di luar rentang menghemat waktu; **parser berbasis text-content** lebih toleran terhadap perubahan DOM FB dibanding selector CSS

---

## 4. Keterbatasan

### 4.1 Kualitas Data
- **Harga FB = ekspektasi seller**, bukan harga transaksi. Gap tipikal 10–30%
- **Placeholder pricing**: `Rp 123`, `Rp 123.456.789`, `Rp 1` harus di-drop (anti-spam)
- **Incomplete asking price oleh seller**: pola `Rp 45`, `Rp 27` adalah kebiasaan seller informal yang hanya menulis angka depan (mis. `45` untuk `45jt`). Harga final hanya dapat dikonfirmasi via kontak langsung. Parser me-resolve menggunakan konteks model-year, namun hasilnya adalah **estimasi**, bukan harga absolut
- **"Free"/"Nego"/"DM"**: menurunkan sample size efektif

### 4.2 Field Tidak Tersedia
- **cc**: FB tidak tampilkan di halaman detail motor
- **sellerType**: label individual/dealer dihapus untuk kategori kendaraan
- **Trim/variant**: tidak ada struktur pembeda (mis. "Connected" vs "Standard")
- **Kondisi fisik**: grading generik "Used – like new" / "New", bukan penilaian terstruktur

### 4.3 Bias Dataset
- **Geographic bias**: lokasi mengikuti akun FB; multi-kota perlu multiple runs dengan `--location`
- **Recency bias**: FB sort by newest; listing lama (kemungkinan overpriced) terpinggirkan
- **Selection bias**: dealer resmi underrepresented; seller informal mendominasi

### 4.4 Effort Pemeliharaan
- `priceRanges` dan `knownYamahaModels` di-hard-code, perlu update berkala
- DOM FB dapat berubah; parser regex-based lebih toleran namun tetap perlu monitoring

---

## 5. Kendala Operasional

- **Akun dedicated wajib.** Akun FB memakai sinyal trust per-akun—aktivitas scraping pada akun yang sehari-hari dipakai untuk browsing normal akan mempercepat degradation trust dan memperbesar kemungkinan checkpoint/suspend. Solusi: buat akun burner terpisah khusus scraper, jangan kaitkan dengan identitas bisnis atau kontak pribadi. Jalankan `node src/auth.js` di akun burner untuk setup session.

- **Login 2FA tidak bisa diotomasi.** Scraper tidak memiliki handler OTP, sedangkan FB makin sering meminta verifikasi 2FA (khususnya setelah login dari device/IP baru). Setelah auth.js berhasil, session `.fb-session/` mencakup cookie yang valid; session ini dipakai ulang hingga cookie expire atau di-revoke FB (umumnya ±1–4 minggu tergantung aktivitas).

- **Checkpoint / CAPTCHA dapat muncul sewaktu-waktu.** Pemicu umumnya: scroll panjang >10 halaman, volume tinggi per sesi, atau deteksi pola akses non-manusia. Scraper sudah auto-detect URL mengandung `/checkpoint`, `/verify`, atau `/captcha` dan exit dengan rapi. Setelah verifikasi manual, run dapat dilanjutkan dari awal.

- **Tidak ada API resmi; ToS FB melarang scraping otomatis.** Semua akses data melalui parsing DOM sehingga setiap perubahan markup FB berpotensi mengganggu parser. Risiko hukum: ToS violation ringan sampai moderat; risiko teknis: medium. Mitigasi: throttle volume (jangan lebih dari 1–2 run per hari per akun), gunakan dedicated account, tidak mem-publish ulang data mentah.

- **Headless di Linux memerlukan display libraries.** Paket yang umumnya dibutuhkan pada Ubuntu/Debian: `libgbm1`, `libnss3`, `libasound2`, `libxshmfence1`, `libatk-bridge2.0-0`. Tanpa paket ini, Chromium akan gagal launch dan exit dengan error. Windows biasanya tidak perlu setup tambahan karena DirectX sudah terintegrasi.

- **Session `.fb-session/` dapat expire tanpa notifikasi.** FB secara berkala me-revoke session yang jarang dipakai atau terdeteksi anomali. Gejala: scrape tiba-tiba redirect ke `/login` meskipun session tampak aktif. Solusi: jadwalkan `auth.js` ulang berkala (mis. mingguan) dan monitor `c_user` cookie dalam script untuk deteksi dini.

---

## 6. Rekomendasi untuk Engine

### 6.1 Kesesuaian Use Case

| Use Case | Kesesuaian |
|---|---|
| Trend harga month-over-month | Tinggi |
| Range P25–P75 per model-year | Tinggi |
| Demand signal (frekuensi listing) | Tinggi |
| Outlier detection | Tinggi |
| Geographic pricing | Sedang |
| Estimasi harga per individu motor | Rendah |
| Tipe penjual | Tidak didukung |
| Market share estimasi | Tidak didukung |

### 6.2 Pipeline

```
[Layer 1: FB Marketplace] → [Layer 2: GridOto/Carmudi] 
                                    ↓
[Layer 4: Statistical Agg.] ← [Layer 3: Data Cleaning]
            ↓
[Market Price Analyst Engine]
```

- **Layer 3**: drop `priceFree=true`, drop `priceAnomaly=true`, range check, dedup
- **Layer 4**: median, P25, P75 per `(model, year, location)`; delta month-over-month

### 6.3 Setup Minimum

1. Jalankan scraper berkala: `node src/index.js --max=300` di awal bulan
2. Drop record anomali dari kalkulasi median
3. Tampilkan **range P25–P75**, bukan harga tunggal
4. Disclaimer pada laporan: "harga FB = ekspektasi seller, gap 10–30% dari transaksi"

---

## 7. Snapshot Run Sampel

```
Run 17-Sep-2026 (15 listing):
  Total         : 15
  Year          : 15/15 (100%)
  Price valid   : 9/15  (60%)
  Price anomaly : 6/15  (40%, flagged)
  Model         : 9/15  (60%)
  Mileage       : 8/15  (53%)
  CC            : 1/15  (7%)
  sellerType    : 0/15  (0%)
```

---

## 8. Penilaian Akhir

| Aspek | Penilaian |
|---|---|
| Kelayakan data | Layak dengan prasyarat (7/10 kolom ≥ 50%) |
| Effort implementasi | Selesai |
| Effort pemeliharaan | Medium |
| Risiko hukum | Medium (ToS FB; akun dedicated mitigasi parsial) |
| Value untuk engine | Tinggi untuk trend, terbatas untuk harga absolut |

**Rekomendasi**: Gunakan sebagai layer utama untuk trend dan demand signal. Cross-validate dengan GridOto/Carmudi sebelum dipakai sebagai angka harga absolut di laporan direksi.
