-- ============================================================================
-- AZRIL CLAS WEB APPLICATION — BRAND NEW SUPABASE POSTGRESQL SCHEMA
-- Independent database from scratch. Do NOT link or migrate legacy data.
-- Timezone reference: Asia/Jakarta (WIB / UTC+7)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- ----------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('ADMIN', 'MAHASISWA');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE student_badge AS ENUM ('Netral', 'AFK', 'Lulus');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE class_mode AS ENUM ('Daring', 'Luring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_status AS ENUM ('Hadir', 'Izin', 'Sakit', 'Alfa');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE attendance_method AS ENUM ('SELF_ONLINE', 'QR_SCAN', 'ADMIN_MANUAL', 'HISTORICAL_IMPORT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE session_status AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_method AS ENUM ('TEXT', 'LINK', 'FILE', 'ANY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE submission_status AS ENUM ('SUBMITTED', 'NEEDS_REVISION', 'VERIFIED', 'GRADED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE xp_source_type AS ENUM (
    'DAILY_LOGIN',
    'STREAK_BONUS',
    'ATTENDANCE',
    'HISTORICAL_ATTENDANCE',
    'ASSIGNMENT',
    'ACTIVITY',
    'CORRECTION'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----------------------------------------------------------------------------
-- 2. CORE USER & ACADEMIC TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'MAHASISWA',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.study_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  faculty TEXT NOT NULL,
  degree_level TEXT NOT NULL DEFAULT 'S1',
  class_quota INTEGER NOT NULL DEFAULT 10 CHECK (class_quota > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  study_program_id UUID NOT NULL REFERENCES public.study_programs(id) ON DELETE RESTRICT,
  semester INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 14),
  academic_year TEXT NOT NULL DEFAULT '2026/2027',
  homeroom_lecturer TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, study_program_id)
);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  nim TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  study_program_id UUID NOT NULL REFERENCES public.study_programs(id) ON DELETE RESTRICT,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  cohort_year INTEGER NOT NULL DEFAULT 2026,
  semester INTEGER NOT NULL DEFAULT 1 CHECK (semester BETWEEN 1 AND 14),
  badge student_badge NOT NULL DEFAULT 'Netral',
  total_xp INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date_wib DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.academic_settings (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  institution_name TEXT NOT NULL DEFAULT 'AZRIL CLAS Academic',
  active_academic_year TEXT NOT NULL DEFAULT '2026/2027',
  active_semester TEXT NOT NULL DEFAULT 'Ganjil',
  default_attendance_duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (default_attendance_duration_minutes BETWEEN 5 AND 180),
  show_ai_initial_score BOOLEAN NOT NULL DEFAULT TRUE,
  show_global_ranking_to_students BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.application_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. SCHEDULES & ATTENDANCE TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_name TEXT NOT NULL,
  course_code TEXT NOT NULL DEFAULT '',
  lecturer_name TEXT NOT NULL DEFAULT '',
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  mode class_mode NOT NULL DEFAULT 'Luring',
  meeting_link TEXT DEFAULT '',
  room_name TEXT DEFAULT '',
  semester INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID REFERENCES public.schedules(id) ON DELETE SET NULL,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode class_mode NOT NULL DEFAULT 'Luring',
  open_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  close_at_utc TIMESTAMPTZ NOT NULL,
  qr_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  qr_token TEXT NOT NULL DEFAULT '',
  qr_expires_at TIMESTAMPTZ,
  status session_status NOT NULL DEFAULT 'OPEN',
  created_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status attendance_status NOT NULL,
  recorded_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  method attendance_method NOT NULL DEFAULT 'ADMIN_MANUAL',
  notes TEXT DEFAULT '',
  correction_reason TEXT DEFAULT '',
  corrected_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  corrected_at_utc TIMESTAMPTZ,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  UNIQUE (session_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.historical_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  week_number SMALLINT NOT NULL CHECK (week_number BETWEEN 1 AND 8),
  status attendance_status NOT NULL DEFAULT 'Alfa',
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  imported_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, week_number)
);

CREATE TABLE IF NOT EXISTS public.permission_quotas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  academic_year TEXT NOT NULL,
  semester TEXT NOT NULL,
  izin_used_count INTEGER NOT NULL DEFAULT 0,
  max_xp_izin_count INTEGER NOT NULL DEFAULT 2,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year, semester)
);

-- ----------------------------------------------------------------------------
-- 4. ASSIGNMENTS, SUBMISSIONS, VERIFICATION & GRADING
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  deadline_utc TIMESTAMPTZ NOT NULL,
  allow_late BOOLEAN NOT NULL DEFAULT TRUE,
  lock_after_deadline BOOLEAN NOT NULL DEFAULT FALSE,
  allowed_formats TEXT NOT NULL DEFAULT 'pdf,docx,xlsx,zip,jpg,png',
  max_file_size_mb INTEGER NOT NULL DEFAULT 10 CHECK (max_file_size_mb BETWEEN 1 AND 100),
  submission_method submission_method NOT NULL DEFAULT 'ANY',
  external_link TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assignment_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('CLASS', 'PRODI')),
  target_id UUID NOT NULL,
  UNIQUE (assignment_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS public.assignment_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  text_answer TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  mime_type TEXT DEFAULT '',
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  submitted_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  revision_count INTEGER NOT NULL DEFAULT 0,
  status submission_status NOT NULL DEFAULT 'SUBMITTED',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  verified_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  verified_at_utc TIMESTAMPTZ,
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.submission_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL,
  text_answer TEXT DEFAULT '',
  link_url TEXT DEFAULT '',
  file_name TEXT DEFAULT '',
  storage_path TEXT DEFAULT '',
  submitted_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_late BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.assignment_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL UNIQUE REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  checklist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT DEFAULT '',
  verified_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  verified_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL UNIQUE REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  score NUMERIC(5,2) NOT NULL CHECK (score >= 0 AND score <= 100),
  feedback TEXT NOT NULL CHECK (char_length(trim(feedback)) >= 3),
  needs_revision BOOLEAN NOT NULL DEFAULT FALSE,
  graded_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  graded_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.grade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grade_id UUID NOT NULL REFERENCES public.grades(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  previous_score NUMERIC(5,2),
  new_score NUMERIC(5,2) NOT NULL,
  previous_feedback TEXT,
  new_feedback TEXT NOT NULL,
  changed_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  changed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES public.assignment_submissions(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'UNAVAILABLE')),
  file_status TEXT DEFAULT '',
  completeness_status TEXT DEFAULT '',
  match_percentage INTEGER CHECK (match_percentage BETWEEN 0 AND 100),
  summary TEXT DEFAULT '',
  matched_parts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  unmatched_parts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  revision_recommendations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_used TEXT DEFAULT '',
  analyzed_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  analyzed_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 5. GAMIFICATION, STREAKS, NOTIFICATIONS & AUDIT LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.xp_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  source_type xp_source_type NOT NULL,
  source_id TEXT DEFAULT '',
  idempotency_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  granted_by_admin_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.student_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date_wib DATE,
  updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.streak_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  milestone_days INTEGER NOT NULL CHECK (milestone_days IN (3, 7, 14, 30)),
  xp_awarded INTEGER NOT NULL,
  achieved_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, milestone_days)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id UUID NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'SYSTEM',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  related_path TEXT DEFAULT '',
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.admin_activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT DEFAULT '',
  details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 6. INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_students_prodi ON public.students(study_program_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_badge ON public.students(badge);
CREATE INDEX IF NOT EXISTS idx_students_xp_desc ON public.students(total_xp DESC);
CREATE INDEX IF NOT EXISTS idx_schedules_class_day ON public.schedules(class_id, day_of_week);
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class ON public.attendance_sessions(class_id, status);
CREATE INDEX IF NOT EXISTS idx_attendance_records_student ON public.attendance_records(student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_targets_lookup ON public.assignment_targets(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON public.assignment_submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student ON public.assignment_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_xp_transactions_student ON public.xp_transactions(student_id, created_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON public.notifications(recipient_user_id, is_read, created_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_activity_logs(created_at_utc DESC);

-- ----------------------------------------------------------------------------
-- 7. FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_student_total_xp()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_student_id UUID;
BEGIN
  target_student_id := COALESCE(NEW.student_id, OLD.student_id);
  UPDATE public.students
  SET total_xp = COALESCE((
    SELECT SUM(amount) FROM public.xp_transactions WHERE student_id = target_student_id
  ), 0),
  updated_at = NOW()
  WHERE id = target_student_id;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_xp_transactions_sync ON public.xp_transactions;
CREATE TRIGGER trg_xp_transactions_sync
AFTER INSERT OR UPDATE OR DELETE ON public.xp_transactions
FOR EACH ROW EXECUTE FUNCTION public.sync_student_total_xp();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles
    WHERE auth_user_id = auth.uid()
      AND role = 'ADMIN'
      AND is_active = TRUE
  );
$$;

CREATE OR REPLACE FUNCTION public.current_student_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT s.id
  FROM public.students s
  JOIN public.user_profiles up ON up.id = s.user_id
  WHERE up.auth_user_id = auth.uid()
    AND up.is_active = TRUE
  LIMIT 1;
$$;

-- ----------------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historical_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_quotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submission_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignment_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streak_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admin full access across operational tables
CREATE POLICY admin_all_profiles ON public.user_profiles FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_prodi ON public.study_programs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_classes ON public.classes FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_students ON public.students FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_settings ON public.academic_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_app_settings ON public.application_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_schedules ON public.schedules FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_att_sessions ON public.attendance_sessions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_att_records ON public.attendance_records FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_hist_att ON public.historical_attendance FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_perm_quotas ON public.permission_quotas FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_assignments ON public.assignments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_assign_targets ON public.assignment_targets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_assign_attach ON public.assignment_attachments FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_submissions ON public.assignment_submissions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_revisions ON public.submission_revisions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_verifications ON public.assignment_verifications FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_grades ON public.grades FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_grade_history ON public.grade_history FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_ai_analyses ON public.ai_analyses FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_xp ON public.xp_transactions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_streaks ON public.student_streaks FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_milestones ON public.streak_milestones FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_notifications ON public.notifications FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY admin_all_logs ON public.admin_activity_logs FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Student scoped read/write policies (strict ownership, no cross-account writes)
CREATE POLICY student_read_own_profile ON public.user_profiles FOR SELECT USING (auth_user_id = auth.uid());
CREATE POLICY student_read_prodi ON public.study_programs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY student_read_classes ON public.classes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY student_read_settings ON public.academic_settings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY student_read_students_for_ranking ON public.students FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY student_read_class_schedules ON public.schedules FOR SELECT USING (
  class_id = (SELECT class_id FROM public.students WHERE id = public.current_student_id())
);
CREATE POLICY student_read_class_sessions ON public.attendance_sessions FOR SELECT USING (
  class_id = (SELECT class_id FROM public.students WHERE id = public.current_student_id())
);
CREATE POLICY student_read_own_attendance ON public.attendance_records FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_insert_own_attendance ON public.attendance_records FOR INSERT WITH CHECK (student_id = public.current_student_id());
CREATE POLICY student_read_own_hist_att ON public.historical_attendance FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_quota ON public.permission_quotas FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_targeted_assignments ON public.assignments FOR SELECT USING (
  is_active = TRUE AND EXISTS (
    SELECT 1 FROM public.assignment_targets t
    JOIN public.students s ON s.id = public.current_student_id()
    WHERE t.assignment_id = assignments.id
      AND ((t.target_type = 'CLASS' AND t.target_id = s.class_id)
        OR (t.target_type = 'PRODI' AND t.target_id = s.study_program_id))
  )
);
CREATE POLICY student_read_own_submissions ON public.assignment_submissions FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_upsert_own_submissions ON public.assignment_submissions FOR INSERT WITH CHECK (student_id = public.current_student_id());
CREATE POLICY student_update_own_submissions ON public.assignment_submissions FOR UPDATE USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_grades ON public.grades FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_xp ON public.xp_transactions FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_streaks ON public.student_streaks FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_milestones ON public.streak_milestones FOR SELECT USING (student_id = public.current_student_id());
CREATE POLICY student_read_own_notifications ON public.notifications FOR SELECT USING (
  recipient_user_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
);
CREATE POLICY student_update_own_notifications ON public.notifications FOR UPDATE USING (
  recipient_user_id = (SELECT id FROM public.user_profiles WHERE auth_user_id = auth.uid())
);

-- ----------------------------------------------------------------------------
-- 9. SUPABASE STORAGE PRIVATE BUCKETS & ACCESS POLICIES
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('assignment-attachments', 'assignment-attachments', FALSE),
  ('assignment-submissions', 'assignment-submissions', FALSE),
  ('other-academic-files', 'other-academic-files', FALSE)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY storage_admin_all ON storage.objects
FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY storage_student_read_attachments ON storage.objects
FOR SELECT USING (bucket_id = 'assignment-attachments' AND auth.uid() IS NOT NULL);

CREATE POLICY storage_student_own_submissions ON storage.objects
FOR ALL USING (
  bucket_id = 'assignment-submissions'
  AND (storage.foldername(name))[1] = public.current_student_id()::TEXT
) WITH CHECK (
  bucket_id = 'assignment-submissions'
  AND (storage.foldername(name))[1] = public.current_student_id()::TEXT
);

-- ----------------------------------------------------------------------------
-- 10. INITIAL SYSTEM REFERENCE DATA (NO FAKE STUDENTS)
-- ----------------------------------------------------------------------------
INSERT INTO public.academic_settings (id, institution_name, active_academic_year, active_semester)
VALUES (1, 'AZRIL CLAS Academic', '2026/2027', 'Ganjil')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.study_programs (code, name, faculty, degree_level, class_quota)
VALUES
  ('HES', 'Hukum Ekonomi Syariah', 'Fakultas Syariah dan Hukum', 'S1', 10),
  ('PJKR', 'Pendidikan Jasmani, Kesehatan, dan Rekreasi', 'Fakultas Keguruan dan Ilmu Pendidikan', 'S1', 10),
  ('FARMASI', 'Farmasi', 'Fakultas Ilmu Kesehatan', 'S1', 10)
ON CONFLICT (code) DO NOTHING;
