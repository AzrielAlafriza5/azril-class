import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const IS_VERCEL = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
const DATA_DIR = IS_VERCEL
  ? path.join('/tmp', 'azril_clas_data')
  : path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'azril_clas.sqlite');
export const UPLOADS_DIR = IS_VERCEL
  ? path.join('/tmp', 'azril_clas_uploads')
  : path.resolve(process.cwd(), 'uploads');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
for (const bucket of ['assignment-attachments', 'assignment-submissions', 'other-academic-files']) {
  const dir = path.join(UPLOADS_DIR, bucket);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function newId(): string {
  return crypto.randomUUID();
}

export function withTransaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  }
}

export function getSupabaseAdminClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

let dbInitialized = false;

export function initDatabase(): void {
  if (dbInitialized) return;
  dbInitialized = true;
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'MAHASISWA')),
      is_active INTEGER NOT NULL DEFAULT 1,
      last_login_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS user_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at_utc TEXT NOT NULL,
      revoked_at_utc TEXT,
      created_at_utc TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS study_programs (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      faculty TEXT NOT NULL,
      degree_level TEXT NOT NULL DEFAULT 'S1',
      class_quota INTEGER NOT NULL DEFAULT 10,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      study_program_id TEXT NOT NULL REFERENCES study_programs(id) ON DELETE RESTRICT,
      semester INTEGER NOT NULL,
      academic_year TEXT NOT NULL DEFAULT '2026/2027',
      homeroom_lecturer TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (name, study_program_id)
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES user_profiles(id) ON DELETE CASCADE,
      nim TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      study_program_id TEXT NOT NULL REFERENCES study_programs(id) ON DELETE RESTRICT,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      cohort_year INTEGER NOT NULL DEFAULT 2026,
      semester INTEGER NOT NULL DEFAULT 1,
      badge TEXT NOT NULL DEFAULT 'Netral' CHECK (badge IN ('Netral', 'AFK', 'Lulus')),
      total_xp INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_login_date_wib TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS academic_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      institution_name TEXT NOT NULL DEFAULT 'AZRIL CLAS Academic',
      active_academic_year TEXT NOT NULL DEFAULT '2026/2027',
      active_semester TEXT NOT NULL DEFAULT 'Ganjil',
      default_attendance_duration_minutes INTEGER NOT NULL DEFAULT 30,
      show_ai_initial_score INTEGER NOT NULL DEFAULT 1,
      show_global_ranking_to_students INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS application_settings (
      id TEXT PRIMARY KEY,
      setting_key TEXT NOT NULL UNIQUE,
      setting_value TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      course_name TEXT NOT NULL,
      course_code TEXT NOT NULL DEFAULT '',
      lecturer_name TEXT NOT NULL DEFAULT '',
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'Luring' CHECK (mode IN ('Daring', 'Luring')),
      meeting_link TEXT NOT NULL DEFAULT '',
      room_name TEXT NOT NULL DEFAULT '',
      semester INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id TEXT PRIMARY KEY,
      schedule_id TEXT REFERENCES schedules(id) ON DELETE SET NULL,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'Luring' CHECK (mode IN ('Daring', 'Luring')),
      open_at_utc TEXT NOT NULL,
      close_at_utc TEXT NOT NULL,
      qr_secret TEXT NOT NULL,
      qr_token TEXT NOT NULL DEFAULT '',
      qr_expires_at TEXT,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
      created_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alfa')),
      recorded_at_utc TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'ADMIN_MANUAL',
      notes TEXT NOT NULL DEFAULT '',
      correction_reason TEXT NOT NULL DEFAULT '',
      corrected_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      corrected_at_utc TEXT,
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      UNIQUE (session_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS historical_attendance (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      week_number INTEGER NOT NULL CHECK (week_number >= 1),
      status TEXT NOT NULL DEFAULT 'Alfa' CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alfa')),
      xp_awarded INTEGER NOT NULL DEFAULT 0,
      imported_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, week_number)
    );

    CREATE TABLE IF NOT EXISTS permission_quotas (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      academic_year TEXT NOT NULL,
      semester TEXT NOT NULL,
      izin_used_count INTEGER NOT NULL DEFAULT 0,
      max_xp_izin_count INTEGER NOT NULL DEFAULT 2,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, academic_year, semester)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      deadline_utc TEXT NOT NULL,
      allow_late INTEGER NOT NULL DEFAULT 1,
      lock_after_deadline INTEGER NOT NULL DEFAULT 0,
      allowed_formats TEXT NOT NULL DEFAULT 'pdf,docx,xlsx,zip,jpg,png',
      max_file_size_mb INTEGER NOT NULL DEFAULT 10,
      submission_method TEXT NOT NULL DEFAULT 'ANY' CHECK (submission_method IN ('TEXT', 'LINK', 'FILE', 'ANY')),
      external_link TEXT NOT NULL DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignment_targets (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL CHECK (target_type IN ('CLASS', 'PRODI')),
      target_id TEXT NOT NULL,
      UNIQUE (assignment_id, target_type, target_id)
    );

    CREATE TABLE IF NOT EXISTS assignment_attachments (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS assignment_submissions (
      id TEXT PRIMARY KEY,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      text_answer TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      mime_type TEXT NOT NULL DEFAULT '',
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      submitted_at_utc TEXT NOT NULL,
      is_late INTEGER NOT NULL DEFAULT 0,
      revision_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('SUBMITTED', 'NEEDS_REVISION', 'VERIFIED', 'GRADED')),
      is_verified INTEGER NOT NULL DEFAULT 0,
      verified_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      verified_at_utc TEXT,
      UNIQUE (assignment_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS submission_revisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      text_answer TEXT NOT NULL DEFAULT '',
      link_url TEXT NOT NULL DEFAULT '',
      file_name TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      submitted_at_utc TEXT NOT NULL,
      is_late INTEGER NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS assignment_verifications (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      checklist_json TEXT NOT NULL DEFAULT '[]',
      is_verified INTEGER NOT NULL DEFAULT 0,
      notes TEXT NOT NULL DEFAULT '',
      verified_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      verified_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grades (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL UNIQUE REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
      score REAL NOT NULL CHECK (score >= 0 AND score <= 100),
      feedback TEXT NOT NULL,
      needs_revision INTEGER NOT NULL DEFAULT 0,
      graded_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      graded_at_utc TEXT NOT NULL,
      updated_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS grade_history (
      id TEXT PRIMARY KEY,
      grade_id TEXT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
      submission_id TEXT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      previous_score REAL,
      new_score REAL NOT NULL,
      previous_feedback TEXT,
      new_feedback TEXT NOT NULL,
      changed_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      changed_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES assignment_submissions(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'UNAVAILABLE')),
      file_status TEXT NOT NULL DEFAULT '',
      completeness_status TEXT NOT NULL DEFAULT '',
      match_percentage INTEGER,
      summary TEXT NOT NULL DEFAULT '',
      matched_parts_json TEXT NOT NULL DEFAULT '[]',
      unmatched_parts_json TEXT NOT NULL DEFAULT '[]',
      revision_recommendations_json TEXT NOT NULL DEFAULT '[]',
      model_used TEXT NOT NULL DEFAULT '',
      analyzed_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      analyzed_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS xp_transactions (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      granted_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      created_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS student_streaks (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL UNIQUE REFERENCES students(id) ON DELETE CASCADE,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_login_date_wib TEXT,
      updated_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS streak_milestones (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      milestone_days INTEGER NOT NULL,
      xp_awarded INTEGER NOT NULL,
      achieved_at_utc TEXT NOT NULL,
      UNIQUE (student_id, milestone_days)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_user_id TEXT NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'SYSTEM',
      is_read INTEGER NOT NULL DEFAULT 0,
      related_path TEXT NOT NULL DEFAULT '',
      created_at_utc TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admin_activity_logs (
      id TEXT PRIMARY KEY,
      admin_user_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at_utc TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_students_prodi ON students(study_program_id);
    CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
    CREATE INDEX IF NOT EXISTS idx_students_xp ON students(total_xp DESC);
    CREATE INDEX IF NOT EXISTS idx_att_records_session ON attendance_records(session_id);
    CREATE INDEX IF NOT EXISTS idx_att_records_student ON attendance_records(student_id);
    CREATE INDEX IF NOT EXISTS idx_assign_targets ON assignment_targets(target_type, target_id);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(recipient_user_id, is_read);
  `);

  // Seed ONLY system reference settings & official 3 study programs (NEVER fake students)
  db.prepare(
    `INSERT OR IGNORE INTO academic_settings (id, institution_name, active_academic_year, active_semester, default_attendance_duration_minutes, show_ai_initial_score, show_global_ranking_to_students)
     VALUES (1, 'AZRIL CLAS Academic', '2026/2027', 'Ganjil', 30, 1, 1)`
  ).run();

  const defaultProdis = [
    {
      code: 'HES',
      name: 'Hukum Ekonomi Syariah',
      faculty: 'Fakultas Syariah dan Hukum',
      degree_level: 'S1',
      class_quota: 10,
    },
    {
      code: 'PJKR',
      name: 'Pendidikan Jasmani, Kesehatan, dan Rekreasi',
      faculty: 'Fakultas Keguruan dan Ilmu Pendidikan',
      degree_level: 'S1',
      class_quota: 10,
    },
    {
      code: 'FARMASI',
      name: 'Farmasi',
      faculty: 'Fakultas Ilmu Kesehatan',
      degree_level: 'S1',
      class_quota: 10,
    },
  ];

  const insertProdi = db.prepare(
    `INSERT OR IGNORE INTO study_programs (id, code, name, faculty, degree_level, class_quota)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  for (const p of defaultProdis) {
    insertProdi.run(newId(), p.code, p.name, p.faculty, p.degree_level, p.class_quota);
  }

  // Migrate existing SQLite historical_attendance table if it still enforces BETWEEN 1 AND 8
  const histTableSql = (
    db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'historical_attendance'`)
      .get() as { sql?: string } | undefined
  )?.sql;
  if (histTableSql && /BETWEEN\s+1\s+AND\s+8/i.test(histTableSql)) {
    db.exec('PRAGMA foreign_keys = OFF;');
    try {
      withTransaction(() => {
        db.exec(`
          CREATE TABLE historical_attendance_migrated (
            id TEXT PRIMARY KEY,
            student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
            week_number INTEGER NOT NULL CHECK (week_number >= 1),
            status TEXT NOT NULL DEFAULT 'Alfa' CHECK (status IN ('Hadir', 'Izin', 'Sakit', 'Alfa')),
            xp_awarded INTEGER NOT NULL DEFAULT 0,
            imported_by_admin_id TEXT REFERENCES user_profiles(id) ON DELETE SET NULL,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE (student_id, week_number)
          );
          INSERT INTO historical_attendance_migrated (id, student_id, week_number, status, xp_awarded, imported_by_admin_id, updated_at)
          SELECT id, student_id, week_number, status, xp_awarded, imported_by_admin_id, updated_at FROM historical_attendance;
          DROP TABLE historical_attendance;
          ALTER TABLE historical_attendance_migrated RENAME TO historical_attendance;
        `);
      });
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }
}
