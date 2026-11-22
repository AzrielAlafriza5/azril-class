import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { db, newId } from './db/database.ts';
import type { AuthUser, UserRole } from '../shared/types.ts';

export const SESSION_COOKIE_NAME = 'azril_clas_session';
// Persistent Admin session (365 days, renewed automatically on activity until explicit logout)
export const ADMIN_SESSION_MAX_MS = 365 * 24 * 60 * 60 * 1000;
export const STUDENT_SESSION_MAX_MS = 8 * 60 * 60 * 1000;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hexDigest] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hexDigest, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

function hashToken(rawToken: string): string {
  const configuredSecret = process.env.SESSION_SECRET?.trim();
  if (configuredSecret) {
    return crypto.createHmac('sha256', configuredSecret).update(rawToken).digest('hex');
  }
  // Deterministic SHA-256 for 256-bit CSPRNG opaque tokens when SESSION_SECRET is unset
  // so Admin sessions survive server restarts without requiring re-login.
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export function createSession(userId: string, role: UserRole): { token: string; expiresAtUtc: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const ttlMs = role === 'ADMIN' ? ADMIN_SESSION_MAX_MS : STUDENT_SESSION_MAX_MS;
  const expiresAtUtc = new Date(Date.now() + ttlMs).toISOString();

  db.prepare(
    `INSERT INTO user_sessions (id, user_id, token_hash, expires_at_utc)
     VALUES (?, ?, ?, ?)`
  ).run(newId(), userId, tokenHash, expiresAtUtc);

  return { token: rawToken, expiresAtUtc };
}

export function revokeSession(rawToken: string): void {
  const tokenHash = hashToken(rawToken);
  db.prepare(`UPDATE user_sessions SET revoked_at_utc = ? WHERE token_hash = ?`).run(
    new Date().toISOString(),
    tokenHash
  );
}

function isHttpsRequest(req?: Request): boolean {
  if (!req) return true;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (proto === 'https') return true;
  const origin = String(req.headers.origin ?? req.headers.referer ?? '');
  if (origin.startsWith('https://')) return true;
  return false;
}

export function setSessionCookie(res: Response, token: string, expiresAtUtc: string, req?: Request): void {
  const expires = new Date(expiresAtUtc);
  const maxAge = Math.max(0, expires.getTime() - Date.now());
  const https = isHttpsRequest(req);
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? { partitioned: true } : {}),
    expires,
    maxAge,
    path: '/',
  });
}

export function extendAdminSessionIfNeeded(rawToken: string): string {
  const tokenHash = hashToken(rawToken);
  const nextExpiresUtc = new Date(Date.now() + ADMIN_SESSION_MAX_MS).toISOString();
  db.prepare(
    `UPDATE user_sessions SET expires_at_utc = ? WHERE token_hash = ? AND revoked_at_utc IS NULL`
  ).run(nextExpiresUtc, tokenHash);
  return nextExpiresUtc;
}

export function clearSessionCookie(res: Response, req?: Request): void {
  const https = isHttpsRequest(req);
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: https,
    sameSite: https ? 'none' : 'lax',
    ...(https ? { partitioned: true } : {}),
    path: '/',
  });
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  return null;
}

export function getUserById(userId: string): AuthUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.username, u.email, u.full_name, u.role, u.is_active,
              s.id AS student_id, s.nim, s.study_program_id, sp.code AS sp_code, sp.name AS sp_name,
              s.class_id, c.name AS class_name, s.cohort_year, s.semester, s.badge,
              s.total_xp, s.current_streak, s.longest_streak
       FROM user_profiles u
       LEFT JOIN students s ON s.user_id = u.id
       LEFT JOIN study_programs sp ON sp.id = s.study_program_id
       LEFT JOIN classes c ON c.id = s.class_id
       WHERE u.id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    id: String(row.id),
    username: String(row.username),
    email: row.email ? String(row.email) : null,
    fullName: String(row.full_name),
    role: row.role as UserRole,
    isActive: Number(row.is_active) === 1,
    ...(row.student_id
      ? {
          studentId: String(row.student_id),
          nim: String(row.nim),
          studyProgramId: String(row.study_program_id),
          studyProgramCode: String(row.sp_code),
          studyProgramName: String(row.sp_name),
          classId: String(row.class_id),
          className: String(row.class_name),
          cohortYear: Number(row.cohort_year),
          semester: Number(row.semester),
          badge: row.badge as AuthUser['badge'],
          totalXp: Number(row.total_xp),
          currentStreak: Number(row.current_streak),
          longestStreak: Number(row.longest_streak),
        }
      : {}),
  };
}

export function authenticateToken(rawToken: string): AuthUser | null {
  const tokenHash = hashToken(rawToken);
  const sess = db
    .prepare(
      `SELECT user_id, expires_at_utc, revoked_at_utc
       FROM user_sessions
       WHERE token_hash = ?`
    )
    .get(tokenHash) as { user_id: string; expires_at_utc: string; revoked_at_utc: string | null } | undefined;

  if (!sess) return null;
  if (sess.revoked_at_utc) return null;
  if (new Date(sess.expires_at_utc).getTime() <= Date.now()) return null;

  const user = getUserById(sess.user_id);
  if (!user || !user.isActive) return null;
  return user;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
  authToken?: string;
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const token = extractTokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk terlebih dahulu.' });
    return;
  }
  const user = authenticateToken(token);
  if (!user) {
    res.status(401).json({ error: 'Sesi berakhir atau akun tidak aktif. Silakan masuk ulang.' });
    return;
  }
  // CSRF check for cookie-based state-changing requests
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !req.headers.authorization) {
    const requestedWith = req.headers['x-requested-with'];
    if (requestedWith !== 'AZRIL-CLAS') {
      res.status(403).json({ error: 'Permintaan tidak valid (header verifikasi hilang).' });
      return;
    }
  }
  req.authUser = user;
  req.authToken = token;
  next();
}

export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.authUser?.role !== 'ADMIN') {
      res.status(403).json({ error: 'Akses ditolak. Khusus role Admin.' });
      return;
    }
    next();
  });
}

export function requireStudent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  requireAuth(req, res, () => {
    if (req.authUser?.role !== 'MAHASISWA' || !req.authUser.studentId) {
      res.status(403).json({ error: 'Akses ditolak. Khusus akun Mahasiswa.' });
      return;
    }
    next();
  });
}

export function logAdminActivity(
  adminUserId: string,
  action: string,
  entityType: string,
  entityId: string = '',
  details: Record<string, unknown> = {}
): void {
  db.prepare(
    `INSERT INTO admin_activity_logs (id, admin_user_id, action, entity_type, entity_id, details_json, created_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(newId(), adminUserId, action, entityType, entityId, JSON.stringify(details), new Date().toISOString());
}

export function hasAnyAdmin(): boolean {
  const row = db.prepare(`SELECT COUNT(*) AS cnt FROM user_profiles WHERE role = 'ADMIN'`).get() as { cnt: number };
  return row.cnt > 0;
}

export function syncEnvBootstrapAdminIfNeeded(): void {
  const envPass = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
  const envUser = (process.env.ADMIN_BOOTSTRAP_USERNAME?.trim() || 'azriel-admin').toLowerCase();
  const envEmail = (process.env.ADMIN_BOOTSTRAP_EMAIL?.trim() || 'azrilalafriza5@gmail.com').toLowerCase();
  if (!envPass) return;

  // Enforce a single canonical ADMIN account: prefer matching by env username/email, else oldest ADMIN
  const matchedByIdentity = db
    .prepare(
      `SELECT id, username, email, password_hash, is_active
       FROM user_profiles
       WHERE role = 'ADMIN' AND (lower(username) = ? OR lower(email) = ?)
       LIMIT 1`
    )
    .get(envUser, envEmail) as
    | { id: string; username: string; email: string | null; password_hash: string; is_active: number }
    | undefined;

  const existing =
    matchedByIdentity ??
    (db
      .prepare(
        `SELECT id, username, email, password_hash, is_active
         FROM user_profiles
         WHERE role = 'ADMIN'
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get() as
      | { id: string; username: string; email: string | null; password_hash: string; is_active: number }
      | undefined);

  let activeAdminId: string;

  if (existing) {
    activeAdminId = existing.id;
    const sameUser = existing.username.toLowerCase() === envUser;
    const sameEmail = (existing.email?.toLowerCase() ?? null) === envEmail;
    const samePass = verifyPassword(envPass, existing.password_hash);
    const sameActive = Number(existing.is_active) === 1;

    if (!sameUser || !sameEmail || !samePass || !sameActive) {
      const hash = samePass ? existing.password_hash : hashPassword(envPass);
      try {
        db.prepare(
          `UPDATE user_profiles
           SET username = ?, email = ?, password_hash = ?, is_active = 1, updated_at = ?
           WHERE id = ?`
        ).run(envUser, envEmail, hash, new Date().toISOString(), existing.id);
      } catch {
        db.prepare(
          `UPDATE user_profiles SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?`
        ).run(hash, new Date().toISOString(), existing.id);
      }
    }
  } else {
    activeAdminId = newId();
    db.prepare(
      `INSERT INTO user_profiles (id, username, email, password_hash, full_name, role, is_active)
       VALUES (?, ?, ?, ?, 'Administrator Utama', 'ADMIN', 1)`
    ).run(activeAdminId, envUser, envEmail, hashPassword(envPass));
  }

  // Deactivate any extra legacy ADMIN accounts so strictly 1 Admin account can log in
  db.prepare(`UPDATE user_profiles SET is_active = 0 WHERE role = 'ADMIN' AND id != ?`).run(activeAdminId);
}
