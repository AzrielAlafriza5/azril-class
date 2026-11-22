import React, { useCallback, useEffect, useState } from 'react';
import { Award, Flame, History, Sparkles, Zap } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { DashboardSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatWibDateTime } from '../../../shared/time';

interface XpResponse {
  student: {
    total_xp: number;
    current_streak: number;
    longest_streak: number;
    last_login_date_wib: string | null;
  };
  milestones: Array<{
    milestone_days: number;
    xp_awarded: number;
    achieved_at_utc: string;
  }>;
  transactions: Array<{
    id: string;
    amount: number;
    source_type: string;
    source_id: string;
    description: string;
    granted_by_admin_name: string | null;
    created_at_utc: string;
  }>;
}

const MILESTONE_TARGETS = [
  { days: 3, xp: 10, label: 'Konsisten 3 Hari' },
  { days: 7, xp: 30, label: 'Pekan Penuh 7 Hari' },
  { days: 14, xp: 50, label: 'Dedikasi 14 Hari' },
  { days: 30, xp: 100, label: 'Master Streak 30 Hari' },
];

const SOURCE_LABELS: Record<string, string> = {
  DAILY_LOGIN: 'Login Harian',
  STREAK_BONUS: 'Bonus Streak',
  ATTENDANCE: 'Absensi Sesi',
  HISTORICAL_ATTENDANCE: 'Riwayat Absensi',
  ASSIGNMENT: 'Pengumpulan Tugas',
  ACTIVITY: 'Keaktifan Kelas',
  CORRECTION: 'Penyesuaian Admin',
};

export const StudentXpPage: React.FC = () => {
  const [data, setData] = useState<XpResponse | null>(null);
  const [filterType, setFilterType] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<XpResponse>('/api/student/xp');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat riwayat XP & streak');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <DashboardSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} onRetry={load} />;

  const { student, milestones, transactions } = data;
  const achievedMap = new Map(milestones.map((m) => [m.milestone_days, m]));
  const filteredTx =
    filterType === 'ALL' ? transactions : transactions.filter((tx) => tx.source_type === filterType);

  return (
    <div className="space-y-6">
      {/* Ringkasan XP & Streak */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl bg-[#171A17] text-white p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#B5D45D]">Total Poin XP</span>
            <Zap className="w-4 h-4 text-[#B5D45D]" />
          </div>
          <p className="text-4xl font-bold font-mono tabular-nums mt-2 text-[#B5D45D]">{student.total_xp}</p>
          <p className="text-xs text-[#DCECB8]/70 mt-1">Akumulasi XP aktif semester berjalan</p>
        </div>

        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#536F1A]">Streak Login Harian (WIB)</span>
            <Flame className="w-4 h-4 text-[#536F1A]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{student.current_streak} Hari</p>
          <p className="text-xs text-[#536F1A] mt-1 font-mono">
            Login WIB terakhir: {student.last_login_date_wib || '-'}
          </p>
        </div>

        <div className="rounded-2xl bg-[#DCECB8]/60 border border-[#D5E4B6] p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[#364B0F]">Rekor Streak Terbaik</span>
            <Award className="w-4 h-4 text-[#364B0F]" />
          </div>
          <p className="text-3xl font-bold tabular-nums text-[#20251D] mt-2">{student.longest_streak} Hari</p>
          <p className="text-xs text-[#364B0F] mt-1">+5 XP untuk login harian pertama per hari WIB</p>
        </div>
      </section>

      {/* Target Milestone Streak */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#536F1A]" />
            Pencapaian Bonus Streak
          </h3>
          <span className="text-xs text-[#536F1A] font-mono tabular-nums">
            {milestones.length} / {MILESTONE_TARGETS.length} tercapai
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {MILESTONE_TARGETS.map((target) => {
            const achieved = achievedMap.get(target.days);
            const progressPct = Math.min(100, Math.round((student.current_streak / target.days) * 100));
            return (
              <div
                key={target.days}
                className={`rounded-2xl p-4 border transition-colors ${
                  achieved
                    ? 'bg-[#171A17] text-white border-[#171A17]'
                    : 'bg-[#F0F8DF]/70 text-[#20251D] border-[#D5E4B6]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${achieved ? 'text-[#B5D45D]' : 'text-[#536F1A]'}`}>
                    {target.days} Hari
                  </span>
                  <span className="font-mono tabular-nums text-xs font-bold">+{target.xp} XP</span>
                </div>
                <p className="text-sm font-semibold mt-1">{target.label}</p>
                {achieved ? (
                  <p className="text-[11px] font-mono text-[#DCECB8]/75 mt-2">
                    Tercapai · {formatWibDateTime(achieved.achieved_at_utc)}
                  </p>
                ) : (
                  <div className="mt-3 space-y-1">
                    <div className="h-1.5 rounded-full bg-[#DCECB8] overflow-hidden">
                      <div className="h-full bg-[#536F1A] rounded-full" style={{ width: `${progressPct}%` }} />
                    </div>
                    <p className="text-[11px] font-mono tabular-nums text-[#536F1A]">
                      Progres {Math.min(student.current_streak, target.days)}/{target.days} hari
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Riwayat Transaksi XP */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
            <History className="w-4 h-4 text-[#536F1A]" />
            Riwayat Transaksi XP
          </h3>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="rounded-full border border-[#D5E4B6] px-4 py-1.5 text-xs bg-white"
          >
            <option value="ALL">Semua Sumber XP</option>
            {Object.entries(SOURCE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {filteredTx.length === 0 ? (
          <EmptyState
            icon={<Zap className="w-5 h-5" />}
            title="Belum Ada Transaksi XP"
            description="Riwayat perolehan XP dari login harian, absensi, tugas, dan keaktifan akan tercatat otomatis di sini."
          />
        ) : (
          <div className="divide-y divide-[#EBF3DA]">
            {filteredTx.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#20251D]">{tx.description}</p>
                  <p className="text-xs text-[#536F1A] mt-0.5">
                    {SOURCE_LABELS[tx.source_type] ?? tx.source_type} ·{' '}
                    <span className="font-mono tabular-nums">{formatWibDateTime(tx.created_at_utc)}</span>
                    {tx.granted_by_admin_name ? ` · Oleh ${tx.granted_by_admin_name}` : ''}
                  </p>
                </div>
                <span
                  className={`font-mono tabular-nums font-bold text-sm shrink-0 ${
                    tx.amount >= 0 ? 'text-[#364B0F]' : 'text-red-700'
                  }`}
                >
                  {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} XP
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
