import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { hashPassword, logAdminActivity, requireAdmin, type AuthenticatedRequest } from '../auth.ts';
import { db, newId, UPLOADS_DIR, withTransaction } from '../db/database.ts';
import { analyzeSubmissionWithGemini, isGeminiConfigured } from '../services/aiService.ts';
import {
  buildFullReportWorkbook,
  parseStudentImportWorkbook,
  toCsvString,
} from '../services/excelService.ts';
import { recalculateStudentAttendanceAndQuotas } from '../services/xpService.ts';
import { formatWibDateTime, getWibDateString } from '../../shared/time.ts';
import type { AttendanceStatus, StudentBadge } from '../../shared/types.ts';

export const adminRouter = Router();
adminRouter.use(requireAdmin);

const memoryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const attachmentStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(UPLOADS_DIR, 'assignment-attachments'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const uploadAttachments = multer({
  storage: attachmentStorage,
  limits: { fileSize: 25 * 1024 * 1024, files: 2 },
});

function createQrPayload(sessionId: string, secret: string): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const nonce = crypto.randomBytes(6).toString('hex');
  const sig = crypto.createHmac('sha256', secret).update(`${sessionId}:${nonce}:${expiresAt}`).digest('hex').slice(0, 16);
  const token = `AZR:${sessionId}:${nonce}:${sig}`;
  return { token, expiresAt };
}

// ---------------------------------------------------------------------------
// 1. DASHBOARD ADMIN
// ---------------------------------------------------------------------------
adminRouter.get('/dashboard', (_req, res) => {
  const settings = db.prepare(`SELECT * FROM academic_settings WHERE id = 1`).get() as Record<string, unknown>;
  const totalStudents = (db.prepare(`SELECT COUNT(*) AS c FROM students`).get() as { c: number }).c;

  const prodiCounts = db
    .prepare(
      `SELECT sp.code, COUNT(s.id) AS count
       FROM study_programs sp
       LEFT JOIN students s ON s.study_program_id = sp.id
       GROUP BY sp.id, sp.code`
    )
    .all() as { code: string; count: number }[];
  const byProdi: Record<string, number> = {};
  for (const r of prodiCounts) byProdi[r.code] = r.count;

  const activeAssignments = (db.prepare(`SELECT COUNT(*) AS c FROM assignments WHERE is_active = 1`).get() as { c: number }).c;
  const pendingSubmissions = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM assignment_submissions sub
         LEFT JOIN grades g ON g.submission_id = sub.id
         WHERE g.id IS NULL`
      )
      .get() as { c: number }
  ).c;
  const openSessions = (
    db.prepare(`SELECT COUNT(*) AS c FROM attendance_sessions WHERE status = 'OPEN'`).get() as { c: number }
  ).c;

  const top3 = db
    .prepare(
      `SELECT s.id, s.nim, s.full_name, s.total_xp, s.current_streak, sp.code AS prodi_code, c.name AS class_name
       FROM students s
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       WHERE s.badge != 'AFK'
       ORDER BY s.total_xp DESC, s.current_streak DESC, s.full_name ASC
       LIMIT 3`
    )
    .all();

  const assignmentStats = db
    .prepare(
      `SELECT a.id, a.title,
         (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS submitted,
         (SELECT COUNT(*) FROM grades g WHERE g.assignment_id = a.id) AS graded
       FROM assignments a
       WHERE a.is_active = 1
       ORDER BY a.created_at DESC
       LIMIT 6`
    )
    .all();

  const attendanceBreakdown = db
    .prepare(
      `SELECT status, COUNT(*) AS count
       FROM attendance_records
       GROUP BY status`
    )
    .all();

  const xpActivityTrend = db
    .prepare(
      `SELECT substr(created_at_utc, 1, 10) AS date, COUNT(*) AS count, SUM(amount) AS total_xp
       FROM xp_transactions
       GROUP BY substr(created_at_utc, 1, 10)
       ORDER BY date DESC
       LIMIT 7`
    )
    .all();

  const aiAndGradingSummary = {
    totalGraded: (db.prepare(`SELECT COUNT(*) AS c FROM grades`).get() as { c: number }).c,
    avgScore:
      (db.prepare(`SELECT ROUND(AVG(score), 1) AS avg FROM grades`).get() as { avg: number | null }).avg ?? 0,
    needsRevisionCount: (
      db.prepare(`SELECT COUNT(*) AS c FROM assignment_submissions WHERE status = 'NEEDS_REVISION'`).get() as { c: number }
    ).c,
    aiCompletedCount: (
      db.prepare(`SELECT COUNT(*) AS c FROM ai_analyses WHERE status = 'COMPLETED'`).get() as { c: number }
    ).c,
    geminiConfigured: isGeminiConfigured(),
  };

  const upcomingSchedules = db
    .prepare(
      `SELECT sc.*, c.name AS class_name, sp.code AS prodi_code
       FROM schedules sc
       JOIN classes c ON c.id = sc.class_id
       JOIN study_programs sp ON sp.id = c.study_program_id
       WHERE sc.is_active = 1
       ORDER BY sc.day_of_week ASC, sc.start_time ASC
       LIMIT 6`
    )
    .all();

  const recentSubmissions = db
    .prepare(
      `SELECT sub.id, sub.submitted_at_utc, sub.is_late, sub.status, sub.is_verified,
              s.full_name AS student_name, s.nim, c.name AS class_name, a.title AS assignment_title,
              g.score
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN classes c ON c.id = s.class_id
       JOIN assignments a ON a.id = sub.assignment_id
       LEFT JOIN grades g ON g.submission_id = sub.id
       ORDER BY sub.submitted_at_utc DESC
       LIMIT 6`
    )
    .all();

  res.json({
    stats: {
      totalStudents,
      hesStudents: byProdi['HES'] ?? 0,
      pjkrStudents: byProdi['PJKR'] ?? 0,
      farmasiStudents: byProdi['FARMASI'] ?? 0,
      activeAssignments,
      pendingSubmissions,
      openSessions,
      activeAcademicYear: String(settings.active_academic_year),
      activeSemester: String(settings.active_semester),
      institutionName: String(settings.institution_name),
    },
    top3,
    charts: {
      assignmentStats,
      attendanceBreakdown,
      xpActivityTrend: xpActivityTrend.reverse(),
      aiAndGradingSummary,
    },
    upcomingSchedules,
    recentSubmissions,
  });
});

// ---------------------------------------------------------------------------
// 2. PROGRAM STUDI CRUD
// ---------------------------------------------------------------------------
adminRouter.get('/study-programs', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT sp.*,
         (SELECT COUNT(*) FROM classes c WHERE c.study_program_id = sp.id) AS class_count,
         (SELECT COUNT(*) FROM students s WHERE s.study_program_id = sp.id) AS student_count
       FROM study_programs sp
       ORDER BY sp.code ASC`
    )
    .all();
  res.json({ items: rows });
});

adminRouter.post('/study-programs', (req: AuthenticatedRequest, res) => {
  const { code, name, faculty, degreeLevel, classQuota } = req.body as Record<string, unknown>;
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  const cleanFaculty = String(faculty ?? '').trim();
  const cleanDegree = String(degreeLevel ?? 'S1').trim();
  const quota = Math.max(1, Number(classQuota) || 10);

  if (!cleanCode || !cleanName || !cleanFaculty) {
    res.status(400).json({ error: 'Kode, nama program studi, dan fakultas wajib diisi.' });
    return;
  }

  try {
    const id = newId();
    db.prepare(
      `INSERT INTO study_programs (id, code, name, faculty, degree_level, class_quota)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, cleanCode, cleanName, cleanFaculty, cleanDegree, quota);
    logAdminActivity(req.authUser!.id, 'CREATE_PRODI', 'study_programs', id, { code: cleanCode });
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: 'Kode program studi sudah terdaftar.' });
  }
});

adminRouter.put('/study-programs/:id', (req: AuthenticatedRequest, res) => {
  const { code, name, faculty, degreeLevel, classQuota } = req.body as Record<string, unknown>;
  const cleanCode = String(code ?? '').trim().toUpperCase();
  const cleanName = String(name ?? '').trim();
  const cleanFaculty = String(faculty ?? '').trim();
  const cleanDegree = String(degreeLevel ?? 'S1').trim();
  const quota = Math.max(1, Number(classQuota) || 10);

  if (!cleanCode || !cleanName || !cleanFaculty) {
    res.status(400).json({ error: 'Data program studi tidak lengkap.' });
    return;
  }

  try {
    db.prepare(
      `UPDATE study_programs
       SET code = ?, name = ?, faculty = ?, degree_level = ?, class_quota = ?, updated_at = ?
       WHERE id = ?`
    ).run(cleanCode, cleanName, cleanFaculty, cleanDegree, quota, new Date().toISOString(), req.params.id);
    logAdminActivity(req.authUser!.id, 'UPDATE_PRODI', 'study_programs', req.params.id, { code: cleanCode });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Gagal memperbarui program studi (duplikasi kode).' });
  }
});

adminRouter.delete('/study-programs/:id', (req: AuthenticatedRequest, res) => {
  try {
    db.prepare(`DELETE FROM study_programs WHERE id = ?`).run(req.params.id);
    logAdminActivity(req.authUser!.id, 'DELETE_PRODI', 'study_programs', req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Program studi tidak dapat dihapus karena masih memiliki kelas atau mahasiswa.' });
  }
});

// ---------------------------------------------------------------------------
// 3. KELAS CRUD & CSV IMPORT
// ---------------------------------------------------------------------------
adminRouter.get('/classes', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*, sp.code AS study_program_code, sp.name AS study_program_name,
         (SELECT COUNT(*) FROM students s WHERE s.class_id = c.id) AS student_count
       FROM classes c
       JOIN study_programs sp ON sp.id = c.study_program_id
       ORDER BY sp.code ASC, c.semester ASC, c.name ASC`
    )
    .all();
  res.json({ items: rows });
});

adminRouter.post('/classes', (req: AuthenticatedRequest, res) => {
  const { name, studyProgramId, semester, academicYear, homeroomLecturer } = req.body as Record<string, unknown>;
  const cleanName = String(name ?? '').trim();
  const prodiId = String(studyProgramId ?? '').trim();
  const sem = Math.max(1, Math.min(14, Number(semester) || 1));
  const year = String(academicYear ?? '2026/2027').trim();
  const lecturer = String(homeroomLecturer ?? '').trim();

  if (!cleanName || !prodiId) {
    res.status(400).json({ error: 'Nama kelas dan program studi wajib diisi.' });
    return;
  }

  const prodi = db.prepare(`SELECT class_quota FROM study_programs WHERE id = ?`).get(prodiId) as
    | { class_quota: number }
    | undefined;
  if (!prodi) {
    res.status(404).json({ error: 'Program studi tidak ditemukan.' });
    return;
  }
  const currentCount = (
    db.prepare(`SELECT COUNT(*) AS c FROM classes WHERE study_program_id = ?`).get(prodiId) as { c: number }
  ).c;
  if (currentCount >= prodi.class_quota) {
    res.status(400).json({ error: `Kuota kelas untuk prodi ini telah mencapai batas (${prodi.class_quota}).` });
    return;
  }

  try {
    const id = newId();
    db.prepare(
      `INSERT INTO classes (id, name, study_program_id, semester, academic_year, homeroom_lecturer)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, cleanName, prodiId, sem, year, lecturer);
    logAdminActivity(req.authUser!.id, 'CREATE_CLASS', 'classes', id, { name: cleanName });
    res.status(201).json({ id });
  } catch {
    res.status(409).json({ error: 'Kelas dengan nama tersebut sudah ada pada program studi ini.' });
  }
});

adminRouter.put('/classes/:id', (req: AuthenticatedRequest, res) => {
  const { name, studyProgramId, semester, academicYear, homeroomLecturer } = req.body as Record<string, unknown>;
  const cleanName = String(name ?? '').trim();
  const prodiId = String(studyProgramId ?? '').trim();
  const sem = Math.max(1, Math.min(14, Number(semester) || 1));
  const year = String(academicYear ?? '2026/2027').trim();
  const lecturer = String(homeroomLecturer ?? '').trim();

  if (!cleanName || !prodiId) {
    res.status(400).json({ error: 'Nama kelas dan program studi wajib diisi.' });
    return;
  }

  try {
    db.prepare(
      `UPDATE classes
       SET name = ?, study_program_id = ?, semester = ?, academic_year = ?, homeroom_lecturer = ?, updated_at = ?
       WHERE id = ?`
    ).run(cleanName, prodiId, sem, year, lecturer, new Date().toISOString(), req.params.id);
    logAdminActivity(req.authUser!.id, 'UPDATE_CLASS', 'classes', req.params.id, { name: cleanName });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Gagal memperbarui kelas (duplikasi nama kelas).' });
  }
});

adminRouter.delete('/classes/:id', (req: AuthenticatedRequest, res) => {
  try {
    db.prepare(`DELETE FROM classes WHERE id = ?`).run(req.params.id);
    logAdminActivity(req.authUser!.id, 'DELETE_CLASS', 'classes', req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'Kelas tidak dapat dihapus karena masih memiliki mahasiswa.' });
  }
});

adminRouter.post('/classes/import-csv', (req: AuthenticatedRequest, res) => {
  const { csvText } = req.body as { csvText?: string };
  if (!csvText || !csvText.trim()) {
    res.status(400).json({ error: 'Konten CSV kosong.' });
    return;
  }

  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const prodis = db.prepare(`SELECT id, code FROM study_programs`).all() as { id: string; code: string }[];
  const prodiMap = new Map(prodis.map((p) => [p.code.toUpperCase(), p.id]));

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  withTransaction(() => {
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (i === 0 && cols[0]?.toLowerCase().includes('nama')) continue;
      const [name, prodiCode, semStr, year, lecturer] = cols;
      const prodiId = prodiMap.get((prodiCode ?? '').toUpperCase());
      if (!name || !prodiId) {
        skipped += 1;
        errors.push(`Baris ${i + 1}: Prodi "${prodiCode ?? ''}" atau nama kelas tidak valid.`);
        continue;
      }
      try {
        db.prepare(
          `INSERT OR IGNORE INTO classes (id, name, study_program_id, semester, academic_year, homeroom_lecturer)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(newId(), name, prodiId, Math.max(1, Number(semStr) || 1), year || '2026/2027', lecturer || '');
        inserted += 1;
      } catch {
        skipped += 1;
      }
    }
    logAdminActivity(req.authUser!.id, 'IMPORT_CLASS_CSV', 'classes', '', { inserted, skipped });
  });

  res.json({ inserted, skipped, errors });
});

// ---------------------------------------------------------------------------
// 4. DATA MAHASISWA, MANAJEMEN AKUN & IMPORT EXCEL
// ---------------------------------------------------------------------------
adminRouter.get('/students', (req, res) => {
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const prodiId = String(req.query.prodiId ?? '').trim();
  const classId = String(req.query.classId ?? '').trim();
  const status = String(req.query.status ?? '').trim(); // 'active' | 'inactive'
  const badge = String(req.query.badge ?? '').trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.max(5, Math.min(100, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const where: string[] = ['1=1'];
  const params: Array<string | number> = [];

  if (search) {
    where.push('(lower(s.full_name) LIKE ? OR lower(s.nim) LIKE ? OR lower(u.username) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (prodiId) {
    where.push('s.study_program_id = ?');
    params.push(prodiId);
  }
  if (classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }
  if (status === 'active') {
    where.push('u.is_active = 1');
  } else if (status === 'inactive') {
    where.push('u.is_active = 0');
  }
  if (badge) {
    where.push('s.badge = ?');
    params.push(badge);
  }

  const whereSql = where.join(' AND ');
  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS c
         FROM students s
         JOIN user_profiles u ON u.id = s.user_id
         WHERE ${whereSql}`
      )
      .get(...params) as { c: number }
  ).c;

  const items = db
    .prepare(
      `SELECT s.*, u.username, u.email, u.is_active,
              sp.code AS study_program_code, sp.name AS study_program_name,
              c.name AS class_name
       FROM students s
       JOIN user_profiles u ON u.id = s.user_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       WHERE ${whereSql}
       ORDER BY s.full_name ASC
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset);

  res.json({ items, total, page, limit });
});

adminRouter.post('/students', (req: AuthenticatedRequest, res) => {
  const {
    nim,
    fullName,
    username,
    password,
    email,
    studyProgramId,
    classId,
    cohortYear,
    semester,
    badge,
  } = req.body as Record<string, unknown>;

  const cleanNim = String(nim ?? '').trim();
  const cleanName = String(fullName ?? '').trim();
  const cleanUsername = String(username ?? '').trim().toLowerCase();
  const rawPassword = String(password ?? '');
  const cleanEmail = String(email ?? '').trim().toLowerCase() || null;
  const prodiId = String(studyProgramId ?? '').trim();
  const clsId = String(classId ?? '').trim();
  const cohort = Number(cohortYear) || 2026;
  const sem = Math.max(1, Math.min(14, Number(semester) || 1));
  const badgeVal: StudentBadge = ['Netral', 'AFK', 'Lulus'].includes(String(badge))
    ? (String(badge) as StudentBadge)
    : 'Netral';

  if (!cleanNim || !cleanName || !cleanUsername || rawPassword.length < 4 || !prodiId || !clsId) {
    res.status(400).json({
      error: 'NIM, Nama, Username, Password (min 4 karakter), Prodi, dan Kelas wajib diisi.',
    });
    return;
  }

  try {
    const result = withTransaction(() => {
      const userId = newId();
      const studentId = newId();
      db.prepare(
        `INSERT INTO user_profiles (id, username, email, password_hash, full_name, role, is_active)
         VALUES (?, ?, ?, ?, ?, 'MAHASISWA', 1)`
      ).run(userId, cleanUsername, cleanEmail, hashPassword(rawPassword), cleanName);

      db.prepare(
        `INSERT INTO students (id, user_id, nim, full_name, study_program_id, class_id, cohort_year, semester, badge)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(studentId, userId, cleanNim, cleanName, prodiId, clsId, cohort, sem, badgeVal);

      db.prepare(
        `INSERT INTO student_streaks (id, student_id, current_streak, longest_streak, updated_at_utc)
         VALUES (?, ?, 0, 0, ?)`
      ).run(newId(), studentId, new Date().toISOString());

      logAdminActivity(req.authUser!.id, 'CREATE_STUDENT', 'students', studentId, {
        nim: cleanNim,
        username: cleanUsername,
      });
      return { userId, studentId };
    });
    res.status(201).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'NIM, Username, atau Email sudah digunakan.' });
      return;
    }
    res.status(500).json({ error: 'Gagal menambahkan mahasiswa.' });
  }
});

adminRouter.put('/students/:id', (req: AuthenticatedRequest, res) => {
  const { nim, fullName, email, studyProgramId, classId, cohortYear, semester, badge } = req.body as Record<
    string,
    unknown
  >;
  const cleanNim = String(nim ?? '').trim();
  const cleanName = String(fullName ?? '').trim();
  const cleanEmail = String(email ?? '').trim().toLowerCase() || null;
  const prodiId = String(studyProgramId ?? '').trim();
  const clsId = String(classId ?? '').trim();
  const cohort = Number(cohortYear) || 2026;
  const sem = Math.max(1, Math.min(14, Number(semester) || 1));
  const badgeVal: StudentBadge = ['Netral', 'AFK', 'Lulus'].includes(String(badge))
    ? (String(badge) as StudentBadge)
    : 'Netral';

  if (!cleanNim || !cleanName || !prodiId || !clsId) {
    res.status(400).json({ error: 'Data mahasiswa tidak lengkap.' });
    return;
  }

  try {
    withTransaction(() => {
      const st = db.prepare(`SELECT user_id FROM students WHERE id = ?`).get(req.params.id) as
        | { user_id: string }
        | undefined;
      if (!st) throw new Error('NOT_FOUND');

      db.prepare(`UPDATE user_profiles SET full_name = ?, email = ?, updated_at = ? WHERE id = ?`).run(
        cleanName,
        cleanEmail,
        new Date().toISOString(),
        st.user_id
      );

      db.prepare(
        `UPDATE students
         SET nim = ?, full_name = ?, study_program_id = ?, class_id = ?, cohort_year = ?, semester = ?, badge = ?, updated_at = ?
         WHERE id = ?`
      ).run(cleanNim, cleanName, prodiId, clsId, cohort, sem, badgeVal, new Date().toISOString(), req.params.id);

      logAdminActivity(req.authUser!.id, 'UPDATE_STUDENT', 'students', req.params.id, { nim: cleanNim, badge: badgeVal });
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
      return;
    }
    res.status(409).json({ error: 'Gagal memperbarui mahasiswa (NIM atau Email duplikat).' });
  }
});

adminRouter.patch('/students/:id/account', (req: AuthenticatedRequest, res) => {
  const { username, newPassword, isActive } = req.body as {
    username?: string;
    newPassword?: string;
    isActive?: boolean;
  };

  const st = db.prepare(`SELECT user_id FROM students WHERE id = ?`).get(req.params.id) as
    | { user_id: string }
    | undefined;
  if (!st) {
    res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
    return;
  }

  try {
    withTransaction(() => {
      if (typeof username === 'string' && username.trim()) {
        const cleanU = username.trim().toLowerCase();
        db.prepare(`UPDATE user_profiles SET username = ?, updated_at = ? WHERE id = ?`).run(
          cleanU,
          new Date().toISOString(),
          st.user_id
        );
      }
      if (typeof newPassword === 'string' && newPassword.length > 0) {
        if (newPassword.length < 4) {
          throw new Error('PASSWORD_TOO_SHORT');
        }
        db.prepare(`UPDATE user_profiles SET password_hash = ?, updated_at = ? WHERE id = ?`).run(
          hashPassword(newPassword),
          new Date().toISOString(),
          st.user_id
        );
        // Revoke active student sessions when password is reset
        db.prepare(`UPDATE user_sessions SET revoked_at_utc = ? WHERE user_id = ? AND revoked_at_utc IS NULL`).run(
          new Date().toISOString(),
          st.user_id
        );
      }
      if (typeof isActive === 'boolean') {
        db.prepare(`UPDATE user_profiles SET is_active = ?, updated_at = ? WHERE id = ?`).run(
          isActive ? 1 : 0,
          new Date().toISOString(),
          st.user_id
        );
        if (!isActive) {
          db.prepare(`UPDATE user_sessions SET revoked_at_utc = ? WHERE user_id = ? AND revoked_at_utc IS NULL`).run(
            new Date().toISOString(),
            st.user_id
          );
        }
      }
      logAdminActivity(req.authUser!.id, 'UPDATE_STUDENT_ACCOUNT', 'students', req.params.id, {
        usernameChanged: Boolean(username),
        passwordReset: Boolean(newPassword),
        isActive,
      });
    });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof Error && err.message === 'PASSWORD_TOO_SHORT') {
      res.status(400).json({ error: 'Password baru minimal 4 karakter.' });
      return;
    }
    res.status(409).json({ error: 'Username sudah digunakan oleh akun lain.' });
  }
});

adminRouter.delete('/students/:id', (req: AuthenticatedRequest, res) => {
  const st = db.prepare(`SELECT user_id, nim FROM students WHERE id = ?`).get(req.params.id) as
    | { user_id: string; nim: string }
    | undefined;
  if (!st) {
    res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
    return;
  }
  withTransaction(() => {
    db.prepare(`DELETE FROM user_profiles WHERE id = ?`).run(st.user_id);
    logAdminActivity(req.authUser!.id, 'DELETE_STUDENT', 'students', req.params.id, { nim: st.nim });
  });
  res.json({ ok: true });
});

adminRouter.post('/students/import-excel/preview', memoryUpload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'File Excel (.xlsx) wajib diunggah.' });
    return;
  }
  try {
    const preview = await parseStudentImportWorkbook(req.file.buffer);
    res.json(preview);
  } catch (err) {
    res.status(400).json({
      error: `Gagal memproses file Excel: ${err instanceof Error ? err.message : 'Format tidak valid'}`,
    });
  }
});

adminRouter.post('/students/import-excel/commit', (req: AuthenticatedRequest, res) => {
  const { sheetClassMap, rows, importHistorical } = req.body as {
    sheetClassMap: Record<string, string>;
    rows: Array<{
      sheetName: string;
      nim: string;
      fullName: string;
      username: string;
      password: string;
      cohortYear: number;
      semester: number;
      badge: StudentBadge;
      skipBlack: boolean;
      isDuplicateInFile: boolean;
      validationError: string | null;
      historicalWeeks: Partial<Record<number, AttendanceStatus>>;
    }>;
    importHistorical: boolean;
  };

  if (!Array.isArray(rows) || !sheetClassMap) {
    res.status(400).json({ error: 'Payload import tidak valid.' });
    return;
  }

  const classProdiMap = new Map(
    (db.prepare(`SELECT id, study_program_id FROM classes`).all() as { id: string; study_program_id: string }[]).map(
      (c) => [c.id, c.study_program_id]
    )
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  withTransaction(() => {
    for (const r of rows) {
      if (r.skipBlack || r.validationError || r.isDuplicateInFile) {
        skipped += 1;
        continue;
      }
      const classId = sheetClassMap[r.sheetName];
      const prodiId = classProdiMap.get(classId);
      if (!classId || !prodiId) {
        skipped += 1;
        continue;
      }

      let studentId: string;
      const existing = db.prepare(`SELECT id, user_id FROM students WHERE upper(nim) = upper(?)`).get(r.nim) as
        | { id: string; user_id: string }
        | undefined;

      if (existing) {
        studentId = existing.id;
        db.prepare(
          `UPDATE students SET full_name = ?, study_program_id = ?, class_id = ?, cohort_year = ?, semester = ?, badge = ?, updated_at = ? WHERE id = ?`
        ).run(r.fullName, prodiId, classId, r.cohortYear, r.semester, r.badge, new Date().toISOString(), studentId);
        updated += 1;
      } else {
        const userId = newId();
        studentId = newId();
        const baseUsername = r.username.toLowerCase().replace(/[^a-z0-9._-]/g, '') || r.nim.toLowerCase();
        const clash = db.prepare(`SELECT 1 FROM user_profiles WHERE lower(username) = ?`).get(baseUsername);
        const finalUsername = clash ? `${baseUsername}_${r.nim.toLowerCase()}` : baseUsername;

        db.prepare(
          `INSERT INTO user_profiles (id, username, password_hash, full_name, role, is_active)
           VALUES (?, ?, ?, ?, 'MAHASISWA', 1)`
        ).run(userId, finalUsername, hashPassword(r.password || r.nim), r.fullName);

        db.prepare(
          `INSERT INTO students (id, user_id, nim, full_name, study_program_id, class_id, cohort_year, semester, badge)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(studentId, userId, r.nim, r.fullName, prodiId, classId, r.cohortYear, r.semester, r.badge);

        db.prepare(
          `INSERT INTO student_streaks (id, student_id, current_streak, longest_streak, updated_at_utc)
           VALUES (?, ?, 0, 0, ?)`
        ).run(newId(), studentId, new Date().toISOString());
        created += 1;
      }

      if (importHistorical && r.historicalWeeks) {
        for (let w = 1; w <= 8; w++) {
          const st = r.historicalWeeks[w];
          if (st) {
            db.prepare(
              `INSERT INTO historical_attendance (id, student_id, week_number, status, imported_by_admin_id, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(student_id, week_number) DO UPDATE SET
                 status = excluded.status,
                 imported_by_admin_id = excluded.imported_by_admin_id,
                 updated_at = excluded.updated_at`
            ).run(newId(), studentId, w, st, req.authUser!.id, new Date().toISOString());
          }
        }
        recalculateStudentAttendanceAndQuotas(studentId, req.authUser!.id);
      }
    }

    logAdminActivity(req.authUser!.id, 'IMPORT_EXCEL_STUDENTS', 'students', '', { created, updated, skipped });
  });

  res.json({ created, updated, skipped });
});

// ---------------------------------------------------------------------------
// 5. JADWAL PERKULIAHAN
// ---------------------------------------------------------------------------
adminRouter.get('/schedules', (req, res) => {
  const classId = String(req.query.classId ?? '').trim();
  const where = classId ? 'WHERE sc.class_id = ?' : '';
  const items = db
    .prepare(
      `SELECT sc.*, c.name AS class_name, sp.code AS study_program_code
       FROM schedules sc
       JOIN classes c ON c.id = sc.class_id
       JOIN study_programs sp ON sp.id = c.study_program_id
       ${where}
       ORDER BY sc.day_of_week ASC, sc.start_time ASC`
    )
    .all(...(classId ? [classId] : []));
  res.json({ items });
});

adminRouter.post('/schedules', (req: AuthenticatedRequest, res) => {
  const { courseName, courseCode, lecturerName, classId, dayOfWeek, startTime, endTime, mode, meetingLink, roomName, semester } =
    req.body as Record<string, unknown>;

  if (!String(courseName ?? '').trim() || !String(classId ?? '').trim() || !startTime || !endTime) {
    res.status(400).json({ error: 'Mata kuliah, kelas, dan jam mulai/selesai wajib diisi.' });
    return;
  }

  const id = newId();
  db.prepare(
    `INSERT INTO schedules (id, course_name, course_code, lecturer_name, class_id, day_of_week, start_time, end_time, mode, meeting_link, room_name, semester)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(courseName).trim(),
    String(courseCode ?? '').trim(),
    String(lecturerName ?? '').trim(),
    String(classId),
    Math.max(1, Math.min(7, Number(dayOfWeek) || 1)),
    String(startTime),
    String(endTime),
    mode === 'Daring' ? 'Daring' : 'Luring',
    String(meetingLink ?? '').trim(),
    String(roomName ?? '').trim(),
    Math.max(1, Number(semester) || 1)
  );
  logAdminActivity(req.authUser!.id, 'CREATE_SCHEDULE', 'schedules', id, { courseName });
  res.status(201).json({ id });
});

adminRouter.put('/schedules/:id', (req: AuthenticatedRequest, res) => {
  const { courseName, courseCode, lecturerName, classId, dayOfWeek, startTime, endTime, mode, meetingLink, roomName, semester, isActive } =
    req.body as Record<string, unknown>;

  db.prepare(
    `UPDATE schedules
     SET course_name = ?, course_code = ?, lecturer_name = ?, class_id = ?, day_of_week = ?,
         start_time = ?, end_time = ?, mode = ?, meeting_link = ?, room_name = ?, semester = ?, is_active = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(courseName ?? '').trim(),
    String(courseCode ?? '').trim(),
    String(lecturerName ?? '').trim(),
    String(classId ?? ''),
    Math.max(1, Math.min(7, Number(dayOfWeek) || 1)),
    String(startTime ?? ''),
    String(endTime ?? ''),
    mode === 'Daring' ? 'Daring' : 'Luring',
    String(meetingLink ?? '').trim(),
    String(roomName ?? '').trim(),
    Math.max(1, Number(semester) || 1),
    isActive === false ? 0 : 1,
    new Date().toISOString(),
    req.params.id
  );
  logAdminActivity(req.authUser!.id, 'UPDATE_SCHEDULE', 'schedules', req.params.id);
  res.json({ ok: true });
});

adminRouter.delete('/schedules/:id', (req: AuthenticatedRequest, res) => {
  db.prepare(`DELETE FROM schedules WHERE id = ?`).run(req.params.id);
  logAdminActivity(req.authUser!.id, 'DELETE_SCHEDULE', 'schedules', req.params.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// 6. ABSENSI, QR DINAMIS, KOREKSI & HISTORI MINGGU 1-8
// ---------------------------------------------------------------------------
adminRouter.get('/attendance/sessions', async (_req, res) => {
  const rows = db
    .prepare(
      `SELECT ses.*, c.name AS class_name, sc.course_name,
         (SELECT COUNT(*) FROM attendance_records ar WHERE ar.session_id = ses.id) AS recorded_count,
         (SELECT COUNT(*) FROM students s WHERE s.class_id = ses.class_id AND s.badge != 'AFK') AS total_students
       FROM attendance_sessions ses
       JOIN classes c ON c.id = ses.class_id
       LEFT JOIN schedules sc ON sc.id = ses.schedule_id
       ORDER BY ses.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  const enriched = await Promise.all(
    rows.map(async (r) => {
      let qrDataUrl = '';
      if (r.mode === 'Luring' && r.status === 'OPEN' && r.qr_token) {
        qrDataUrl = await QRCode.toDataURL(String(r.qr_token), { width: 240, margin: 1 });
      }
      return { ...r, qrDataUrl };
    })
  );

  res.json({ items: enriched });
});

adminRouter.post('/attendance/sessions', async (req: AuthenticatedRequest, res) => {
  const { scheduleId, classId, title, mode, openAtUtc, closeAtUtc, durationMinutes } = req.body as {
    scheduleId?: string | null;
    classId?: string;
    title?: string;
    mode?: 'Daring' | 'Luring';
    openAtUtc?: string;
    closeAtUtc?: string;
    durationMinutes?: number;
  };

  if (!classId || !title?.trim()) {
    res.status(400).json({ error: 'Kelas dan judul sesi absensi wajib diisi.' });
    return;
  }

  const settings = db
    .prepare(`SELECT default_attendance_duration_minutes FROM academic_settings WHERE id = 1`)
    .get() as { default_attendance_duration_minutes: number };

  const id = newId();
  const openAt = openAtUtc ? new Date(openAtUtc).toISOString() : new Date().toISOString();
  const mins = Math.max(5, Math.min(180, Number(durationMinutes) || settings.default_attendance_duration_minutes));
  const closeAt = closeAtUtc
    ? new Date(closeAtUtc).toISOString()
    : new Date(new Date(openAt).getTime() + mins * 60000).toISOString();

  const secret = crypto.randomBytes(16).toString('hex');
  const sessionMode = mode === 'Daring' ? 'Daring' : 'Luring';
  const qr = sessionMode === 'Luring' ? createQrPayload(id, secret) : { token: '', expiresAt: null };

  db.prepare(
    `INSERT INTO attendance_sessions (id, schedule_id, class_id, title, mode, open_at_utc, close_at_utc, qr_secret, qr_token, qr_expires_at, status, created_by_admin_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?)`
  ).run(id, scheduleId || null, classId, title.trim(), sessionMode, openAt, closeAt, secret, qr.token, qr.expiresAt, req.authUser!.id);

  logAdminActivity(req.authUser!.id, 'OPEN_ATTENDANCE_SESSION', 'attendance_sessions', id, { title, mode: sessionMode });
  const qrDataUrl = qr.token ? await QRCode.toDataURL(qr.token, { width: 240, margin: 1 }) : '';
  res.status(201).json({ id, qrToken: qr.token, qrDataUrl });
});

adminRouter.post('/attendance/sessions/:id/refresh-qr', async (req: AuthenticatedRequest, res) => {
  const ses = db.prepare(`SELECT id, qr_secret, mode, status FROM attendance_sessions WHERE id = ?`).get(req.params.id) as
    | { id: string; qr_secret: string; mode: string; status: string }
    | undefined;
  if (!ses || ses.status !== 'OPEN') {
    res.status(404).json({ error: 'Sesi tidak ditemukan atau sudah ditutup.' });
    return;
  }
  const qr = createQrPayload(ses.id, ses.qr_secret);
  db.prepare(`UPDATE attendance_sessions SET qr_token = ?, qr_expires_at = ? WHERE id = ?`).run(
    qr.token,
    qr.expiresAt,
    ses.id
  );
  const qrDataUrl = await QRCode.toDataURL(qr.token, { width: 240, margin: 1 });
  res.json({ qrToken: qr.token, qrExpiresAt: qr.expiresAt, qrDataUrl });
});

adminRouter.post('/attendance/sessions/:id/close', (req: AuthenticatedRequest, res) => {
  db.prepare(`UPDATE attendance_sessions SET status = 'CLOSED', close_at_utc = ? WHERE id = ?`).run(
    new Date().toISOString(),
    req.params.id
  );
  logAdminActivity(req.authUser!.id, 'CLOSE_ATTENDANCE_SESSION', 'attendance_sessions', req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/attendance/sessions/:id/records', (req, res) => {
  const session = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(req.params.id) as
    | { id: string; class_id: string }
    | undefined;
  if (!session) {
    res.status(404).json({ error: 'Sesi tidak ditemukan.' });
    return;
  }

  const students = db
    .prepare(
      `SELECT s.id AS student_id, s.nim, s.full_name, s.badge,
              ar.id AS record_id, ar.status, ar.method, ar.recorded_at_utc, ar.notes,
              ar.correction_reason, ar.corrected_at_utc, ar.xp_awarded,
              admin_u.full_name AS corrected_by_admin_name
       FROM students s
       LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.session_id = ?
       LEFT JOIN user_profiles admin_u ON admin_u.id = ar.corrected_by_admin_id
       WHERE s.class_id = ?
       ORDER BY s.full_name ASC`
    )
    .all(session.id, session.class_id);

  res.json({ items: students });
});

adminRouter.post('/attendance/manual', (req: AuthenticatedRequest, res) => {
  const { sessionId, studentId, status, notes } = req.body as {
    sessionId?: string;
    studentId?: string;
    status?: AttendanceStatus;
    notes?: string;
  };

  if (!sessionId || !studentId || !['Hadir', 'Izin', 'Sakit', 'Alfa'].includes(String(status))) {
    res.status(400).json({ error: 'Session, mahasiswa, dan status absensi valid wajib diisi.' });
    return;
  }
  const validStatus = String(status) as AttendanceStatus;

  const result = withTransaction(() => {
    const existing = db
      .prepare(`SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?`)
      .get(sessionId, studentId) as { id: string } | undefined;

    if (existing) {
      return { alreadyExists: true };
    }

    db.prepare(
      `INSERT INTO attendance_records (id, session_id, student_id, status, recorded_at_utc, method, notes)
       VALUES (?, ?, ?, ?, ?, 'ADMIN_MANUAL', ?)`
    ).run(newId(), sessionId, studentId, validStatus, new Date().toISOString(), (notes ?? '').trim());

    const recalc = recalculateStudentAttendanceAndQuotas(studentId, req.authUser!.id);
    logAdminActivity(req.authUser!.id, 'MANUAL_ATTENDANCE', 'attendance_records', sessionId, {
      studentId,
      status,
    });
    return { alreadyExists: false, recalc };
  });

  if (result.alreadyExists) {
    res.status(409).json({ error: 'Absensi mahasiswa untuk sesi ini sudah tercatat. Gunakan fitur Koreksi Absensi.' });
    return;
  }
  res.status(201).json(result);
});

adminRouter.patch('/attendance/records/:id/correct', (req: AuthenticatedRequest, res) => {
  const { status, correctionReason } = req.body as { status?: AttendanceStatus; correctionReason?: string };
  const reason = (correctionReason ?? '').trim();
  if (!['Hadir', 'Izin', 'Sakit', 'Alfa'].includes(String(status))) {
    res.status(400).json({ error: 'Status absensi tidak valid.' });
    return;
  }
  const validStatus = String(status) as AttendanceStatus;
  if (reason.length < 3) {
    res.status(400).json({ error: 'Alasan koreksi absensi wajib diisi (minimal 3 karakter).' });
    return;
  }

  const rec = db.prepare(`SELECT * FROM attendance_records WHERE id = ?`).get(req.params.id) as
    | { id: string; student_id: string; session_id: string; status: string }
    | undefined;
  if (!rec) {
    res.status(404).json({ error: 'Catatan absensi tidak ditemukan.' });
    return;
  }

  const recalc = withTransaction(() => {
    db.prepare(
      `UPDATE attendance_records
       SET status = ?, correction_reason = ?, corrected_by_admin_id = ?, corrected_at_utc = ?
       WHERE id = ?`
    ).run(validStatus, reason, req.authUser!.id, new Date().toISOString(), rec.id);

    const out = recalculateStudentAttendanceAndQuotas(rec.student_id, req.authUser!.id);
    logAdminActivity(req.authUser!.id, 'CORRECT_ATTENDANCE', 'attendance_records', rec.id, {
      previousStatus: rec.status,
      newStatus: validStatus,
      reason,
    });
    return out;
  });

  res.json({ ok: true, recalc });
});

adminRouter.get('/attendance/historical', (req, res) => {
  const classId = String(req.query.classId ?? '').trim();
  const where = classId ? 'WHERE s.class_id = ?' : '';
  const students = db
    .prepare(
      `SELECT s.id, s.nim, s.full_name, c.name AS class_name, sp.code AS prodi_code
       FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       ${where}
       ORDER BY s.full_name ASC`
    )
    .all(...(classId ? [classId] : [])) as Array<{ id: string; nim: string; full_name: string; class_name: string; prodi_code: string }>;

  const histRows = db.prepare(`SELECT * FROM historical_attendance`).all() as Array<{
    student_id: string;
    week_number: number;
    status: AttendanceStatus;
    xp_awarded: number;
  }>;

  const byStudent = new Map<string, Record<number, { status: AttendanceStatus; xp: number }>>();
  for (const h of histRows) {
    if (!byStudent.has(h.student_id)) byStudent.set(h.student_id, {});
    byStudent.get(h.student_id)![h.week_number] = { status: h.status, xp: h.xp_awarded };
  }

  const items = students.map((s) => ({
    ...s,
    weeks: byStudent.get(s.id) ?? {},
  }));
  res.json({ items });
});

adminRouter.put('/attendance/historical', (req: AuthenticatedRequest, res) => {
  const { updates } = req.body as {
    updates: Array<{ studentId: string; weekNumber: number; status: AttendanceStatus }>;
  };
  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'Tidak ada data perubahan histori absensi.' });
    return;
  }

  const touchedStudents = new Set<string>();
  withTransaction(() => {
    for (const u of updates) {
      if (u.weekNumber < 1 || u.weekNumber > 8) continue;
      if (!['Hadir', 'Izin', 'Sakit', 'Alfa'].includes(u.status)) continue;
      db.prepare(
        `INSERT INTO historical_attendance (id, student_id, week_number, status, imported_by_admin_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(student_id, week_number) DO UPDATE SET
           status = excluded.status,
           imported_by_admin_id = excluded.imported_by_admin_id,
           updated_at = excluded.updated_at`
      ).run(newId(), u.studentId, u.weekNumber, u.status, req.authUser!.id, new Date().toISOString());
      touchedStudents.add(u.studentId);
    }

    for (const sid of touchedStudents) {
      recalculateStudentAttendanceAndQuotas(sid, req.authUser!.id);
    }

    logAdminActivity(req.authUser!.id, 'UPDATE_HISTORICAL_ATTENDANCE', 'historical_attendance', '', {
      studentsUpdated: touchedStudents.size,
      entries: updates.length,
    });
  });

  res.json({ ok: true, studentsRecalculated: touchedStudents.size });
});

adminRouter.get('/attendance/quotas', (_req, res) => {
  const settings = db
    .prepare(`SELECT active_academic_year, active_semester FROM academic_settings WHERE id = 1`)
    .get() as { active_academic_year: string; active_semester: string };

  const items = db
    .prepare(
      `SELECT s.id AS student_id, s.nim, s.full_name, c.name AS class_name, sp.code AS prodi_code,
              COALESCE(pq.izin_used_count, 0) AS izin_used_count,
              COALESCE(pq.max_xp_izin_count, 2) AS max_xp_izin_count
       FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       LEFT JOIN permission_quotas pq ON pq.student_id = s.id AND pq.academic_year = ? AND pq.semester = ?
       ORDER BY izin_used_count DESC, s.full_name ASC`
    )
    .all(settings.active_academic_year, settings.active_semester);

  res.json({ items, settings });
});

// ---------------------------------------------------------------------------
// 7. PENUGASAN, DETAIL TUGAS, PENGUMPULAN, VERIFIKASI, AI ASSISTANT & PENILAIAN
// ---------------------------------------------------------------------------
adminRouter.get('/assignments', (_req, res) => {
  const rows = db.prepare(`SELECT * FROM assignments ORDER BY created_at DESC`).all() as Array<Record<string, unknown>>;
  const items = rows.map((a) => {
    const targets = db
      .prepare(
        `SELECT t.target_type AS targetType, t.target_id AS targetId,
                CASE WHEN t.target_type = 'CLASS' THEN c.name ELSE sp.code || ' - ' || sp.name END AS label
         FROM assignment_targets t
         LEFT JOIN classes c ON t.target_type = 'CLASS' AND c.id = t.target_id
         LEFT JOIN study_programs sp ON t.target_type = 'PRODI' AND sp.id = t.target_id
         WHERE t.assignment_id = ?`
      )
      .all(String(a.id));

    const attachments = db
      .prepare(`SELECT id, file_name AS fileName, storage_path AS storagePath, mime_type AS mimeType, file_size_bytes AS fileSizeBytes FROM assignment_attachments WHERE assignment_id = ?`)
      .all(String(a.id));

    const submissionCount = (
      db.prepare(`SELECT COUNT(*) AS c FROM assignment_submissions WHERE assignment_id = ?`).get(String(a.id)) as {
        c: number;
      }
    ).c;

    const targetStudentCount = (
      db
        .prepare(
          `SELECT COUNT(DISTINCT s.id) AS c
           FROM students s
           JOIN assignment_targets t ON t.assignment_id = ?
           WHERE (t.target_type = 'CLASS' AND t.target_id = s.class_id)
              OR (t.target_type = 'PRODI' AND t.target_id = s.study_program_id)`
        )
        .get(String(a.id)) as { c: number }
    ).c;

    return {
      id: a.id,
      title: a.title,
      description: a.description,
      deadlineUtc: a.deadline_utc,
      allowLate: Number(a.allow_late) === 1,
      lockAfterDeadline: Number(a.lock_after_deadline) === 1,
      allowedFormats: a.allowed_formats,
      maxFileSizeMb: a.max_file_size_mb,
      submissionMethod: a.submission_method,
      externalLink: a.external_link,
      isActive: Number(a.is_active) === 1,
      createdAt: a.created_at,
      targets,
      attachments,
      submissionCount,
      targetStudentCount,
    };
  });
  res.json({ items });
});

adminRouter.post('/assignments', uploadAttachments.array('attachments', 2), (req: AuthenticatedRequest, res) => {
  const {
    title,
    description,
    deadlineUtc,
    allowLate,
    lockAfterDeadline,
    allowedFormats,
    maxFileSizeMb,
    submissionMethod,
    externalLink,
    isActive,
    targetsJson,
  } = req.body as Record<string, string>;

  if (!title?.trim() || !deadlineUtc) {
    res.status(400).json({ error: 'Judul tugas dan deadline wajib diisi.' });
    return;
  }

  let targets: Array<{ targetType: 'CLASS' | 'PRODI'; targetId: string }> = [];
  try {
    targets = JSON.parse(targetsJson || '[]');
  } catch {
    targets = [];
  }
  if (!Array.isArray(targets) || targets.length === 0) {
    res.status(400).json({ error: 'Minimal pilih 1 target kelas atau program studi.' });
    return;
  }

  const files = (req.files as Express.Multer.File[]) ?? [];
  if (files.length > 2) {
    res.status(400).json({ error: 'Maksimal 2 file lampiran per tugas.' });
    return;
  }

  const assignmentId = withTransaction(() => {
    const id = newId();
    db.prepare(
      `INSERT INTO assignments (id, title, description, deadline_utc, allow_late, lock_after_deadline, allowed_formats, max_file_size_mb, submission_method, external_link, is_active, created_by_admin_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      title.trim(),
      description ?? '',
      new Date(deadlineUtc).toISOString(),
      allowLate === 'false' ? 0 : 1,
      lockAfterDeadline === 'true' ? 1 : 0,
      allowedFormats || 'pdf,docx,xlsx,zip,jpg,png',
      Math.max(1, Math.min(100, Number(maxFileSizeMb) || 10)),
      ['TEXT', 'LINK', 'FILE', 'ANY'].includes(submissionMethod) ? submissionMethod : 'ANY',
      (externalLink ?? '').trim(),
      isActive === 'false' ? 0 : 1,
      req.authUser!.id
    );

    const insTarget = db.prepare(
      `INSERT OR IGNORE INTO assignment_targets (id, assignment_id, target_type, target_id) VALUES (?, ?, ?, ?)`
    );
    for (const t of targets) {
      if ((t.targetType === 'CLASS' || t.targetType === 'PRODI') && t.targetId) {
        insTarget.run(newId(), id, t.targetType, t.targetId);
      }
    }

    const insAttach = db.prepare(
      `INSERT INTO assignment_attachments (id, assignment_id, file_name, storage_path, mime_type, file_size_bytes)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    for (const f of files) {
      insAttach.run(
        newId(),
        id,
        f.originalname,
        `assignment-attachments/${f.filename}`,
        f.mimetype || 'application/octet-stream',
        f.size
      );
    }

    // Notify targeted students
    const recipients = db
      .prepare(
        `SELECT DISTINCT s.user_id
         FROM students s
         JOIN assignment_targets t ON t.assignment_id = ?
         WHERE (t.target_type = 'CLASS' AND t.target_id = s.class_id)
            OR (t.target_type = 'PRODI' AND t.target_id = s.study_program_id)`
      )
      .all(id) as { user_id: string }[];

    const insNotif = db.prepare(
      `INSERT INTO notifications (id, recipient_user_id, title, message, category, is_read, related_path, created_at_utc)
       VALUES (?, ?, ?, ?, 'ASSIGNMENT', 0, '/student/assignments', ?)`
    );
    const now = new Date().toISOString();
    for (const rec of recipients) {
      insNotif.run(
        newId(),
        rec.user_id,
        `Tugas Baru: ${title.trim()}`,
        `Deadline: ${formatWibDateTime(new Date(deadlineUtc).toISOString())}`,
        now
      );
    }

    logAdminActivity(req.authUser!.id, 'CREATE_ASSIGNMENT', 'assignments', id, { title: title.trim() });
    return id;
  });

  res.status(201).json({ id: assignmentId });
});

adminRouter.patch('/assignments/:id/toggle', (req: AuthenticatedRequest, res) => {
  const { isActive } = req.body as { isActive: boolean };
  db.prepare(`UPDATE assignments SET is_active = ?, updated_at = ? WHERE id = ?`).run(
    isActive ? 1 : 0,
    new Date().toISOString(),
    req.params.id
  );
  logAdminActivity(req.authUser!.id, 'TOGGLE_ASSIGNMENT', 'assignments', req.params.id, { isActive });
  res.json({ ok: true });
});

adminRouter.delete('/assignments/:id', (req: AuthenticatedRequest, res) => {
  db.prepare(`DELETE FROM assignments WHERE id = ?`).run(req.params.id);
  logAdminActivity(req.authUser!.id, 'DELETE_ASSIGNMENT', 'assignments', req.params.id);
  res.json({ ok: true });
});

adminRouter.get('/assignments/:id/detail', (req, res) => {
  const assignment = db.prepare(`SELECT * FROM assignments WHERE id = ?`).get(req.params.id) as
    | Record<string, unknown>
    | undefined;
  if (!assignment) {
    res.status(404).json({ error: 'Tugas tidak ditemukan.' });
    return;
  }

  const attachments = db
    .prepare(`SELECT id, file_name AS fileName, storage_path AS storagePath, mime_type AS mimeType, file_size_bytes AS fileSizeBytes FROM assignment_attachments WHERE assignment_id = ?`)
    .all(req.params.id);

  const recipients = db
    .prepare(
      `SELECT DISTINCT s.id AS student_id, s.nim, s.full_name, c.name AS class_name, sp.code AS prodi_code,
              sub.id AS submission_id, sub.submitted_at_utc, sub.is_late, sub.revision_count,
              sub.status AS submission_status, sub.is_verified, sub.text_answer, sub.link_url,
              sub.file_name, sub.storage_path, g.score, g.feedback
       FROM students s
       JOIN classes c ON c.id = s.class_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN assignment_targets t ON t.assignment_id = ?
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = t.assignment_id AND sub.student_id = s.id
       LEFT JOIN grades g ON g.submission_id = sub.id
       WHERE (t.target_type = 'CLASS' AND t.target_id = s.class_id)
          OR (t.target_type = 'PRODI' AND t.target_id = s.study_program_id)
       ORDER BY s.full_name ASC`
    )
    .all(req.params.id);

  res.json({ assignment, attachments, recipients });
});

adminRouter.get('/submissions', (req, res) => {
  const search = String(req.query.search ?? '').trim().toLowerCase();
  const assignmentId = String(req.query.assignmentId ?? '').trim();
  const prodiId = String(req.query.prodiId ?? '').trim();
  const classId = String(req.query.classId ?? '').trim();
  const verifiedFilter = String(req.query.verified ?? '').trim(); // 'yes' | 'no'
  const gradedFilter = String(req.query.graded ?? '').trim(); // 'yes' | 'no'

  const where: string[] = ['1=1'];
  const params: string[] = [];

  if (search) {
    where.push('(lower(s.full_name) LIKE ? OR lower(s.nim) LIKE ? OR lower(a.title) LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (assignmentId) {
    where.push('sub.assignment_id = ?');
    params.push(assignmentId);
  }
  if (prodiId) {
    where.push('s.study_program_id = ?');
    params.push(prodiId);
  }
  if (classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }
  if (verifiedFilter === 'yes') where.push('sub.is_verified = 1');
  if (verifiedFilter === 'no') where.push('sub.is_verified = 0');
  if (gradedFilter === 'yes') where.push('g.id IS NOT NULL');
  if (gradedFilter === 'no') where.push('g.id IS NULL');

  const items = db
    .prepare(
      `SELECT sub.*, s.nim, s.full_name AS student_name, sp.code AS study_program_code, c.name AS class_name,
              a.title AS assignment_title, a.deadline_utc,
              g.id AS grade_id, g.score, g.feedback, g.needs_revision, g.graded_at_utc,
              av.checklist_json,
              (SELECT status FROM ai_analyses ai WHERE ai.submission_id = sub.id ORDER BY ai.analyzed_at_utc DESC LIMIT 1) AS latest_ai_status,
              (SELECT match_percentage FROM ai_analyses ai WHERE ai.submission_id = sub.id ORDER BY ai.analyzed_at_utc DESC LIMIT 1) AS latest_ai_match
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       JOIN assignments a ON a.id = sub.assignment_id
       LEFT JOIN grades g ON g.submission_id = sub.id
       LEFT JOIN assignment_verifications av ON av.submission_id = sub.id
       WHERE ${where.join(' AND ')}
       ORDER BY sub.submitted_at_utc DESC`
    )
    .all(...params);

  res.json({ items });
});

adminRouter.get('/submissions/:id', (req, res) => {
  const sub = db
    .prepare(
      `SELECT sub.*, s.nim, s.full_name AS student_name, s.user_id AS student_user_id,
              sp.code AS study_program_code, c.name AS class_name,
              a.title AS assignment_title, a.description AS assignment_description, a.deadline_utc
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.id = ?`
    )
    .get(req.params.id);

  if (!sub) {
    res.status(404).json({ error: 'Pengumpulan tidak ditemukan.' });
    return;
  }

  const revisions = db
    .prepare(`SELECT * FROM submission_revisions WHERE submission_id = ? ORDER BY revision_number DESC`)
    .all(req.params.id);

  const verification = db
    .prepare(`SELECT * FROM assignment_verifications WHERE submission_id = ?`)
    .get(req.params.id);

  const grade = db.prepare(`SELECT * FROM grades WHERE submission_id = ?`).get(req.params.id);
  const gradeHistory = db
    .prepare(
      `SELECT gh.*, u.full_name AS changed_by_name
       FROM grade_history gh
       LEFT JOIN user_profiles u ON u.id = gh.changed_by_admin_id
       WHERE gh.submission_id = ?
       ORDER BY gh.changed_at_utc DESC`
    )
    .all(req.params.id);

  const aiAnalyses = db
    .prepare(`SELECT * FROM ai_analyses WHERE submission_id = ? ORDER BY analyzed_at_utc DESC`)
    .all(req.params.id);

  res.json({ submission: sub, revisions, verification, grade, gradeHistory, aiAnalyses });
});

adminRouter.post('/submissions/:id/verify', (req: AuthenticatedRequest, res) => {
  const { checklist, isVerified, notes } = req.body as {
    checklist: Array<{ label: string; checked: boolean }>;
    isVerified: boolean;
    notes?: string;
  };
  const now = new Date().toISOString();

  withTransaction(() => {
    db.prepare(
      `INSERT INTO assignment_verifications (id, submission_id, checklist_json, is_verified, notes, verified_by_admin_id, verified_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(submission_id) DO UPDATE SET
         checklist_json = excluded.checklist_json,
         is_verified = excluded.is_verified,
         notes = excluded.notes,
         verified_by_admin_id = excluded.verified_by_admin_id,
         verified_at_utc = excluded.verified_at_utc`
    ).run(
      newId(),
      req.params.id,
      JSON.stringify(checklist ?? []),
      isVerified ? 1 : 0,
      (notes ?? '').trim(),
      req.authUser!.id,
      now
    );

    db.prepare(
      `UPDATE assignment_submissions
       SET is_verified = ?, verified_by_admin_id = ?, verified_at_utc = ?,
           status = CASE WHEN status = 'GRADED' THEN 'GRADED' WHEN ? = 1 THEN 'VERIFIED' ELSE status END
       WHERE id = ?`
    ).run(isVerified ? 1 : 0, req.authUser!.id, now, isVerified ? 1 : 0, req.params.id);

    logAdminActivity(req.authUser!.id, 'VERIFY_SUBMISSION', 'assignment_submissions', req.params.id, { isVerified });
  });

  res.json({ ok: true });
});

adminRouter.post('/submissions/:id/grade', (req: AuthenticatedRequest, res) => {
  const { score, feedback, needsRevision } = req.body as {
    score?: number;
    feedback?: string;
    needsRevision?: boolean;
  };

  const numScore = Number(score);
  const cleanFeedback = String(feedback ?? '').trim();

  if (Number.isNaN(numScore) || numScore < 0 || numScore > 100) {
    res.status(400).json({ error: 'Nilai harus berupa angka antara 0 hingga 100.' });
    return;
  }
  if (cleanFeedback.length < 3) {
    res.status(400).json({ error: 'Feedback minimal 3 karakter wajib diisi.' });
    return;
  }

  const sub = db
    .prepare(
      `SELECT sub.*, s.user_id AS student_user_id, a.title AS assignment_title
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.id = ?`
    )
    .get(req.params.id) as
    | { id: string; student_id: string; assignment_id: string; student_user_id: string; assignment_title: string }
    | undefined;

  if (!sub) {
    res.status(404).json({ error: 'Pengumpulan tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  withTransaction(() => {
    const existing = db.prepare(`SELECT * FROM grades WHERE submission_id = ?`).get(sub.id) as
      | { id: string; score: number; feedback: string }
      | undefined;

    let gradeId: string;
    if (existing) {
      gradeId = existing.id;
      db.prepare(
        `UPDATE grades SET score = ?, feedback = ?, needs_revision = ?, graded_by_admin_id = ?, updated_at_utc = ? WHERE id = ?`
      ).run(numScore, cleanFeedback, needsRevision ? 1 : 0, req.authUser!.id, now, gradeId);

      db.prepare(
        `INSERT INTO grade_history (id, grade_id, submission_id, previous_score, new_score, previous_feedback, new_feedback, changed_by_admin_id, changed_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        gradeId,
        sub.id,
        existing.score,
        numScore,
        existing.feedback,
        cleanFeedback,
        req.authUser!.id,
        now
      );
    } else {
      gradeId = newId();
      db.prepare(
        `INSERT INTO grades (id, submission_id, student_id, assignment_id, score, feedback, needs_revision, graded_by_admin_id, graded_at_utc, updated_at_utc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(gradeId, sub.id, sub.student_id, sub.assignment_id, numScore, cleanFeedback, needsRevision ? 1 : 0, req.authUser!.id, now, now);

      db.prepare(
        `INSERT INTO grade_history (id, grade_id, submission_id, previous_score, new_score, previous_feedback, new_feedback, changed_by_admin_id, changed_at_utc)
         VALUES (?, ?, ?, NULL, ?, NULL, ?, ?, ?)`
      ).run(newId(), gradeId, sub.id, numScore, cleanFeedback, req.authUser!.id, now);
    }

    db.prepare(`UPDATE assignment_submissions SET status = ? WHERE id = ?`).run(
      needsRevision ? 'NEEDS_REVISION' : 'GRADED',
      sub.id
    );

    db.prepare(
      `INSERT INTO notifications (id, recipient_user_id, title, message, category, is_read, related_path, created_at_utc)
       VALUES (?, ?, ?, ?, ?, 0, '/student/grades', ?)`
    ).run(
      newId(),
      sub.student_user_id,
      needsRevision ? `Revisi Diperlukan: ${sub.assignment_title}` : `Tugas Dinilai: ${sub.assignment_title}`,
      needsRevision
        ? `Admin meminta revisi pada tugas Anda. Catatan: ${cleanFeedback}`
        : `Nilai Anda: ${numScore}/100. Feedback: ${cleanFeedback}`,
      needsRevision ? 'REVISION' : 'GRADE',
      now
    );

    logAdminActivity(req.authUser!.id, 'GRADE_SUBMISSION', 'grades', gradeId, {
      submissionId: sub.id,
      score: numScore,
      needsRevision: Boolean(needsRevision),
    });
  });

  res.json({ ok: true });
});

adminRouter.post('/submissions/:id/ai-analyze', async (req: AuthenticatedRequest, res) => {
  const sub = db
    .prepare(
      `SELECT sub.*, s.nim, s.full_name AS student_name, a.title AS assignment_title, a.description AS assignment_description
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.id = ?`
    )
    .get(req.params.id) as Record<string, unknown> | undefined;

  if (!sub) {
    res.status(404).json({ error: 'Pengumpulan tidak ditemukan.' });
    return;
  }

  const analysis = await analyzeSubmissionWithGemini({
    assignmentTitle: String(sub.assignment_title),
    assignmentDescription: String(sub.assignment_description ?? ''),
    studentName: String(sub.student_name),
    nim: String(sub.nim),
    textAnswer: String(sub.text_answer ?? ''),
    linkUrl: String(sub.link_url ?? ''),
    fileName: String(sub.file_name ?? ''),
    storagePath: String(sub.storage_path ?? ''),
    mimeType: String(sub.mime_type ?? ''),
  });

  const id = newId();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ai_analyses (id, submission_id, status, file_status, completeness_status, match_percentage, summary, matched_parts_json, unmatched_parts_json, revision_recommendations_json, model_used, analyzed_by_admin_id, analyzed_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(sub.id),
    analysis.status,
    analysis.fileStatus,
    analysis.completenessStatus,
    analysis.matchPercentage,
    analysis.summary,
    JSON.stringify(analysis.matchedParts),
    JSON.stringify(analysis.unmatchedParts),
    JSON.stringify(analysis.revisionRecommendations),
    analysis.modelUsed,
    req.authUser!.id,
    now
  );

  logAdminActivity(req.authUser!.id, 'AI_ANALYZE_SUBMISSION', 'ai_analyses', id, {
    submissionId: sub.id,
    status: analysis.status,
  });

  res.json({ id, ...analysis, analyzedAtUtc: now });
});

// ---------------------------------------------------------------------------
// 8. XP KEAKTIFAN & RANKING
// ---------------------------------------------------------------------------
adminRouter.post('/xp/activity', (req: AuthenticatedRequest, res) => {
  const { studentId, category, notes } = req.body as {
    studentId?: string;
    category?: 'BIASA' | 'KRITIS';
    notes?: string;
  };

  if (!studentId || (category !== 'BIASA' && category !== 'KRITIS')) {
    res.status(400).json({ error: 'Mahasiswa dan kategori keaktifan (Biasa / Kritis) wajib dipilih.' });
    return;
  }

  const student = db.prepare(`SELECT id, user_id, full_name FROM students WHERE id = ?`).get(studentId) as
    | { id: string; user_id: string; full_name: string }
    | undefined;
  if (!student) {
    res.status(404).json({ error: 'Mahasiswa tidak ditemukan.' });
    return;
  }

  const amount = category === 'KRITIS' ? 20 : 10;
  const label = category === 'KRITIS' ? 'Pertanyaan Kritis' : 'Keaktifan Biasa';
  const noteStr = (notes ?? '').trim();
  const desc = noteStr ? `${label}: ${noteStr}` : label;
  const now = new Date().toISOString();

  withTransaction(() => {
    const txId = newId();
    db.prepare(
      `INSERT INTO xp_transactions (id, student_id, amount, source_type, source_id, idempotency_key, description, granted_by_admin_id, created_at_utc)
       VALUES (?, ?, ?, 'ACTIVITY', ?, ?, ?, ?, ?)`
    ).run(txId, student.id, amount, category, `activity:${txId}`, desc, req.authUser!.id, now);

    db.prepare(
      `UPDATE students SET total_xp = COALESCE((SELECT SUM(amount) FROM xp_transactions WHERE student_id = ?), 0), updated_at = ? WHERE id = ?`
    ).run(student.id, now, student.id);

    db.prepare(
      `INSERT INTO notifications (id, recipient_user_id, title, message, category, is_read, related_path, created_at_utc)
       VALUES (?, ?, ?, ?, 'ANNOUNCEMENT', 0, '/student/xp', ?)`
    ).run(
      newId(),
      student.user_id,
      `+${amount} XP Keaktifan`,
      `Anda menerima +${amount} XP (${label})${noteStr ? ` — ${noteStr}` : ''}.`,
      now
    );

    logAdminActivity(req.authUser!.id, 'GRANT_ACTIVITY_XP', 'xp_transactions', txId, {
      studentId: student.id,
      amount,
      category,
    });
  });

  res.status(201).json({ ok: true, amount });
});

adminRouter.get('/xp/transactions', (_req, res) => {
  const items = db
    .prepare(
      `SELECT xt.*, s.nim, s.full_name AS student_name, c.name AS class_name, u.full_name AS granted_by_admin_name
       FROM xp_transactions xt
       JOIN students s ON s.id = xt.student_id
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN user_profiles u ON u.id = xt.granted_by_admin_id
       ORDER BY xt.created_at_utc DESC
       LIMIT 100`
    )
    .all();
  res.json({ items });
});

adminRouter.get('/ranking', (req, res) => {
  const scope = String(req.query.scope ?? 'global'); // global | prodi | class
  const prodiId = String(req.query.prodiId ?? '');
  const classId = String(req.query.classId ?? '');

  const where = [`s.badge != 'AFK'`];
  const params: string[] = [];
  if (scope === 'prodi' && prodiId) {
    where.push('s.study_program_id = ?');
    params.push(prodiId);
  } else if (scope === 'class' && classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }

  const items = db
    .prepare(
      `SELECT s.id, s.nim, s.full_name, s.total_xp, s.current_streak, s.badge,
              sp.code AS study_program_code, c.name AS class_name
       FROM students s
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.total_xp DESC, s.current_streak DESC, s.full_name ASC`
    )
    .all(...params);

  res.json({ items });
});

// ---------------------------------------------------------------------------
// 9. LAPORAN (8 JENIS), PUSAT EKSPOR (5 MODUL), NOTIFIKASI & PENGATURAN
// ---------------------------------------------------------------------------
adminRouter.get('/reports', (req, res) => {
  const type = String(req.query.type ?? 'rekap_mahasiswa');
  const prodiId = String(req.query.prodiId ?? '');
  const classId = String(req.query.classId ?? '');

  const where: string[] = ['1=1'];
  const params: string[] = [];
  if (prodiId) {
    where.push('s.study_program_id = ?');
    params.push(prodiId);
  }
  if (classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }
  const studentFilter = where.join(' AND ');

  if (type === 'rekap_mahasiswa') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, sp.code AS prodi, c.name AS kelas, s.semester, s.badge, s.total_xp, s.current_streak, u.is_active
         FROM students s
         JOIN user_profiles u ON u.id = s.user_id
         JOIN study_programs sp ON sp.id = s.study_program_id
         JOIN classes c ON c.id = s.class_id
         WHERE ${studentFilter}
         ORDER BY s.full_name ASC`
      )
      .all(...params);
    res.json({ type, rows });
    return;
  }

  if (type === 'tugas') {
    const rows = db
      .prepare(
        `SELECT a.title, a.deadline_utc, a.submission_method, a.is_active,
                (SELECT COUNT(*) FROM assignment_submissions sub WHERE sub.assignment_id = a.id) AS total_submissions,
                (SELECT COUNT(*) FROM grades g WHERE g.assignment_id = a.id) AS total_graded
         FROM assignments a
         ORDER BY a.deadline_utc DESC`
      )
      .all();
    res.json({ type, rows });
    return;
  }

  if (type === 'pengumpulan') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, c.name AS kelas, a.title AS tugas, sub.submitted_at_utc, sub.is_verified, sub.revision_count, sub.status
         FROM assignment_submissions sub
         JOIN students s ON s.id = sub.student_id
         JOIN classes c ON c.id = s.class_id
         JOIN assignments a ON a.id = sub.assignment_id
         WHERE ${studentFilter}
         ORDER BY sub.submitted_at_utc DESC`
      )
      .all(...params);
    res.json({ type, rows });
    return;
  }

  if (type === 'keterlambatan') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, c.name AS kelas, a.title AS tugas, a.deadline_utc, sub.submitted_at_utc
         FROM assignment_submissions sub
         JOIN students s ON s.id = sub.student_id
         JOIN classes c ON c.id = s.class_id
         JOIN assignments a ON a.id = sub.assignment_id
         WHERE sub.is_late = 1 AND ${studentFilter}
         ORDER BY sub.submitted_at_utc DESC`
      )
      .all(...params);
    res.json({ type, rows });
    return;
  }

  if (type === 'penilaian') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, c.name AS kelas, a.title AS tugas, g.score, g.feedback, g.needs_revision, g.graded_at_utc
         FROM grades g
         JOIN students s ON s.id = g.student_id
         JOIN classes c ON c.id = s.class_id
         JOIN assignments a ON a.id = g.assignment_id
         WHERE ${studentFilter}
         ORDER BY g.graded_at_utc DESC`
      )
      .all(...params);
    res.json({ type, rows });
    return;
  }

  if (type === 'absensi') {
    const rows = db
      .prepare(
        `SELECT ses.title AS sesi, ses.mode, c.name AS kelas, ar.status, COUNT(*) AS jumlah
         FROM attendance_records ar
         JOIN attendance_sessions ses ON ses.id = ar.session_id
         JOIN classes c ON c.id = ses.class_id
         GROUP BY ses.id, ar.status
         ORDER BY ses.created_at DESC`
      )
      .all();
    res.json({ type, rows });
    return;
  }

  if (type === 'kehadiran_kelas') {
    const rows = db
      .prepare(
        `SELECT c.name AS kelas, sp.code AS prodi,
                COUNT(CASE WHEN ar.status = 'Hadir' THEN 1 END) AS hadir,
                COUNT(CASE WHEN ar.status = 'Izin' THEN 1 END) AS izin,
                COUNT(CASE WHEN ar.status = 'Sakit' THEN 1 END) AS sakit,
                COUNT(CASE WHEN ar.status = 'Alfa' THEN 1 END) AS alfa
         FROM classes c
         JOIN study_programs sp ON sp.id = c.study_program_id
         LEFT JOIN students s ON s.class_id = c.id
         LEFT JOIN attendance_records ar ON ar.student_id = s.id
         GROUP BY c.id
         ORDER BY sp.code ASC, c.name ASC`
      )
      .all();
    res.json({ type, rows });
    return;
  }

  // kehadiran_mahasiswa
  const rows = db
    .prepare(
      `SELECT s.nim, s.full_name, c.name AS kelas,
              COUNT(CASE WHEN ar.status = 'Hadir' THEN 1 END) AS hadir,
              COUNT(CASE WHEN ar.status = 'Izin' THEN 1 END) AS izin,
              COUNT(CASE WHEN ar.status = 'Sakit' THEN 1 END) AS sakit,
              COUNT(CASE WHEN ar.status = 'Alfa' THEN 1 END) AS alfa
       FROM students s
       JOIN classes c ON c.id = s.class_id
       LEFT JOIN attendance_records ar ON ar.student_id = s.id
       WHERE ${studentFilter}
       GROUP BY s.id
       ORDER BY s.full_name ASC`
    )
    .all(...params);
  res.json({ type, rows });
});

adminRouter.get('/export', async (req: AuthenticatedRequest, res) => {
  const moduleType = String(req.query.module ?? 'laporan_lengkap');
  const format = String(req.query.format ?? 'xlsx'); // xlsx | csv
  const prodiId = String(req.query.prodiId ?? '');
  const classId = String(req.query.classId ?? '');
  const studentId = String(req.query.studentId ?? '');

  if (moduleType === 'laporan_lengkap' || format === 'xlsx') {
    const buf = await buildFullReportWorkbook({ prodiId, classId, studentId });
    const filename = `AZRIL_CLAS_${moduleType}_${getWibDateString()}.xlsx`;
    logAdminActivity(req.authUser!.id, 'EXPORT_DATA', 'export', moduleType, { format: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
    return;
  }

  const where: string[] = ['1=1'];
  const params: string[] = [];
  if (prodiId) {
    where.push('s.study_program_id = ?');
    params.push(prodiId);
  }
  if (classId) {
    where.push('s.class_id = ?');
    params.push(classId);
  }
  if (studentId) {
    where.push('s.id = ?');
    params.push(studentId);
  }
  const wSql = where.join(' AND ');

  let csv = '';
  if (moduleType === 'absensi') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, c.name AS kelas, ses.title, ar.status, ar.method, ar.xp_awarded, ar.recorded_at_utc
         FROM attendance_records ar
         JOIN students s ON s.id = ar.student_id
         JOIN classes c ON c.id = s.class_id
         JOIN attendance_sessions ses ON ses.id = ar.session_id
         WHERE ${wSql}`
      )
      .all(...params) as Array<Record<string, unknown>>;
    csv = toCsvString(
      ['NIM', 'Nama', 'Kelas', 'Sesi', 'Status', 'Metode', 'XP', 'Waktu WIB'],
      rows.map((r) => [r.nim, r.full_name, r.kelas, r.title, r.status, r.method, r.xp_awarded, formatWibDateTime(String(r.recorded_at_utc))])
    );
  } else if (moduleType === 'pengumpulan') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, c.name AS kelas, a.title, sub.submitted_at_utc, sub.is_late, sub.is_verified, g.score
         FROM assignment_submissions sub
         JOIN students s ON s.id = sub.student_id
         JOIN classes c ON c.id = s.class_id
         JOIN assignments a ON a.id = sub.assignment_id
         LEFT JOIN grades g ON g.submission_id = sub.id
         WHERE ${wSql}`
      )
      .all(...params) as Array<Record<string, unknown>>;
    csv = toCsvString(
      ['NIM', 'Nama', 'Kelas', 'Tugas', 'Waktu Kumpul WIB', 'Terlambat', 'Terverifikasi', 'Nilai'],
      rows.map((r) => [
        r.nim,
        r.full_name,
        r.kelas,
        r.title,
        formatWibDateTime(String(r.submitted_at_utc)),
        Number(r.is_late) === 1 ? 'Ya' : 'Tidak',
        Number(r.is_verified) === 1 ? 'Ya' : 'Belum',
        r.score ?? '-',
      ])
    );
  } else if (moduleType === 'xp_ranking') {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, sp.code AS prodi, c.name AS kelas, s.total_xp, s.current_streak
         FROM students s
         JOIN study_programs sp ON sp.id = s.study_program_id
         JOIN classes c ON c.id = s.class_id
         WHERE s.badge != 'AFK' AND ${wSql}
         ORDER BY s.total_xp DESC`
      )
      .all(...params) as Array<Record<string, unknown>>;
    csv = toCsvString(
      ['Peringkat', 'NIM', 'Nama', 'Prodi', 'Kelas', 'Total XP', 'Streak'],
      rows.map((r, i) => [i + 1, r.nim, r.full_name, r.prodi, r.kelas, r.total_xp, r.current_streak])
    );
  } else {
    const rows = db
      .prepare(
        `SELECT s.nim, s.full_name, u.username, sp.code AS prodi, c.name AS kelas, s.cohort_year, s.semester, s.badge, u.is_active
         FROM students s
         JOIN user_profiles u ON u.id = s.user_id
         JOIN study_programs sp ON sp.id = s.study_program_id
         JOIN classes c ON c.id = s.class_id
         WHERE ${wSql}`
      )
      .all(...params) as Array<Record<string, unknown>>;
    csv = toCsvString(
      ['NIM', 'Nama', 'Username', 'Prodi', 'Kelas', 'Angkatan', 'Semester', 'Badge', 'Status'],
      rows.map((r) => [
        r.nim,
        r.full_name,
        r.username,
        r.prodi,
        r.kelas,
        r.cohort_year,
        r.semester,
        r.badge,
        Number(r.is_active) === 1 ? 'Aktif' : 'Nonaktif',
      ])
    );
  }

  logAdminActivity(req.authUser!.id, 'EXPORT_DATA', 'export', moduleType, { format: 'csv' });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="AZRIL_CLAS_${moduleType}_${getWibDateString()}.csv"`);
  res.send('\uFEFF' + csv);
});

adminRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
  const filter = String(req.query.filter ?? 'all');
  const where = filter === 'unread' ? 'AND is_read = 0' : '';
  const items = db
    .prepare(
      `SELECT * FROM notifications
       WHERE recipient_user_id = ? ${where}
       ORDER BY created_at_utc DESC
       LIMIT 100`
    )
    .all(req.authUser!.id);
  res.json({ items });
});

adminRouter.patch('/notifications/read-all', (req: AuthenticatedRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?`).run(req.authUser!.id);
  res.json({ ok: true });
});

adminRouter.patch('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?`).run(
    req.params.id,
    req.authUser!.id
  );
  res.json({ ok: true });
});

adminRouter.get('/settings', (_req, res) => {
  const row = db.prepare(`SELECT * FROM academic_settings WHERE id = 1`).get() as Record<string, unknown>;
  res.json({
    institutionName: row.institution_name,
    activeAcademicYear: row.active_academic_year,
    activeSemester: row.active_semester,
    defaultAttendanceDurationMinutes: row.default_attendance_duration_minutes,
    showAiInitialScore: Number(row.show_ai_initial_score) === 1,
    showGlobalRankingToStudents: Number(row.show_global_ranking_to_students) === 1,
    updatedAt: row.updated_at,
  });
});

adminRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const {
    institutionName,
    activeAcademicYear,
    activeSemester,
    defaultAttendanceDurationMinutes,
    showAiInitialScore,
    showGlobalRankingToStudents,
  } = req.body as Record<string, unknown>;

  const duration = Math.max(5, Math.min(180, Number(defaultAttendanceDurationMinutes) || 30));

  db.prepare(
    `UPDATE academic_settings
     SET institution_name = ?, active_academic_year = ?, active_semester = ?,
         default_attendance_duration_minutes = ?, show_ai_initial_score = ?,
         show_global_ranking_to_students = ?, updated_at = ?
     WHERE id = 1`
  ).run(
    String(institutionName ?? 'AZRIL CLAS Academic').trim(),
    String(activeAcademicYear ?? '2026/2027').trim(),
    String(activeSemester ?? 'Ganjil').trim(),
    duration,
    showAiInitialScore === false ? 0 : 1,
    showGlobalRankingToStudents === false ? 0 : 1,
    new Date().toISOString()
  );

  logAdminActivity(req.authUser!.id, 'UPDATE_SETTINGS', 'academic_settings', '1');
  res.json({ ok: true });
});

adminRouter.get('/audit-logs', (_req, res) => {
  const items = db
    .prepare(
      `SELECT al.*, u.full_name AS admin_name, u.username AS admin_username
       FROM admin_activity_logs al
       LEFT JOIN user_profiles u ON u.id = al.admin_user_id
       ORDER BY al.created_at_utc DESC
       LIMIT 100`
    )
    .all();
  res.json({ items });
});
