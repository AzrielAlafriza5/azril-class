import { Router } from 'express';
import {
  clearSessionCookie,
  createSession,
  extractTokenFromRequest,
  getUserById,
  hasAnyAdmin,
  hashPassword,
  logAdminActivity,
  requireAuth,
  revokeSession,
  setSessionCookie,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db, isSupabaseConfigured, newId, withTransaction } from '../db/database.ts';
import { isGeminiConfigured } from '../services/aiService.ts';
import { awardDailyLoginAndStreak } from '../services/xpService.ts';

export const authRouter = Router();

authRouter.get('/status', (_req, res) => {
  const settings = db.prepare(`SELECT institution_name, active_academic_year, active_semester FROM academic_settings WHERE id = 1`).get() as
    | { institution_name: string; active_academic_year: string; active_semester: string }
    | undefined;
  res.json({
    hasAdmin: hasAnyAdmin(),
    envBootstrapConfigured: Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()),
    supabaseConfigured: isSupabaseConfigured(),
    geminiConfigured: isGeminiConfigured(),
    institutionName: settings?.institution_name ?? 'AZRIL CLAS Academic',
    activeAcademicYear: settings?.active_academic_year ?? '2026/2027',
    activeSemester: settings?.active_semester ?? 'Ganjil',
  });
});

authRouter.post('/admin/bootstrap', (req, res) => {
  if (hasAnyAdmin() || process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()) {
    res.status(409).json({ error: 'Akun Admin awal sudah diklaim atau dikunci oleh konfigurasi server.' });
    return;
  }

  const { username, email, fullName, password } = req.body as {
    username?: string;
    email?: string;
    fullName?: string;
    password?: string;
  };

  const cleanUsername = (username ?? '').trim().toLowerCase();
  const cleanEmail = (email ?? '').trim().toLowerCase() || null;
  const cleanName = (fullName ?? '').trim();
  const rawPass = password ?? '';

  if (cleanUsername.length < 3 || !/^[a-z0-9._-]+$/.test(cleanUsername)) {
    res.status(400).json({ error: 'Username minimal 3 karakter (huruf kecil, angka, titik, garis bawah).' });
    return;
  }
  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Nama lengkap Admin wajib diisi.' });
    return;
  }
  if (rawPass.length < 6) {
    res.status(400).json({ error: 'Password minimal 6 karakter.' });
    return;
  }

  try {
    const adminId = withTransaction(() => {
      if (hasAnyAdmin()) {
        throw new Error('ALREADY_CLAIMED');
      }
      const id = newId();
      db.prepare(
        `INSERT INTO user_profiles (id, username, email, password_hash, full_name, role, is_active, last_login_at)
         VALUES (?, ?, ?, ?, ?, 'ADMIN', 1, ?)`
      ).run(id, cleanUsername, cleanEmail, hashPassword(rawPass), cleanName, new Date().toISOString());
      logAdminActivity(id, 'ADMIN_BOOTSTRAP', 'user_profiles', id, { username: cleanUsername });
      return id;
    });

    const { token, expiresAtUtc } = createSession(adminId, 'ADMIN');
    setSessionCookie(res, token, expiresAtUtc);
    const user = getUserById(adminId);
    res.status(201).json({ token, expiresAtUtc, user });
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_CLAIMED') {
      res.status(409).json({ error: 'Akun Admin sudah dibuat.' });
      return;
    }
    res.status(500).json({ error: 'Gagal membuat akun Admin awal.' });
  }
});

authRouter.post('/admin/login', (req, res) => {
  const { identifier, password } = req.body as { identifier?: string; password?: string };
  const cleanId = (identifier ?? '').trim().toLowerCase();
  const rawPass = password ?? '';

  if (!cleanId || !rawPass) {
    res.status(400).json({ error: 'Username/email dan password wajib diisi.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT id, password_hash, role, is_active
       FROM user_profiles
       WHERE (lower(username) = ? OR lower(email) = ?)
       LIMIT 1`
    )
    .get(cleanId, cleanId) as
    | { id: string; password_hash: string; role: string; is_active: number }
    | undefined;

  if (!row || row.role !== 'ADMIN' || !verifyPassword(rawPass, row.password_hash)) {
    res.status(401).json({ error: 'Kredensial Admin tidak valid.' });
    return;
  }

  if (Number(row.is_active) !== 1) {
    res.status(403).json({ error: 'Akun Admin sedang dinonaktifkan.' });
    return;
  }

  db.prepare(`UPDATE user_profiles SET last_login_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  const { token, expiresAtUtc } = createSession(row.id, 'ADMIN');
  setSessionCookie(res, token, expiresAtUtc);
  const user = getUserById(row.id);
  res.json({ token, expiresAtUtc, user });
});

authRouter.post('/student/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const cleanUsername = (username ?? '').trim().toLowerCase();
  const rawPass = password ?? '';

  if (!cleanUsername || !rawPass) {
    res.status(400).json({ error: 'Username dan password wajib diisi.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT u.id, u.password_hash, u.role, u.is_active, s.id AS student_id
       FROM user_profiles u
       LEFT JOIN students s ON s.user_id = u.id
       WHERE lower(u.username) = ?
       LIMIT 1`
    )
    .get(cleanUsername) as
    | { id: string; password_hash: string; role: string; is_active: number; student_id: string | null }
    | undefined;

  if (!row || row.role !== 'MAHASISWA' || !row.student_id || !verifyPassword(rawPass, row.password_hash)) {
    res.status(401).json({ error: 'Username atau password mahasiswa salah.' });
    return;
  }

  if (Number(row.is_active) !== 1) {
    res.status(403).json({ error: 'Akun Anda dinonaktifkan oleh Admin. Hubungi Admin kelas.' });
    return;
  }

  const loginReward = withTransaction(() => {
    db.prepare(`UPDATE user_profiles SET last_login_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
    return awardDailyLoginAndStreak(row.student_id!, row.id);
  });

  const { token, expiresAtUtc } = createSession(row.id, 'MAHASISWA');
  setSessionCookie(res, token, expiresAtUtc);
  const user = getUserById(row.id);
  res.json({ token, expiresAtUtc, user, loginReward });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.authUser });
});

authRouter.post('/logout', (req, res) => {
  const token = extractTokenFromRequest(req);
  if (token) {
    revokeSession(token);
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});
