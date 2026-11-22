-- Migration: Remove 8-week upper limit on historical_attendance
ALTER TABLE public.historical_attendance
  DROP CONSTRAINT IF EXISTS historical_attendance_week_number_check;

ALTER TABLE public.historical_attendance
  ADD CONSTRAINT historical_attendance_week_number_check CHECK (week_number >= 1);
