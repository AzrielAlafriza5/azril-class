import crypto from 'node:crypto';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { requireStudent, type AuthenticatedRequest } from '../auth.ts';
import { db, newId, UPLOADS_DIR, withTransaction } from '../db/database.ts';
import { awardAssignmentSubmissionXp, recalculateStudentAttendanceAndQuotas } from '../services/xpService.ts';
import { getWibDayOfWeek } from '../../shared/time.ts';

export const studentRouter = Router();
studentRouter.use(requireStudent);

const submissionStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, path.join(UPLOADS_DIR, 'assignment-submissions'));
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

const uploadSubmission = multer({
  storage: submissionStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

function verifyQrToken(token: string, sessionId: string, secret: string, expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const parts = token.trim().split(':');
  if (parts.length !== 4 || parts[0] !== 'AZR' || parts[1] !== sessionId) return false;
  const nonce = parts[2];
  const sig = parts[3];
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${sessionId}:${nonce}:${expiresAt}`)
    .digest('hex')
    .slice(0, 16);
  const a = Buffer.from(sig, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// 1. DASHBOARD MAHASISWA
studentRouter.get('/dashboard', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;
  const todayDow = getWibDayOfWeek();

  const todaySchedules = db
    .prepare(
      `SELECT sc.*, c.name AS class_name
       FROM schedules sc
       JOIN classes c ON c.id = sc.class_id
       WHERE sc.class_id = ? AND sc.day_of_week = ? AND sc.is_active = 1
       ORDER BY sc.start_time ASC`
    )
    .all(user.classId!, todayDow);

  const targetedAssignments = db
    .prepare(
      `SELECT DISTINCT a.id, a.title, a.deadline_utc,
              sub.id AS submission_id, sub.status AS submission_status
       FROM assignments a
       JOIN assignment_targets t ON t.assignment_id = a.id
       LEFT JOIN assignment_submissions sub ON sub.assignment_id = a.id AND sub.student_id = ?
       WHERE a.is_active = 1
         AND ((t.target_type = 'CLASS' AND t.target_id = ?) OR (t.target_type = 'PRODI' AND t.target_id = ?))
       ORDER BY a.deadline_utc ASC`
    )
    .all(studentId, user.classId!, user.studyProgramId!) as Array<{
    id: string;
    title: string;
    deadline_utc: string;
    submission_id: string | null;
    submission_status: string | null;
  }>;

  const activeTasksCount = targetedAssignments.filter((t) => !t.submission_id).length;
  const completedTasksCount = targetedAssignments.filter((t) => Boolean(t.submission_id)).length;

  const attSummary = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         COUNT(CASE WHEN status = 'Hadir' THEN 1 END) AS hadir,
         COUNT(CASE WHEN status = 'Izin' THEN 1 END) AS izin,
         COUNT(CASE WHEN status = 'Sakit' THEN 1 END) AS sakit,
         COUNT(CASE WHEN status = 'Alfa' THEN 1 END) AS alfa
       FROM attendance_records
       WHERE student_id = ?`
    )
    .get(studentId) as { total: number; hadir: number; izin: number; sakit: number; alfa: number };

  const openSessions = db
    .prepare(
      `SELECT ses.id, ses.title, ses.mode, ses.close_at_utc,
              ar.id AS my_record_id, ar.status AS my_status
       FROM attendance_sessions ses
       LEFT JOIN attendance_records ar ON ar.session_id = ses.id AND ar.student_id = ?
       WHERE ses.class_id = ? AND ses.status = 'OPEN'
       ORDER BY ses.created_at DESC`
    )
    .all(studentId, user.classId!);

  const unreadNotifCount = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM notifications WHERE recipient_user_id = ? AND is_read = 0`)
      .get(user.id) as { c: number }
  ).c;

  res.json({
    profile: user,
    stats: {
      totalXp: user.totalXp ?? 0,
      currentStreak: user.currentStreak ?? 0,
      longestStreak: user.longestStreak ?? 0,
      activeTasksCount,
      completedTasksCount,
      attendanceRate: attSummary.total > 0 ? Math.round((attSummary.hadir / attSummary.total) * 100) : 100,
      attendanceCounts: attSummary,
      unreadNotifCount,
    },
    todaySchedules,
    openSessions,
    upcomingAssignments: targetedAssignments.slice(0, 5),
  });
});

// 2. JADWAL
studentRouter.get('/schedules', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const items = db
    .prepare(
      `SELECT sc.*, c.name AS class_name, sp.code AS study_program_code
       FROM schedules sc
       JOIN classes c ON c.id = sc.class_id
       JOIN study_programs sp ON sp.id = c.study_program_id
       WHERE sc.class_id = ? AND sc.is_active = 1
       ORDER BY sc.day_of_week ASC, sc.start_time ASC`
    )
    .all(user.classId!);

  const openSessions = db
    .prepare(
      `SELECT ses.*, ar.id AS my_record_id, ar.status AS my_status
       FROM attendance_sessions ses
       LEFT JOIN attendance_records ar ON ar.session_id = ses.id AND ar.student_id = ?
       WHERE ses.class_id = ? AND ses.status = 'OPEN'`
    )
    .all(user.studentId!, user.classId!);

  res.json({ items, openSessions });
});

// 3. ABSENSI MAHASISWA
studentRouter.get('/attendance', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;

  const records = db
    .prepare(
      `SELECT ar.*, ses.title AS session_title, ses.mode, ses.open_at_utc
       FROM attendance_records ar
       JOIN attendance_sessions ses ON ses.id = ar.session_id
       WHERE ar.student_id = ?
       ORDER BY ses.open_at_utc DESC`
    )
    .all(studentId) as Array<{ status: string }>;

  const historical = db
    .prepare(`SELECT week_number, status, xp_awarded, updated_at FROM historical_attendance WHERE student_id = ? ORDER BY week_number ASC`)
    .all(studentId);

  const openSessions = db
    .prepare(
      `SELECT ses.id, ses.title, ses.mode, ses.open_at_utc, ses.close_at_utc,
              ar.id AS my_record_id, ar.status AS my_status
       FROM attendance_sessions ses
       LEFT JOIN attendance_records ar ON ar.session_id = ses.id AND ar.student_id = ?
       WHERE ses.class_id = ? AND ses.status = 'OPEN'
       ORDER BY ses.created_at DESC`
    )
    .all(studentId, user.classId!);

  const settings = db
    .prepare(`SELECT active_academic_year, active_semester FROM academic_settings WHERE id = 1`)
    .get() as { active_academic_year: string; active_semester: string };

  const quota = db
    .prepare(`SELECT izin_used_count, max_xp_izin_count FROM permission_quotas WHERE student_id = ? AND academic_year = ? AND semester = ?`)
    .get(studentId, settings.active_academic_year, settings.active_semester) as
    | { izin_used_count: number; max_xp_izin_count: number }
    | undefined;

  const counts = {
    hadir: records.filter((r) => r.status === 'Hadir').length,
    izin: records.filter((r) => r.status === 'Izin').length,
    sakit: records.filter((r) => r.status === 'Sakit').length,
    alfa: records.filter((r) => r.status === 'Alfa').length,
  };
  const total = records.length;
  const percentage = total > 0 ? Math.round((counts.hadir / total) * 100) : 100;

  res.json({
    summary: { percentage, total, ...counts },
    quota: quota ?? { izin_used_count: 0, max_xp_izin_count: 2 },
    openSessions,
    records,
    historical,
  });
});

studentRouter.post('/attendance/check-in', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;
  const { sessionId } = req.body as { sessionId?: string };

  if (!sessionId) {
    res.status(400).json({ error: 'ID sesi absensi wajib disertakan.' });
    return;
  }

  const ses = db.prepare(`SELECT * FROM attendance_sessions WHERE id = ?`).get(sessionId) as
    | { id: string; class_id: string; mode: string; status: string; close_at_utc: string }
    | undefined;

  if (!ses || ses.class_id !== user.classId) {
    res.status(404).json({ error: 'Sesi absensi tidak ditemukan untuk kelas Anda.' });
    return;
  }
  if (ses.status !== 'OPEN' || new Date(ses.close_at_utc).getTime() < Date.now()) {
    res.status(400).json({ error: 'Sesi absensi sudah ditutup atau melewati batas waktu.' });
    return;
  }
  if (ses.mode !== 'Daring') {
    res.status(400).json({ error: 'Sesi Luring wajib menggunakan Scan QR Code.' });
    return;
  }

  const existing = db
    .prepare(`SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?`)
    .get(ses.id, studentId);
  if (existing) {
    res.status(409).json({ error: 'Anda sudah tercatat pada sesi absensi ini.' });
    return;
  }

  const recalc = withTransaction(() => {
    db.prepare(
      `INSERT INTO attendance_records (id, session_id, student_id, status, recorded_at_utc, method)
       VALUES (?, ?, ?, 'Hadir', ?, 'SELF_ONLINE')`
    ).run(newId(), ses.id, studentId, new Date().toISOString());
    return recalculateStudentAttendanceAndQuotas(studentId);
  });

  res.status(201).json({ ok: true, xpEarned: 20, recalc });
});

studentRouter.post('/attendance/scan-qr', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;
  const { qrToken } = req.body as { qrToken?: string };

  const cleanToken = (qrToken ?? '').trim();
  if (!cleanToken) {
    res.status(400).json({ error: 'Token QR tidak boleh kosong.' });
    return;
  }

  const ses = db.prepare(`SELECT * FROM attendance_sessions WHERE qr_token = ?`).get(cleanToken) as
    | {
        id: string;
        class_id: string;
        mode: string;
        status: string;
        close_at_utc: string;
        qr_secret: string;
        qr_expires_at: string | null;
      }
    | undefined;

  if (!ses || ses.class_id !== user.classId) {
    res.status(404).json({ error: 'QR Code tidak valid atau bukan untuk kelas Anda.' });
    return;
  }
  if (ses.status !== 'OPEN' || new Date(ses.close_at_utc).getTime() < Date.now()) {
    res.status(400).json({ error: 'Sesi absensi sudah ditutup.' });
    return;
  }
  if (ses.qr_expires_at && new Date(ses.qr_expires_at).getTime() < Date.now()) {
    res.status(400).json({ error: 'QR Code sudah kedaluwarsa. Minta Admin menyegarkan QR.' });
    return;
  }
  if (!verifyQrToken(cleanToken, ses.id, ses.qr_secret, ses.qr_expires_at)) {
    res.status(400).json({ error: 'Tanda tangan QR Code tidak valid.' });
    return;
  }

  const existing = db
    .prepare(`SELECT id FROM attendance_records WHERE session_id = ? AND student_id = ?`)
    .get(ses.id, studentId);
  if (existing) {
    res.status(409).json({ error: 'Kehadiran Anda untuk sesi ini sudah tercatat.' });
    return;
  }

  const recalc = withTransaction(() => {
    db.prepare(
      `INSERT INTO attendance_records (id, session_id, student_id, status, recorded_at_utc, method)
       VALUES (?, ?, ?, 'Hadir', ?, 'QR_SCAN')`
    ).run(newId(), ses.id, studentId, new Date().toISOString());
    return recalculateStudentAttendanceAndQuotas(studentId);
  });

  res.status(201).json({ ok: true, xpEarned: 20, recalc });
});

// 4. TUGAS & PENGUMPULAN
studentRouter.get('/assignments', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;

  const rows = db
    .prepare(
      `SELECT DISTINCT a.*
       FROM assignments a
       JOIN assignment_targets t ON t.assignment_id = a.id
       WHERE a.is_active = 1
         AND ((t.target_type = 'CLASS' AND t.target_id = ?) OR (t.target_type = 'PRODI' AND t.target_id = ?))
       ORDER BY a.deadline_utc ASC`
    )
    .all(user.classId!, user.studyProgramId!) as Array<Record<string, unknown>>;

  const items = rows.map((a) => {
    const attachments = db
      .prepare(`SELECT id, file_name AS fileName, storage_path AS storagePath, mime_type AS mimeType, file_size_bytes AS fileSizeBytes FROM assignment_attachments WHERE assignment_id = ?`)
      .all(String(a.id));
    const sub = db
      .prepare(`SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`)
      .get(String(a.id), studentId) as Record<string, unknown> | undefined;

    let grade = null;
    let revisions: unknown[] = [];
    if (sub) {
      grade = db.prepare(`SELECT * FROM grades WHERE submission_id = ?`).get(String(sub.id)) ?? null;
      revisions = db
        .prepare(`SELECT * FROM submission_revisions WHERE submission_id = ? ORDER BY revision_number DESC`)
        .all(String(sub.id));
    }

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
      attachments,
      mySubmission: sub
        ? {
            id: sub.id,
            textAnswer: sub.text_answer,
            linkUrl: sub.link_url,
            fileName: sub.file_name,
            storagePath: sub.storage_path,
            submittedAtUtc: sub.submitted_at_utc,
            isLate: Number(sub.is_late) === 1,
            revisionCount: sub.revision_count,
            status: sub.status,
            isVerified: Number(sub.is_verified) === 1,
            grade,
            revisions,
          }
        : null,
    };
  });

  res.json({ items });
});

studentRouter.post('/assignments/:id/submit', uploadSubmission.single('file'), (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const studentId = user.studentId!;
  const assignmentId = req.params.id;

  const assignment = db
    .prepare(
      `SELECT DISTINCT a.*
       FROM assignments a
       JOIN assignment_targets t ON t.assignment_id = a.id
       WHERE a.id = ? AND a.is_active = 1
         AND ((t.target_type = 'CLASS' AND t.target_id = ?) OR (t.target_type = 'PRODI' AND t.target_id = ?))`
    )
    .get(assignmentId, user.classId!, user.studyProgramId!) as Record<string, unknown> | undefined;

  if (!assignment) {
    res.status(404).json({ error: 'Tugas tidak ditemukan atau tidak ditujukan untuk kelas/prodi Anda.' });
    return;
  }

  const now = new Date();
  const nowUtc = now.toISOString();
  const deadlineMs = new Date(String(assignment.deadline_utc)).getTime();
  const isLate = now.getTime() > deadlineMs;
  const lockAfterDeadline = Number(assignment.lock_after_deadline) === 1;
  const allowLate = Number(assignment.allow_late) === 1;

  if (isLate && (lockAfterDeadline || !allowLate)) {
    res.status(403).json({ error: 'Batas waktu pengumpulan sudah berakhir dan tugas dikunci oleh Admin.' });
    return;
  }

  const { textAnswer, linkUrl, revisionNote } = req.body as {
    textAnswer?: string;
    linkUrl?: string;
    revisionNote?: string;
  };
  const file = req.file;

  if (file) {
    const maxBytes = Number(assignment.max_file_size_mb) * 1024 * 1024;
    if (file.size > maxBytes) {
      res.status(400).json({ error: `Ukuran file melebihi batas maksimal (${assignment.max_file_size_mb} MB).` });
      return;
    }
    const allowed = String(assignment.allowed_formats)
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const ext = path.extname(file.originalname).replace('.', '').toLowerCase();
    if (allowed.length > 0 && ext && !allowed.includes(ext)) {
      res.status(400).json({ error: `Format file .${ext} tidak diizinkan (diizinkan: ${allowed.join(', ')}).` });
      return;
    }
  }

  const cleanText = (textAnswer ?? '').trim();
  const cleanLink = (linkUrl ?? '').trim();
  if (cleanLink && !/^https?:\/\//i.test(cleanLink)) {
    res.status(400).json({ error: 'Link URL/Google Drive harus diawali http:// atau https://' });
    return;
  }

  const existing = db
    .prepare(`SELECT * FROM assignment_submissions WHERE assignment_id = ? AND student_id = ?`)
    .get(assignmentId, studentId) as Record<string, unknown> | undefined;

  if (!cleanText && !cleanLink && !file && !existing) {
    res.status(400).json({ error: 'Minimal sertakan jawaban teks, link URL, atau unggahan file.' });
    return;
  }

  const result = withTransaction(() => {
    let submissionId: string;
    let revisionNumber = 0;

    if (existing) {
      submissionId = String(existing.id);
      revisionNumber = Number(existing.revision_count) + 1;

      // Save previous snapshot into submission_revisions so old submission is never lost
      db.prepare(
        `INSERT INTO submission_revisions (id, submission_id, revision_number, text_answer, link_url, file_name, storage_path, submitted_at_utc, is_late, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        submissionId,
        revisionNumber,
        cleanText || String(existing.text_answer),
        cleanLink || String(existing.link_url),
        file ? file.originalname : String(existing.file_name),
        file ? `assignment-submissions/${file.filename}` : String(existing.storage_path),
        nowUtc,
        isLate ? 1 : 0,
        (revisionNote ?? '').trim()
      );

      db.prepare(
        `UPDATE assignment_submissions
         SET text_answer = ?, link_url = ?,
             file_name = COALESCE(?, file_name),
             storage_path = COALESCE(?, storage_path),
             mime_type = COALESCE(?, mime_type),
             file_size_bytes = COALESCE(?, file_size_bytes),
             submitted_at_utc = ?, is_late = ?, revision_count = ?, status = 'SUBMITTED'
         WHERE id = ?`
      ).run(
        cleanText || String(existing.text_answer),
        cleanLink || String(existing.link_url),
        file ? file.originalname : null,
        file ? `assignment-submissions/${file.filename}` : null,
        file ? file.mimetype : null,
        file ? file.size : null,
        nowUtc,
        isLate ? 1 : 0,
        revisionNumber,
        submissionId
      );
    } else {
      submissionId = newId();
      db.prepare(
        `INSERT INTO assignment_submissions (id, assignment_id, student_id, text_answer, link_url, file_name, storage_path, mime_type, file_size_bytes, submitted_at_utc, is_late, revision_count, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'SUBMITTED')`
      ).run(
        submissionId,
        assignmentId,
        studentId,
        cleanText,
        cleanLink,
        file?.originalname ?? '',
        file ? `assignment-submissions/${file.filename}` : '',
        file?.mimetype ?? '',
        file?.size ?? 0,
        nowUtc,
        isLate ? 1 : 0
      );

      // Record initial snapshot as revision 0
      db.prepare(
        `INSERT INTO submission_revisions (id, submission_id, revision_number, text_answer, link_url, file_name, storage_path, submitted_at_utc, is_late, note)
         VALUES (?, ?, 0, ?, ?, ?, ?, ?, ?, 'Pengumpulan awal')`
      ).run(
        newId(),
        submissionId,
        cleanText,
        cleanLink,
        file?.originalname ?? '',
        file ? `assignment-submissions/${file.filename}` : '',
        nowUtc,
        isLate ? 1 : 0
      );
    }

    const xpEarned = awardAssignmentSubmissionXp({
      studentId,
      assignmentId,
      assignmentTitle: String(assignment.title),
      submittedAtUtc: nowUtc,
      deadlineUtc: String(assignment.deadline_utc),
      isLate,
    });

    // Notify Admins
    const admins = db.prepare(`SELECT id FROM user_profiles WHERE role = 'ADMIN' AND is_active = 1`).all() as {
      id: string;
    }[];
    const insNotif = db.prepare(
      `INSERT INTO notifications (id, recipient_user_id, title, message, category, is_read, related_path, created_at_utc)
       VALUES (?, ?, ?, ?, 'SUBMISSION', 0, '/admin/submissions', ?)`
    );
    for (const adm of admins) {
      insNotif.run(
        newId(),
        adm.id,
        existing ? `Revisi Tugas: ${assignment.title}` : `Pengumpulan Baru: ${assignment.title}`,
        `${user.fullName} (${user.nim}) mengirimkan ${existing ? `revisi ke-${revisionNumber}` : 'jawaban baru'}.`,
        nowUtc
      );
    }

    return { submissionId, revisionNumber, xpEarned, isLate };
  });

  res.status(201).json(result);
});

// 5. NILAI & AI
studentRouter.get('/grades', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const settings = db
    .prepare(`SELECT show_ai_initial_score FROM academic_settings WHERE id = 1`)
    .get() as { show_ai_initial_score: number };
  const showAi = Number(settings.show_ai_initial_score) === 1;

  const submissions = db
    .prepare(
      `SELECT sub.id, sub.assignment_id, sub.submitted_at_utc, sub.is_late, sub.revision_count, sub.status, sub.is_verified,
              a.title AS assignment_title, a.deadline_utc,
              g.id AS grade_id, g.score, g.feedback, g.needs_revision, g.graded_at_utc
       FROM assignment_submissions sub
       JOIN assignments a ON a.id = sub.assignment_id
       LEFT JOIN grades g ON g.submission_id = sub.id
       WHERE sub.student_id = ?
       ORDER BY sub.submitted_at_utc DESC`
    )
    .all(user.studentId!) as Array<Record<string, unknown>>;

  const items = submissions.map((s) => {
    const revisions = db
      .prepare(`SELECT revision_number, submitted_at_utc, is_late, note, file_name, link_url FROM submission_revisions WHERE submission_id = ? ORDER BY revision_number DESC`)
      .all(String(s.id));

    const ai = showAi
      ? db
          .prepare(
            `SELECT status, file_status, completeness_status, match_percentage, summary, matched_parts_json, unmatched_parts_json, revision_recommendations_json, analyzed_at_utc
             FROM ai_analyses WHERE submission_id = ? ORDER BY analyzed_at_utc DESC LIMIT 1`
          )
          .get(String(s.id)) ?? null
      : null;

    return { ...s, revisions, aiAnalysis: ai };
  });

  res.json({ items, showAiInitialScore: showAi });
});

// 6. RIWAYAT XP & STREAK
studentRouter.get('/xp', (req: AuthenticatedRequest, res) => {
  const studentId = req.authUser!.studentId!;
  const student = db
    .prepare(`SELECT total_xp, current_streak, longest_streak, last_login_date_wib FROM students WHERE id = ?`)
    .get(studentId);
  const milestones = db
    .prepare(`SELECT milestone_days, xp_awarded, achieved_at_utc FROM streak_milestones WHERE student_id = ? ORDER BY milestone_days ASC`)
    .all(studentId);
  const transactions = db
    .prepare(
      `SELECT xt.*, u.full_name AS granted_by_admin_name
       FROM xp_transactions xt
       LEFT JOIN user_profiles u ON u.id = xt.granted_by_admin_id
       WHERE xt.student_id = ?
       ORDER BY xt.created_at_utc DESC
       LIMIT 100`
    )
    .all(studentId);

  res.json({ student, milestones, transactions });
});

// 7. RANKING
studentRouter.get('/ranking', (req: AuthenticatedRequest, res) => {
  const user = req.authUser!;
  const scope = String(req.query.scope ?? 'class'); // class | prodi | global
  const settings = db
    .prepare(`SELECT show_global_ranking_to_students FROM academic_settings WHERE id = 1`)
    .get() as { show_global_ranking_to_students: number };
  const allowGlobal = Number(settings.show_global_ranking_to_students) === 1;

  if (scope === 'global' && !allowGlobal) {
    res.status(403).json({ error: 'Ranking Global sedang dinonaktifkan oleh Admin.' });
    return;
  }

  const where = [`s.badge != 'AFK'`];
  const params: string[] = [];
  if (scope === 'class') {
    where.push('s.class_id = ?');
    params.push(user.classId!);
  } else if (scope === 'prodi') {
    where.push('s.study_program_id = ?');
    params.push(user.studyProgramId!);
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
    .all(...params) as Array<{ id: string }>;

  const myPosition = items.findIndex((x) => x.id === user.studentId) + 1;

  res.json({ items, myPosition: myPosition > 0 ? myPosition : null, allowGlobal });
});

// 8. PROFIL
studentRouter.get('/profile', (req: AuthenticatedRequest, res) => {
  res.json({ profile: req.authUser });
});

// 9. NOTIFIKASI
studentRouter.get('/notifications', (req: AuthenticatedRequest, res) => {
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

studentRouter.patch('/notifications/read-all', (req: AuthenticatedRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE recipient_user_id = ?`).run(req.authUser!.id);
  res.json({ ok: true });
});

studentRouter.patch('/notifications/:id/read', (req: AuthenticatedRequest, res) => {
  db.prepare(`UPDATE notifications SET is_read = 1 WHERE id = ? AND recipient_user_id = ?`).run(
    req.params.id,
    req.authUser!.id
  );
  res.json({ ok: true });
});

// 10. PENGATURAN MAHASISWA (PREFERENSI TAMPILAN & NOTIFIKASI, TANPA UBAH PASSWORD/USERNAME)
studentRouter.get('/settings', (req: AuthenticatedRequest, res) => {
  const key = `student_prefs:${req.authUser!.id}`;
  const row = db.prepare(`SELECT setting_value FROM application_settings WHERE setting_key = ?`).get(key) as
    | { setting_value: string }
    | undefined;
  let prefs = { browserNotifications: false, compactTables: false, streakReminderAlert: true };
  if (row) {
    try {
      prefs = { ...prefs, ...JSON.parse(row.setting_value) };
    } catch {
      // ignore
    }
  }
  res.json({ prefs });
});

studentRouter.put('/settings', (req: AuthenticatedRequest, res) => {
  const key = `student_prefs:${req.authUser!.id}`;
  const { browserNotifications, compactTables, streakReminderAlert } = req.body as Record<string, boolean>;
  const prefs = {
    browserNotifications: Boolean(browserNotifications),
    compactTables: Boolean(compactTables),
    streakReminderAlert: streakReminderAlert !== false,
  };
  db.prepare(
    `INSERT INTO application_settings (id, setting_key, setting_value, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`
  ).run(newId(), key, JSON.stringify(prefs), new Date().toISOString());
  res.json({ prefs });
});
