import { Router } from 'express';
import {
  CANONICAL_ADMIN_EMAIL,
  CANONICAL_ADMIN_USERNAME,
  clearSessionCookie,
  createSession,
  extendAdminSessionIfNeeded,
  extractTokenFromRequest,
  getUserById,
  hasAnyAdmin,
  hashPassword,
  logAdminActivity,
  pushAdminToSupabaseIfConfigured,
  requireAuth,
  revokeSession,
  setSessionCookie,
  syncAdminFromSupabaseIfNeeded,
  syncEnvBootstrapAdminIfNeeded,
  verifyPassword,
  type AuthenticatedRequest,
} from '../auth.ts';
import { db, isSupabaseConfigured, newId, withTransaction } from '../db/database.ts';
import { isGeminiConfigured } from '../services/aiService.ts';
import { awardDailyLoginAndStreak } from '../services/xpService.ts';

export const authRouter = Router();

authRouter.get('/status', async (_req, res) => {
  if (!hasAnyAdmin()) {
    await syncAdminFromSupabaseIfNeeded();
  }
  const settings = db
    .prepare(`SELECT institution_name, active_academic_year, active_semester FROM academic_settings WHERE id = 1`)
    .get() as
    | { institution_name: string; active_academic_year: string; active_semester: string }
    | undefined;
  const adminUsername = (process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() || CANONICAL_ADMIN_USERNAME).toLowerCase();
  res.json({
    hasAdmin: hasAnyAdmin(),
    envBootstrapConfigured: Boolean(process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()),
    adminUsername,
    supabaseConfigured: isSupabaseConfigured(),
    geminiConfigured: isGeminiConfigured(),
    institutionName: settings?.institution_name ?? 'AZRIL CLAS Academic',
    activeAcademicYear: settings?.active_academic_year ?? '2026/2027',
    activeSemester: settings?.active_semester ?? 'Ganjil',
  });
});

authRouter.post('/admin/bootstrap', (_req, res) => {
  res.status(403).json({
    error: 'Pendaftaran Admin tidak tersedia. Gunakan satu akun Admin yang sudah ditetapkan.',
  });
});

authRouter.post('/admin/activate', async (req, res) => {
  await syncAdminFromSupabaseIfNeeded();
  if (hasAnyAdmin() || process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()) {
    res.status(403).json({
      error: 'Akun Admin sudah aktif.',
    });
    return;
  }

  const { password } = req.body as { password?: string };
  const trimmedPass = String(password ?? '').trim();
  if (trimmedPass.length < 6) {
    res.status(400).json({ error: 'Password Admin minimal 6 karakter.' });
    return;
  }

  try {
    const adminId = withTransaction(() => {
      if (hasAnyAdmin()) {
        throw new Error('ALREADY_ACTIVE');
      }
      const id = newId();
      db.prepare(
        `INSERT INTO user_profiles (id, username, email, password_hash, full_name, role, is_active, last_login_at)
         VALUES (?, ?, ?, ?, 'Administrator Utama', 'ADMIN', 1, ?)`
      ).run(id, CANONICAL_ADMIN_USERNAME, CANONICAL_ADMIN_EMAIL, hashPassword(trimmedPass), new Date().toISOString());
      logAdminActivity(id, 'ADMIN_ACTIVATE', 'user_profiles', id, { username: CANONICAL_ADMIN_USERNAME });
      return id;
    });

    await pushAdminToSupabaseIfConfigured(adminId);
    const { token, expiresAtUtc } = createSession(adminId, 'ADMIN');
    setSessionCookie(res, token, expiresAtUtc, req);
    const user = getUserById(adminId);
    res.status(201).json({ token, expiresAtUtc, user });
  } catch (err) {
    if (err instanceof Error && err.message === 'ALREADY_ACTIVE') {
      res.status(403).json({ error: 'Akun Admin sudah aktif.' });
      return;
    }
    res.status(500).json({ error: 'Gagal menyimpan password Admin.' });
  }
});

authRouter.post('/admin/login', async (req, res) => {
  const { username, identifier, password } = req.body as {
    username?: string;
    identifier?: string;
    password?: string;
  };
  const cleanId = String(username ?? identifier ?? '').trim().toLowerCase();
  const rawPass = String(password ?? '');
  const trimmedPass = rawPass.trim();

  if (!cleanId || !trimmedPass) {
    res.status(400).json({ error: 'Username dan password Admin wajib diisi.' });
    return;
  }

  // Ensure env-configured admin or Supabase-backed admin is synced
  if (process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()) {
    syncEnvBootstrapAdminIfNeeded();
  } else if (!hasAnyAdmin()) {
    await syncAdminFromSupabaseIfNeeded();
  }

  const row = db
    .prepare(
      `SELECT id, password_hash, role, is_active
       FROM user_profiles
       WHERE role = 'ADMIN' AND (lower(username) = ? OR lower(email) = ?)
       LIMIT 1`
    )
    .get(cleanId, cleanId) as
    | { id: string; password_hash: string; role: string; is_active: number }
    | undefined;

  if (!row) {
    if (!hasAnyAdmin() && !process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim()) {
      res.status(401).json({
        error: 'Password Admin belum dibuat untuk server ini. Silakan atur password Admin terlebih dahulu.',
        needsActivation: true,
      });
      return;
    }
    res.status(401).json({ error: 'Username atau password Admin salah.' });
    return;
  }

  const passwordValid =
    verifyPassword(rawPass, row.password_hash) ||
    (trimmedPass !== rawPass && verifyPassword(trimmedPass, row.password_hash));

  if (!passwordValid) {
    res.status(401).json({ error: 'Username atau password Admin salah.' });
    return;
  }

  if (Number(row.is_active) !== 1) {
    res.status(403).json({ error: 'Akun Admin sedang dinonaktifkan.' });
    return;
  }

  db.prepare(`UPDATE user_profiles SET last_login_at = ? WHERE id = ?`).run(new Date().toISOString(), row.id);
  const { token, expiresAtUtc } = createSession(row.id, 'ADMIN');
  setSessionCookie(res, token, expiresAtUtc, req);
  const user = getUserById(row.id);
  res.json({ token, expiresAtUtc, user });
});

authRouter.post('/student/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  const cleanUsername = String(username ?? '').trim().toLowerCase();
  const rawPass = String(password ?? '');
  const trimmedPass = rawPass.trim();

  if (!cleanUsername || !trimmedPass) {
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

  const passwordValid =
    row &&
    (verifyPassword(rawPass, row.password_hash) ||
      (trimmedPass !== rawPass && verifyPassword(trimmedPass, row.password_hash)));

  if (!row || row.role !== 'MAHASISWA' || !row.student_id || !passwordValid) {
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
  setSessionCookie(res, token, expiresAtUtc, req);
  const user = getUserById(row.id);
  res.json({ token, expiresAtUtc, user, loginReward });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  if (req.authUser?.role === 'ADMIN' && req.authToken) {
    const nextExpiresUtc = extendAdminSessionIfNeeded(req.authToken);
    setSessionCookie(res, req.authToken, nextExpiresUtc, req);
  }
  res.json({ user: req.authUser });
});

authRouter.post('/logout', (req, res) => {
  const token = extractTokenFromRequest(req);
  if (token) {
    revokeSession(token);
  }
  clearSessionCookie(res, req);
  res.json({ ok: true });
});
