# Panduan Deploy AZRIL CLAS ke Vercel

Proyek **AZRIL CLAS** telah dikonfigurasi agar siap dipublikasikan langsung ke **Vercel** (Frontend Vite React + PWA di `dist/` dan Backend Express Serverless di `api/index.ts`).

## 1. Persiapan Repository
1. Unduh atau *push* seluruh source code proyek ini ke repository **GitHub**, **GitLab**, atau **Bitbucket** Anda.
2. Pastikan file `vercel.json`, `api/index.ts`, dan `package.json` (`engines.node: "22.x"`) ikut ter-*commit*.

## 2. Deploy via Dashboard Vercel (Direkomendasikan)
1. Buka [vercel.com/new](https://vercel.com/new) dan masuk dengan akun Anda.
2. Pilih repository proyek **AZRIL CLAS** lalu klik **Import**.
3. Pengaturan build akan terdeteksi otomatis dari `vercel.json`:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Buka bagian **Environment Variables** sebelum klik Deploy, lalu tambahkan variabel berikut:
   - `SESSION_SECRET` *(wajib)*: String acak panjang (contoh 32+ karakter) agar token sesi tetap konsisten di semua *serverless instance*.
   - `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD` *(sangat disarankan di Vercel)*: Menjamin akun Admin utama selalu tersedia otomatis saat container `/tmp` mengalami *cold start* / restart.
   - `GEMINI_API_KEY` *(opsional)*: Kunci API Gemini untuk mengaktifkan Analisis Tugas AI (Human-in-the-Loop).
   - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` *(untuk database permanen)*: Dari proyek **Supabase baru** yang sudah menjalankan migrasi `supabase/migrations/0001_azril_clas_schema.sql`.
5. Klik **Deploy** dan tunggu proses build selesai.

## 3. Deploy via Vercel CLI (Alternatif dari Terminal Lokal)
```bash
npm install
npx vercel
# Tambahkan env vars (SESSION_SECRET, ADMIN_BOOTSTRAP_*, dll.), lalu publikasikan ke produksi:
npx vercel --prod
```

## 4. Catatan Penting Mode Serverless
- Pada runtime Vercel Serverless, SQLite lokal berada di `/tmp/azril_clas_data` yang bersifat sementara (*ephemeral*) saat *cold start*. Dengan mengisi `ADMIN_BOOTSTRAP_USERNAME`, `ADMIN_BOOTSTRAP_EMAIL`, dan `ADMIN_BOOTSTRAP_PASSWORD`, akun Admin akan disinkronkan otomatis setiap kali instance menyala. Untuk penyimpanan data mahasiswa, absensi, tugas, dan file secara permanen di produksi, selalu isi variabel lingkungan **Supabase baru** Anda di Vercel Dashboard.
- Jika `ADMIN_BOOTSTRAP_PASSWORD` tidak diisi pada deployment baru, buka tab **Portal Admin** saat pertama kali mengakses aplikasi untuk membuat akun Admin melalui formulir aktivasi awal.
