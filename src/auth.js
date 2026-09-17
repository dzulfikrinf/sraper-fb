// auth.js — login Facebook sekali & simpan sesi di .fb-session/.
// Login & 2FA dilakukan user sendiri di browser. Auto-detect: script tutup
// otomatis begitu halaman sudah bukan /login dan /checkpoint.

const readline = require('readline');
const { launchContext, close } = require('./browser');

async function waitForLogin(page, maxWaitMs = 5 * 60 * 1000) {
  const start = Date.now();
  let lastMsg = '';

  while (Date.now() - start < maxWaitMs) {
    const url = page.url();

    // Cookie session muncul ketika login sukses
    const cookies = await page.context().cookies();
    const hasSessionCookie = cookies.some(
      (c) => (c.name === 'c_user' || c.name === 'xs') && c.value && c.value.length > 0
    );

    const looksLoggedIn =
      !/\/(login|checkpoint|recover|confirm|loginidentify|checkpoint|verify)/i.test(url) &&
      hasSessionCookie;

    if (looksLoggedIn) {
      return { url, cookies: cookies.length };
    }

    // Pesan progress (hanya kalau berubah)
    const tag = /checkpoint|verify/i.test(url)
      ? 'menunggu checkpoint / 2FA'
      : 'menunggu login';
    if (tag !== lastMsg) {
      process.stdout.write(`\n[auth] ${tag} …`);
      lastMsg = tag;
    }
    process.stdout.write('.');

    await new Promise((r) => setTimeout(r, 2000));
  }

  return null;
}

async function main() {
  console.log('[auth] Membuka browser dengan profile di .fb-session/ ...');
  console.log('[auth] (Folder ini dibuat otomatis oleh Playwright.)\n');

  const ctx = await launchContext({ headless: false });
  const page = await ctx.newPage();

  console.log('[auth] Navigasi ke halaman login Facebook ...');
  try {
    await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.warn('[auth] Gagal memuat halaman login:', e.message);
    console.log('[auth] Silakan navigasi manual ke facebook.com/login');
  }

  console.log('\n=========================================');
  console.log('  INSTRUKSI');
  console.log('  1. Login di browser (email/no HP + password).');
  console.log('  2. Selesaikan 2FA / checkpoint jika diminta.');
  console.log('  3. Script akan menutup sendiri setelah terdeteksi masuk beranda.');
  console.log('=========================================\n');

  process.stdout.write('[auth] Menunggu login');
  const result = await waitForLogin(page);

  if (result) {
    console.log(`\n\n[auth] ✅ Login terdeteksi. URL: ${result.url}`);
    console.log(`[auth] Cookies tersimpan: ${result.cookies} item.`);
    console.log('[auth] Sesi sudah ada di .fb-session/. Anda bisa jalankan:');
    console.log('[auth]   node src/index.js --max=5');
  } else {
    console.log('\n\n[auth] ⏱ Timeout 5 menit — login belum terdeteksi.');
    console.log('[auth] Coba ulangi. Jalankan lagi: node src/auth.js');
  }

  await close(ctx);
}

main().catch((err) => {
  console.error('[auth] Gagal:', err?.message || err);
  process.exit(1);
});
