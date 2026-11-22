# AZRIL CLAS — New Supabase Database Documentation

## Overview
Database PostgreSQL baru yang dibuat dari nol untuk **AZRIL CLAS Web Application**. Tidak terhubung dan tidak bermigrasi dari database Android lama.

## Provisioning Langkah Demi Langkah
1. Buat project Supabase baru di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** dan jalankan file `supabase/migrations/0001_azril_clas_schema.sql`.
3. Isi variabel lingkungan berikut pada server (Settings -> Secrets / `.env`):
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (khusus backend Express, jangan pernah dikirim ke browser)
4. Buat akun Admin pertama melalui layar aktivasi Admin awal pada `/admin/login` atau konfigurasi `ADMIN_BOOTSTRAP_USERNAME` & `ADMIN_BOOTSTRAP_PASSWORD`.

## Storage Buckets (Privat)
- `assignment-attachments`: Lampiran soal tugas dari Admin (maksimal 2 lampiran per tugas).
- `assignment-submissions`: File jawaban tugas mahasiswa (diisolasi per folder `student_id`).
- `other-academic-files`: Materi dan arsip akademik pendukung.

## Aturan Keamanan
- **Row Level Security (RLS)** aktif di seluruh 25 tabel.
- **Role-Based Access Control**: `ADMIN` memiliki akses penuh yang diaudit pada `admin_activity_logs`; `MAHASISWA` hanya dapat membaca/mengirim data miliknya sendiri serta jadwal/tugas yang ditargetkan ke kelas/prodi-nya.
- **Idempotensi XP**: Tabel `xp_transactions` memiliki constraint `UNIQUE (idempotency_key)` dan trigger `trg_xp_transactions_sync` untuk mencegah pemberian XP ganda.
