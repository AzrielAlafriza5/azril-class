import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Calendar, CheckCircle2, Flame, QrCode, Trophy, Zap } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { DashboardSkeleton } from '../../components/ui/Skeletons';
import { ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatCountdown, formatWibDateTime } from '../../../shared/time';
import type { AuthUser } from '../../../shared/types';

interface StudentDashboardData {
  profile: AuthUser;
  stats: {
    totalXp: number;
    currentStreak: number;
    longestStreak: number;
    activeTasksCount: number;
    completedTasksCount: number;
    attendanceRate: number;
    attendanceCounts: { total: number; hadir: number; izin: number; sakit: number; alfa: number };
    unreadNotifCount: number;
  };
  todaySchedules: Array<{
    id: string;
    course_name: string;
    start_time: string;
    end_time: string;
    mode: string;
    meeting_link: string;
    room_name: string;
  }>;
  openSessions: Array<{
    id: string;
    title: string;
    mode: string;
    close_at_utc: string;
    my_record_id: string | null;
    my_status: string | null;
  }>;
  upcomingAssignments: Array<{
    id: string;
    title: string;
    deadline_utc: string;
    submission_id: string | null;
  }>;
}

export const StudentDashboardPage: React.FC<{ onNavigate: (pageId: string) => void }> = ({ onNavigate }) => {
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<StudentDashboardData>('/api/student/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard mahasiswa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} onRetry={load} />;

  const { profile, stats, todaySchedules, openSessions, upcomingAssignments } = data;

  return (
    <div className="space-y-6">
      {/* Profil Ringkas & Hero XP */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#171A17] text-white p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs text-[#B5D45D] font-medium">
              {profile.studyProgramCode} · {profile.className} · Badge {profile.badge}
            </p>
            <h2 className="text-lg font-bold mt-1 truncate">{profile.fullName}</h2>
            <p className="text-xs font-mono text-[#DCECB8]/70">{profile.nim}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-[#232822] flex items-center justify-between">
            <span className="text-xs text-[#DCECB8]/80">Total XP</span>
            <span className="text-2xl font-bold font-mono tabular-nums text-[#B5D45D]">{stats.totalXp}</span>
          </div>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#536F1A]">Login Streak</span>
            <Flame className="w-4 h-4 text-[#536F1A]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{stats.currentStreak} Hari</p>
          <p className="text-xs text-[#536F1A] mt-2 tabular-nums">Rekor terbaik: {stats.longestStreak} hari</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#536F1A]">Progres Tugas</span>
            <BookOpen className="w-4 h-4 text-[#536F1A]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{stats.activeTasksCount} Aktif</p>
          <p className="text-xs text-[#536F1A] mt-2 tabular-nums">{stats.completedTasksCount} tugas selesai</p>
        </div>

        <div className="rounded-2xl bg-[#DCECB8]/60 border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#364B0F]">Tingkat Kehadiran</span>
            <CheckCircle2 className="w-4 h-4 text-[#364B0F]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{stats.attendanceRate}%</p>
          <p className="text-xs text-[#364B0F] mt-2 tabular-nums">
            Hadir {stats.attendanceCounts.hadir} · Izin {stats.attendanceCounts.izin} · Sakit{' '}
            {stats.attendanceCounts.sakit}
          </p>
        </div>
      </section>

      {/* Akses Cepat */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-[#536F1A] mr-2">Akses Cepat:</span>
        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
        >
          <QrCode className="w-3.5 h-3.5" />
          Absensi & Scan QR
        </button>
        <button
          type="button"
          onClick={() => onNavigate('assignments')}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] text-[#F0F8DF] px-4 py-2 text-xs font-semibold"
        >
          <BookOpen className="w-3.5 h-3.5 text-[#B5D45D]" />
          Kumpulkan Tugas
        </button>
        <button
          type="button"
          onClick={() => onNavigate('xp')}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-[#F0F8DF] px-4 py-2 text-xs font-semibold"
        >
          <Zap className="w-3.5 h-3.5 text-[#536F1A]" />
          Riwayat XP
        </button>
        <button
          type="button"
          onClick={() => onNavigate('ranking')}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs font-semibold"
        >
          <Trophy className="w-3.5 h-3.5 text-[#536F1A]" />
          Papan Ranking
        </button>
      </section>

      {/* Sesi Absensi Terbuka + Jadwal Hari Ini + Tugas Mendatang */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#536F1A]" />
              Jadwal Kuliah Hari Ini (WIB)
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-xs font-medium text-[#536F1A] hover:underline"
            >
              Semua Jadwal
            </button>
          </div>
          {todaySchedules.length === 0 ? (
            <p className="text-xs text-[#536F1A] py-6 text-center">Tidak ada jadwal perkuliahan hari ini.</p>
          ) : (
            <div className="divide-y divide-[#EBF3DA]">
              {todaySchedules.map((sc) => (
                <div key={sc.id} className="py-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#20251D]">{sc.course_name}</p>
                    <p className="text-xs text-[#536F1A]">
                      {sc.mode} · {sc.mode === 'Daring' ? sc.meeting_link || 'Online' : sc.room_name || 'Ruangan'}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-semibold">
                    {sc.start_time}–{sc.end_time} WIB
                  </span>
                </div>
              ))}
            </div>
          )}

          {openSessions.length > 0 && (
            <div className="pt-3 border-t border-[#EBF3DA] space-y-2">
              <p className="text-xs font-bold text-[#364B0F]">Sesi Absensi Sedang Dibuka</p>
              {openSessions.map((ses) => (
                <div
                  key={ses.id}
                  className="p-3 rounded-xl bg-[#F0F8DF] border border-[#B5D45D] flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-[#20251D]">{ses.title}</p>
                    <p className="text-[#536F1A]">
                      {ses.mode} · Tutup {formatWibDateTime(ses.close_at_utc)}
                    </p>
                  </div>
                  {ses.my_record_id ? (
                    <span className="font-bold text-[#364B0F]">Sudah {ses.my_status}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onNavigate('attendance')}
                      className="rounded-full bg-[#171A17] text-[#B5D45D] px-3.5 py-1.5 font-bold"
                    >
                      Isi Absen
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[#20251D]">Tugas Kelas Anda</h3>
            <button
              type="button"
              onClick={() => onNavigate('assignments')}
              className="text-xs font-medium text-[#536F1A] hover:underline"
            >
              Lihat Semua
            </button>
          </div>
          {upcomingAssignments.length === 0 ? (
            <p className="text-xs text-[#536F1A] py-6 text-center">Belum ada tugas yang ditargetkan untuk kelas Anda.</p>
          ) : (
            <div className="divide-y divide-[#EBF3DA]">
              {upcomingAssignments.map((a) => {
                const cd = formatCountdown(a.deadline_utc);
                return (
                  <div key={a.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#20251D] truncate">{a.title}</p>
                      <p className="text-xs font-mono tabular-nums text-[#536F1A]">
                        {formatWibDateTime(a.deadline_utc)} · {cd.label}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        a.submission_id ? 'text-[#364B0F]' : 'text-amber-700'
                      }`}
                    >
                      {a.submission_id ? 'Selesai' : 'Belum Kumpul'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
