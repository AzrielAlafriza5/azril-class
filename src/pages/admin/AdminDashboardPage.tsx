import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Calendar,
  DownloadCloud,
  Sparkles,
  Trophy,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { useOnlineStatus } from '../../hooks/usePWAInstall';
import { DashboardSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { DAY_NAMES_ID, formatWibDateTime } from '../../../shared/time';

interface DashboardData {
  stats: {
    totalStudents: number;
    hesStudents: number;
    pjkrStudents: number;
    farmasiStudents: number;
    activeAssignments: number;
    pendingSubmissions: number;
    openSessions: number;
    activeAcademicYear: string;
    activeSemester: string;
    institutionName: string;
  };
  top3: Array<{
    id: string;
    nim: string;
    full_name: string;
    total_xp: number;
    current_streak: number;
    prodi_code: string;
    class_name: string;
  }>;
  charts: {
    assignmentStats: Array<{ id: string; title: string; submitted: number; graded: number }>;
    attendanceBreakdown: Array<{ status: string; count: number }>;
    xpActivityTrend: Array<{ date: string; count: number; total_xp: number }>;
    aiAndGradingSummary: {
      totalGraded: number;
      avgScore: number;
      needsRevisionCount: number;
      aiCompletedCount: number;
      geminiConfigured: boolean;
    };
  };
  upcomingSchedules: Array<{
    id: string;
    course_name: string;
    class_name: string;
    prodi_code: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    mode: string;
  }>;
  recentSubmissions: Array<{
    id: string;
    submitted_at_utc: string;
    is_late: number;
    status: string;
    is_verified: number;
    student_name: string;
    nim: string;
    class_name: string;
    assignment_title: string;
    score: number | null;
  }>;
}

export const AdminDashboardPage: React.FC<{ onNavigate: (pageId: string) => void }> = ({ onNavigate }) => {
  const { systemStatus } = useAuth();
  const isOnline = useOnlineStatus();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<DashboardData>('/api/admin/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat dashboard Admin');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} onRetry={load} />;

  const { stats, top3, charts, upcomingSchedules, recentSubmissions } = data;
  const maxAtt = Math.max(1, ...charts.attendanceBreakdown.map((a) => a.count));
  const maxXpTrend = Math.max(1, ...charts.xpActivityTrend.map((t) => t.total_xp));

  return (
    <div className="space-y-6">
      {/* Top KPI Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-[#171A17] text-white p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#B5D45D]">Total Mahasiswa</span>
            <Users className="w-4 h-4 text-[#B5D45D]" />
          </div>
          <p className="text-3xl font-bold tabular-nums mt-3">{stats.totalStudents}</p>
          <p className="text-xs text-[#DCECB8]/80 mt-2 tabular-nums">
            HES {stats.hesStudents} · PJKR {stats.pjkrStudents} · FARMASI {stats.farmasiStudents}
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#536F1A]">Tugas Aktif</span>
            <BookOpen className="w-4 h-4 text-[#536F1A]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-3">{stats.activeAssignments}</p>
          <p className="text-xs text-[#536F1A] mt-2 tabular-nums">
            {stats.pendingSubmissions} pengumpulan menunggu nilai
          </p>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#536F1A]">Sesi Absensi Terbuka</span>
            <UserCheck className="w-4 h-4 text-[#536F1A]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-3">{stats.openSessions}</p>
          <p className="text-xs text-[#536F1A] mt-2">
            {stats.activeAcademicYear} · Semester {stats.activeSemester}
          </p>
        </div>

        <div className="rounded-2xl bg-[#DCECB8]/60 border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#364B0F]">Status Koneksi & Layanan</span>
            <Sparkles className="w-4 h-4 text-[#364B0F]" />
          </div>
          <p className="text-lg font-bold text-[#20251D] mt-3">
            {isOnline ? 'Terhubung' : 'Offline'}
          </p>
          <p className="text-xs text-[#364B0F] mt-2">
            DB: {systemStatus?.supabaseConfigured ? 'Supabase PostgreSQL' : 'SQLite Lokal'} · AI:{' '}
            {charts.aiAndGradingSummary.geminiConfigured ? 'Gemini Aktif' : 'Belum Dikonfigurasi'}
          </p>
        </div>
      </section>

      {/* Quick Actions */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center gap-2.5">
        <span className="text-xs font-semibold text-[#536F1A] mr-2">Aksi Cepat:</span>
        <button
          type="button"
          onClick={() => onNavigate('students')}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-semibold transition-colors"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Kelola Mahasiswa
        </button>
        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] hover:bg-[#232822] text-[#F0F8DF] px-4 py-2 text-xs font-semibold transition-colors"
        >
          <UserCheck className="w-3.5 h-3.5 text-[#B5D45D]" />
          Buka Sesi Absensi
        </button>
        <button
          type="button"
          onClick={() => onNavigate('assignments')}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-[#F0F8DF] hover:bg-[#DCECB8] text-[#20251D] px-4 py-2 text-xs font-semibold transition-colors"
        >
          <BookOpen className="w-3.5 h-3.5" />
          Buat Penugasan
        </button>
        <button
          type="button"
          onClick={() => onNavigate('reports-export')}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#F0F8DF] text-[#20251D] px-4 py-2 text-xs font-semibold transition-colors"
        >
          <DownloadCloud className="w-3.5 h-3.5" />
          Ekspor Laporan 6-Sheet
        </button>
      </section>

      {/* 4 Minimalist Charts + Top 3 Podium */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Chart 1 & 2 */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Grafik Tugas */}
          <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#20251D]">Grafik Pengumpulan Tugas</h3>
              <button
                type="button"
                onClick={() => onNavigate('submissions')}
                className="text-xs font-medium text-[#536F1A] hover:underline inline-flex items-center gap-0.5"
              >
                Detail <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            {charts.assignmentStats.length === 0 ? (
              <p className="text-xs text-[#536F1A] py-8 text-center">Belum ada tugas aktif yang dibuat.</p>
            ) : (
              <div className="space-y-3">
                {charts.assignmentStats.map((a) => {
                  const total = Math.max(1, a.submitted);
                  const gradedPct = Math.round((a.graded / total) * 100);
                  return (
                    <div key={a.id} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium text-[#20251D] truncate max-w-[180px]">{a.title}</span>
                        <span className="tabular-nums text-[#536F1A]">
                          {a.submitted} kumpul · {a.graded} dinilai
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#F0F8DF] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#B5D45D]"
                          style={{ width: `${Math.min(100, a.submitted > 0 ? Math.max(15, gradedPct) : 0)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grafik Kehadiran */}
          <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#20251D]">Distribusi Kehadiran</h3>
              <button
                type="button"
                onClick={() => onNavigate('attendance')}
                className="text-xs font-medium text-[#536F1A] hover:underline inline-flex items-center gap-0.5"
              >
                Absensi <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
            {charts.attendanceBreakdown.length === 0 ? (
              <p className="text-xs text-[#536F1A] py-8 text-center">Belum ada catatan absensi.</p>
            ) : (
              <div className="space-y-3">
                {['Hadir', 'Izin', 'Sakit', 'Alfa'].map((label) => {
                  const found = charts.attendanceBreakdown.find((x) => x.status === label)?.count ?? 0;
                  const pct = Math.round((found / maxAtt) * 100);
                  return (
                    <div key={label} className="flex items-center gap-3 text-xs">
                      <span className="w-12 font-medium text-[#20251D]">{label}</span>
                      <div className="flex-1 h-3 rounded-full bg-[#F0F8DF] overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            label === 'Hadir'
                              ? 'bg-[#B5D45D]'
                              : label === 'Izin'
                                ? 'bg-[#536F1A]'
                                : label === 'Sakit'
                                  ? 'bg-[#DCECB8]'
                                  : 'bg-[#171A17]'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-8 text-right font-mono tabular-nums font-semibold">{found}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grafik Aktivitas Akademik (XP Trend SVG) */}
          <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5">
            <h3 className="text-sm font-bold text-[#20251D] mb-4">Aktivitas Akademik (7 Hari XP)</h3>
            {charts.xpActivityTrend.length === 0 ? (
              <p className="text-xs text-[#536F1A] py-8 text-center">Belum ada transaksi XP.</p>
            ) : (
              <div className="flex items-end gap-2 h-32 pt-4">
                {charts.xpActivityTrend.map((pt) => {
                  const h = Math.max(10, Math.round((pt.total_xp / maxXpTrend) * 100));
                  return (
                    <div key={pt.date} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-mono tabular-nums text-[#536F1A]">+{pt.total_xp}</span>
                      <div className="w-full flex items-end justify-center h-20">
                        <div
                          className="w-full max-w-[28px] rounded-t-lg bg-[#B5D45D] hover:bg-[#536F1A] transition-colors"
                          style={{ height: `${h}%` }}
                          title={`${pt.date}: +${pt.total_xp} XP (${pt.count} aktivitas)`}
                        />
                      </div>
                      <span className="text-[10px] font-mono text-[#20251D]/70">{pt.date.slice(5)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Grafik Penilaian & AI */}
          <div className="rounded-2xl bg-[#171A17] text-[#F0F8DF] p-5 flex flex-col justify-between">
            <div>
              <h3 className="text-sm font-bold text-white">Penilaian & AI Assistant</h3>
              <p className="text-xs text-[#DCECB8]/70 mt-0.5">Ringkasan evaluasi Human-in-the-Loop</p>
            </div>
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-xl bg-[#232822]">
                <p className="text-[11px] text-[#DCECB8]/70">Rata-rata Nilai</p>
                <p className="text-2xl font-bold tabular-nums text-[#B5D45D]">
                  {charts.aiAndGradingSummary.avgScore}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#232822]">
                <p className="text-[11px] text-[#DCECB8]/70">Sudah Dinilai</p>
                <p className="text-2xl font-bold tabular-nums text-white">
                  {charts.aiAndGradingSummary.totalGraded}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#232822]">
                <p className="text-[11px] text-[#DCECB8]/70">Perlu Revisi</p>
                <p className="text-lg font-bold tabular-nums text-white">
                  {charts.aiAndGradingSummary.needsRevisionCount}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-[#232822]">
                <p className="text-[11px] text-[#DCECB8]/70">Analisis Gemini</p>
                <p className="text-lg font-bold tabular-nums text-[#B5D45D]">
                  {charts.aiAndGradingSummary.aiCompletedCount}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Ranking Top 3 */}
        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
                <Trophy className="w-4 h-4 text-[#536F1A]" />
                Ranking Top 3
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('xp-ranking')}
                className="text-xs font-medium text-[#536F1A] hover:underline"
              >
                Lihat Semua
              </button>
            </div>
            {top3.length === 0 ? (
              <p className="text-xs text-[#536F1A] py-8 text-center">
                Belum ada mahasiswa aktif pada papan peringkat.
              </p>
            ) : (
              <div className="space-y-3">
                {top3.map((st, idx) => (
                  <div
                    key={st.id}
                    className={`p-3.5 rounded-xl flex items-center justify-between gap-3 ${
                      idx === 0
                        ? 'bg-[#171A17] text-white'
                        : 'bg-[#F0F8DF] border border-[#D5E4B6] text-[#20251D]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                          idx === 0 ? 'bg-[#B5D45D] text-[#171A17]' : 'bg-[#171A17] text-[#B5D45D]'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate">{st.full_name}</p>
                        <p className={`text-[11px] truncate ${idx === 0 ? 'text-[#DCECB8]/70' : 'text-[#536F1A]'}`}>
                          {st.prodi_code} · {st.class_name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold font-mono tabular-nums">{st.total_xp} XP</p>
                      <p className={`text-[10px] tabular-nums ${idx === 0 ? 'text-[#B5D45D]' : 'text-[#536F1A]'}`}>
                        Streak {st.current_streak}h
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => onNavigate('xp-ranking')}
            className="mt-4 w-full rounded-full border border-[#D5E4B6] py-2.5 text-xs font-semibold text-[#20251D] hover:bg-[#F0F8DF] transition-colors"
          >
            Beri XP Keaktifan
          </button>
        </div>
      </section>

      {/* Jadwal Mendatang & Pengumpulan Terbaru */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#536F1A]" />
              Jadwal Perkuliahan
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('schedules')}
              className="text-xs font-medium text-[#536F1A] hover:underline"
            >
              Kelola Jadwal
            </button>
          </div>
          {upcomingSchedules.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-5 h-5" />}
              title="Belum Ada Jadwal"
              description="Tambahkan jadwal perkuliahan agar mahasiswa dapat mengakses tautan Daring maupun ruangan Luring."
            />
          ) : (
            <div className="divide-y divide-[#EBF3DA]">
              {upcomingSchedules.map((sc) => (
                <div key={sc.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#20251D] truncate">{sc.course_name}</p>
                    <p className="text-xs text-[#536F1A] truncate">
                      {sc.prodi_code} · {sc.class_name} · {sc.mode}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold text-[#20251D]">{DAY_NAMES_ID[sc.day_of_week]}</p>
                    <p className="text-xs font-mono tabular-nums text-[#536F1A]">
                      {sc.start_time}–{sc.end_time} WIB
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-[#20251D]">Pengumpulan Terbaru</h3>
            <button
              type="button"
              onClick={() => onNavigate('submissions')}
              className="text-xs font-medium text-[#536F1A] hover:underline"
            >
              Periksa Semua
            </button>
          </div>
          {recentSubmissions.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="w-5 h-5" />}
              title="Belum Ada Pengumpulan"
              description="Pengumpulan tugas terbaru dari mahasiswa akan tampil secara langsung di sini."
            />
          ) : (
            <div className="divide-y divide-[#EBF3DA]">
              {recentSubmissions.map((sub) => (
                <div key={sub.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#20251D] truncate">{sub.student_name}</p>
                    <p className="text-xs text-[#536F1A] truncate">
                      {sub.assignment_title} · {sub.class_name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold tabular-nums text-[#20251D]">
                      {sub.score !== null ? `Nilai ${sub.score}` : sub.is_verified ? 'Terverifikasi' : 'Menunggu'}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-[#536F1A]">
                      {formatWibDateTime(sub.submitted_at_utc)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
