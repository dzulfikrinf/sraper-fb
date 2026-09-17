// Konfigurasi pusat: brand, rentang waktu, path, anti-bot timing.
// Override via flag CLI di index.js.

const path = require('path');

const config = {
  // Default sesuai PLAN.md
  brand: 'Yamaha',
  daysBack: 30,
  maxListings: null, // null = sampai hasil kategori pada rentang habis/aman
  location: null,    // null = tidak membatasi lokasi
  headless: false,   // false = non-headless agar bisa lihat proses & selesaikan checkpoint

  outputDir: path.resolve(__dirname, '..', 'output'),
  sessionDir: path.resolve(__dirname, '..', '.fb-session'),

  marketplace: {
    // Marketplace FB sekarang pakai /marketplace/search/ sebagai endpoint utama.
    // Sub-kategori "motorcycles" sudah dihapus dari taxonomy; tersisa hanya "vehicles".
    // Kita pakai category_id Vehicles (546583916084032) sebagai filter.
    baseUrl: 'https://www.facebook.com/marketplace/search/',
    vehiclesCategoryId: '546583916084032',
    sortBy: 'creation_time_descending',
    exact: false,
  },

  // Filter client-side: hanya simpan listing yang judulnya terlihat seperti motor Yamaha.
  // Catatan: "yamaha" SENGAJA TIDAK masuk sini — kalau ada, semua produk Yamaha (gitar,
  // keyboard, dll.) lolos. Wajib mengandung minimal satu kata kunci motor di bawah.
  motorKeywords: [
    'motor', 'motorcycle', 'motorbike', 'sepeda motor',
    'nmax', 'aerox', 'mt-15', 'mt-25', 'mt-03', 'mt-07', 'mt-09', 'mt 15', 'mt 25',
    'r15', 'r25', 'r3', 'yzf', 'fz', 'fz150', 'fz25', 'xsr',
    'jupiter', 'vega', 'sirius', 'mio', 'fino', 'grand filano',
    'free go', 'freego', 'vixion', 'byson', 'tracer', 'tenere', 'wr 155', 'crypto', 'x-ray',
  ],

  // Kata yang bila muncul di judul/card → langsung TOLAK (bukan motor)
  rejectKeywords: [
    'gitar', 'guitar', 'keyboard', 'piano', 'drum', 'pianika',
    'speaker', 'amplifier', 'amp', 'mixer', 'microphone',
    'iphone', 'samsung', 'hp ', 'handphone', 'iphone 1', 'iphone1',
    'laptop', 'tablet', 'tv ', 'tv-',
  ],

  scroll: {
    pauseMs: 1500,
    maxScrolls: 60,
    noNewLimit: 3, // berhenti setelah 3× scroll tanpa listing baru
  },

  timing: {
    navDelayMs: 1200,
    betweenListingsMs: 2000,
  },

  // Daftar model Yamaha umum (untuk normalisasi "model" dari judul/deskripsi)
  knownYamahaModels: [
    // Generasi baru
    'NMAX', 'AEROX', 'AEROX 155',
    'MT-15', 'MT-25', 'MT-03', 'MT-07', 'MT-09', 'MT-10',
    'R15', 'R25', 'R3', 'YZF', 'YZF-R15', 'YZF-R25',
    'FZ', 'FZ150', 'FZ25', 'FZi',
    'XSR', 'XSR 155',
    'TENERE', 'TRACER', 'TRACER 900',
    'WR 155', 'WR155',
    // Skuter & commuter
    'JUPITER', 'JUPITER MX', 'JUPITER Z',
    'VEGA', 'VEGA R',
    'SIRIUS', 'MIO', 'MIO M3', 'MIO Z', 'MIO SOUL',
    'FINO', 'GRAND FILANO', 'FREE GO', 'FREEGO',
    'X-RIDE', 'XRIDE', 'XEON', 'Xeon GT',
    // Sport klasik / klasik
    'VIXION', 'BYSON',
    'RX-KING', 'RX KING', 'RX-SPECIAL', 'RX SPECIAL',
    'SCORPIO', 'SCORPIO Z',
    'F1ZR', 'F1Z-R', 'FZR', 'FZ 150',
    'CRYPTO', 'X-RAY', 'XRAY',
    'ALFA', 'KAZE', 'FORCE 1',
    'VIKSEN', 'VIKSEN S',
  ],
};

module.exports = config;
