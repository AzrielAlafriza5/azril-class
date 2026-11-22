import { db, newId } from '../db/database.ts';
import { getWibDateString } from '../../shared/time.ts';
import type { AttendanceStatus, XpSourceType } from '../../shared/types.ts';

const STREAK_MILESTONES: Record<number, number> = {
  3: 10,
  7: 30,
  14: 50,
  30: 100,
};

export function syncStudentTotalXp(studentId: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(amount), 0) AS total FROM xp_transactions WHERE student_id = ?`)
    .get(studentId) as { total: number };
  const total = Math.max(0, Number(row.total));
  db.prepare(`UPDATE students SET total_xp = ?, updated_at = ? WHERE id = ?`).run(
    total,
    new Date().toISOString(),
    studentId
  );
  return total;
}

export function insertXpTransactionIdempotent(params: {
  studentId: string;
  amount: number;
  sourceType: XpSourceType;
  sourceId: string;
  idempotencyKey: string;
  description: string;
  grantedByAdminId?: string | null;
}): boolean {
  const existing = db
    .prepare(`SELECT id, amount FROM xp_transactions WHERE idempotency_key = ?`)
    .get(params.idempotencyKey) as { id: string; amount: number } | undefined;

  if (existing) {
    return false;
  }

  db.prepare(
    `INSERT INTO xp_transactions (id, student_id, amount, source_type, source_id, idempotency_key, description, granted_by_admin_id, created_at_utc)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    newId(),
    params.studentId,
    params.amount,
    params.sourceType,
    params.sourceId,
    params.idempotencyKey,
    params.description,
    params.grantedByAdminId ?? null,
    new Date().toISOString()
  );
  syncStudentTotalXp(params.studentId);
  return true;
}

export function upsertXpTransactionByKey(params: {
  studentId: string;
  amount: number;
  sourceType: XpSourceType;
  sourceId: string;
  idempotencyKey: string;
  description: string;
  grantedByAdminId?: string | null;
}): void {
  const existing = db
    .prepare(`SELECT id FROM xp_transactions WHERE idempotency_key = ?`)
    .get(params.idempotencyKey) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE xp_transactions
       SET amount = ?, description = ?, granted_by_admin_id = ?
       WHERE id = ?`
    ).run(params.amount, params.description, params.grantedByAdminId ?? null, existing.id);
  } else {
    db.prepare(
      `INSERT INTO xp_transactions (id, student_id, amount, source_type, source_id, idempotency_key, description, granted_by_admin_id, created_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      newId(),
      params.studentId,
      params.amount,
      params.sourceType,
      params.sourceId,
      params.idempotencyKey,
      params.description,
      params.grantedByAdminId ?? null,
      new Date().toISOString()
    );
  }
  syncStudentTotalXp(params.studentId);
}

function getPreviousWibDate(wibDateStr: string): string {
  const dt = new Date(`${wibDateStr}T00:00:00+07:00`);
  dt.setUTCDate(dt.getUTCDate() - 1);
  return getWibDateString(dt);
}

export function awardDailyLoginAndStreak(studentId: string, userId: string): {
  xpAwarded: number;
  streakBonusAwarded: number;
  currentStreak: number;
  longestStreak: number;
} {
  const todayWib = getWibDateString();
  const yesterdayWib = getPreviousWibDate(todayWib);
  const nowUtc = new Date().toISOString();

  const student = db
    .prepare(`SELECT current_streak, longest_streak, last_login_date_wib FROM students WHERE id = ?`)
    .get(studentId) as {
    current_streak: number;
    longest_streak: number;
    last_login_date_wib: string | null;
  };

  let currentStreak = student.current_streak;
  let longestStreak = student.longest_streak;
  let xpAwarded = 0;
  let streakBonusAwarded = 0;

  if (student.last_login_date_wib !== todayWib) {
    if (student.last_login_date_wib === yesterdayWib) {
      currentStreak += 1;
    } else {
      currentStreak = 1;
    }
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    db.prepare(
      `UPDATE students SET current_streak = ?, longest_streak = ?, last_login_date_wib = ?, updated_at = ? WHERE id = ?`
    ).run(currentStreak, longestStreak, todayWib, nowUtc, studentId);

    db.prepare(
      `INSERT INTO student_streaks (id, student_id, current_streak, longest_streak, last_login_date_wib, updated_at_utc)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(student_id) DO UPDATE SET
         current_streak = excluded.current_streak,
         longest_streak = excluded.longest_streak,
         last_login_date_wib = excluded.last_login_date_wib,
         updated_at_utc = excluded.updated_at_utc`
    ).run(newId(), studentId, currentStreak, longestStreak, todayWib, nowUtc);

    const insertedLogin = insertXpTransactionIdempotent({
      studentId,
      amount: 5,
      sourceType: 'DAILY_LOGIN',
      sourceId: todayWib,
      idempotencyKey: `login:${studentId}:${todayWib}`,
      description: `Login harian (${todayWib} WIB)`,
    });
    if (insertedLogin) {
      xpAwarded += 5;
    }

    const milestoneBonus = STREAK_MILESTONES[currentStreak];
    if (milestoneBonus) {
      const existingMilestone = db
        .prepare(`SELECT id FROM streak_milestones WHERE student_id = ? AND milestone_days = ?`)
        .get(studentId, currentStreak);
      if (!existingMilestone) {
        db.prepare(
          `INSERT INTO streak_milestones (id, student_id, milestone_days, xp_awarded, achieved_at_utc)
           VALUES (?, ?, ?, ?, ?)`
        ).run(newId(), studentId, currentStreak, milestoneBonus, nowUtc);

        const insertedBonus = insertXpTransactionIdempotent({
          studentId,
          amount: milestoneBonus,
          sourceType: 'STREAK_BONUS',
          sourceId: String(currentStreak),
          idempotencyKey: `streak_milestone:${studentId}:${currentStreak}`,
          description: `Bonus Streak Login ${currentStreak} Hari Berturut-turut`,
        });
        if (insertedBonus) {
          streakBonusAwarded += milestoneBonus;
          db.prepare(
            `INSERT INTO notifications (id, recipient_user_id, title, message, category, is_read, related_path, created_at_utc)
             VALUES (?, ?, ?, ?, 'STREAK', 0, '/student/xp', ?)`
          ).run(
            newId(),
            userId,
            `Milestone Streak ${currentStreak} Hari!`,
            `Selamat! Anda mempertahankan login ${currentStreak} hari berturut-turut dan memperoleh bonus +${milestoneBonus} XP.`,
            nowUtc
          );
        }
      }
    }
  }

  return { xpAwarded, streakBonusAwarded, currentStreak, longestStreak };
}

/**
 * Recalculates ALL attendance + historical attendance XP and semester permission quotas
 * deterministically for a student so corrections and historical imports stay 100% consistent.
 */
export function recalculateStudentAttendanceAndQuotas(studentId: string, adminUserId?: string | null): {
  izinUsed: number;
  totalAttendanceXp: number;
} {
  const settings = db
    .prepare(`SELECT active_academic_year, active_semester FROM academic_settings WHERE id = 1`)
    .get() as { active_academic_year: string; active_semester: string };

  let izinCount = 0;
  let totalAttendanceXp = 0;

  // 1. Historical attendance Weeks 1..8 ordered chronologically by week_number
  const historicalRows = db
    .prepare(
      `SELECT id, week_number, status
       FROM historical_attendance
       WHERE student_id = ?
       ORDER BY week_number ASC`
    )
    .all(studentId) as { id: string; week_number: number; status: AttendanceStatus }[];

  for (const h of historicalRows) {
    let xp = 0;
    if (h.status === 'Hadir') {
      xp = 20;
    } else if (h.status === 'Izin') {
      izinCount += 1;
      xp = izinCount <= 2 ? 10 : 0;
    }
    totalAttendanceXp += xp;
    db.prepare(`UPDATE historical_attendance SET xp_awarded = ? WHERE id = ?`).run(xp, h.id);
    upsertXpTransactionByKey({
      studentId,
      amount: xp,
      sourceType: 'HISTORICAL_ATTENDANCE',
      sourceId: `week_${h.week_number}`,
      idempotencyKey: `hist:${studentId}:w${h.week_number}`,
      description: `Histori Absensi Minggu ${h.week_number} (${h.status})`,
      grantedByAdminId: adminUserId ?? null,
    });
  }

  // 2. Regular attendance records ordered chronologically by session open_at_utc
  const regularRows = db
    .prepare(
      `SELECT ar.id, ar.session_id, ar.status, s.title AS session_title
       FROM attendance_records ar
       JOIN attendance_sessions s ON s.id = ar.session_id
       WHERE ar.student_id = ?
       ORDER BY s.open_at_utc ASC, ar.recorded_at_utc ASC`
    )
    .all(studentId) as {
    id: string;
    session_id: string;
    status: AttendanceStatus;
    session_title: string;
  }[];

  for (const r of regularRows) {
    let xp = 0;
    if (r.status === 'Hadir') {
      xp = 20;
    } else if (r.status === 'Izin') {
      izinCount += 1;
      xp = izinCount <= 2 ? 10 : 0;
    }
    totalAttendanceXp += xp;
    db.prepare(`UPDATE attendance_records SET xp_awarded = ? WHERE id = ?`).run(xp, r.id);
    upsertXpTransactionByKey({
      studentId,
      amount: xp,
      sourceType: 'ATTENDANCE',
      sourceId: r.session_id,
      idempotencyKey: `att:${r.session_id}:${studentId}`,
      description: `Absensi ${r.session_title} (${r.status})`,
      grantedByAdminId: adminUserId ?? null,
    });
  }

  // 3. Upsert permission_quotas
  db.prepare(
    `INSERT INTO permission_quotas (id, student_id, academic_year, semester, izin_used_count, max_xp_izin_count, updated_at)
     VALUES (?, ?, ?, ?, ?, 2, ?)
     ON CONFLICT(student_id, academic_year, semester) DO UPDATE SET
       izin_used_count = excluded.izin_used_count,
       updated_at = excluded.updated_at`
  ).run(
    newId(),
    studentId,
    settings.active_academic_year,
    settings.active_semester,
    izinCount,
    new Date().toISOString()
  );

  syncStudentTotalXp(studentId);
  return { izinUsed: izinCount, totalAttendanceXp };
}

export function awardAssignmentSubmissionXp(params: {
  studentId: string;
  assignmentId: string;
  assignmentTitle: string;
  submittedAtUtc: string;
  deadlineUtc: string;
  isLate: boolean;
}): number {
  const submittedMs = new Date(params.submittedAtUtc).getTime();
  const deadlineMs = new Date(params.deadlineUtc).getTime();
  const diffHours = (deadlineMs - submittedMs) / 3600000;

  let xp = 30;
  let timingLabel = 'Tepat Waktu';
  if (params.isLate) {
    xp = 10;
    timingLabel = 'Terlambat';
  } else if (diffHours >= 24) {
    xp = 35;
    timingLabel = 'Awal (>= 24 jam sebelum deadline)';
  }

  // Idempotent on first submission per assignment+student; revisions don't overwrite original earned XP
  insertXpTransactionIdempotent({
    studentId: params.studentId,
    amount: xp,
    sourceType: 'ASSIGNMENT',
    sourceId: params.assignmentId,
    idempotencyKey: `assign:${params.assignmentId}:${params.studentId}`,
    description: `Pengumpulan Tugas: ${params.assignmentTitle} (${timingLabel})`,
  });

  return xp;
}
