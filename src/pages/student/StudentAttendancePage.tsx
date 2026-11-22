import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, QrCode, UserCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { ErrorState } from '../../components/ui/EmptyAndErrorState';
import { QrScannerModal } from '../../components/ui/QrScannerModal';
import { formatWibDateTime } from '../../../shared/time';

interface StudentAttendanceData {
  summary: { percentage: number; total: number; hadir: number; izin: number; sakit: number; alfa: number };
  quota: { izin_used_count: number; max_xp_izin_count: number };
  openSessions: Array<{
    id: string;
    title: string;
    mode: 'Daring' | 'Luring';
    open_at_utc: string;
    close_at_utc: string;
    my_record_id: string | null;
    my_status: string | null;
  }>;
  records: Array<{
    id: string;
    session_title: string;
    mode: string;
    status: string;
    method: string;
    xp_awarded: number;
    recorded_at_utc: string;
    correction_reason: string;
  }>;
  historical: Array<{
    week_number: number;
    status: string;
    xp_awarded: number;
  }>;
}

export const StudentAttendancePage: React.FC = () => {
  const { pushToast, refreshUser } = useAuth();
  const [data, setData] = useState<StudentAttendanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<StudentAttendanceData>('/api/student/attendance');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data absensi');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOnlineCheckIn = async (sessionId: string) => {
    try {
      const res = await apiRequest<{ xpEarned: number }>('/api/student/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({ sessionId }),
      });
      pushToast({
        type: 'success',
        title: `Kehadiran Daring Tercatat (+${res.xpEarned} XP)`,
      });
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal absen', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleQrDetected = async (qrToken: string) => {
    try {
      const res = await apiRequest<{ xpEarned: number }>('/api/student/attendance/scan-qr', {
        method: 'POST',
        body: JSON.stringify({ qrToken }),
      });
      pushToast({
        type: 'success',
        title: `QR Absensi Valid (+${res.xpEarned} XP)`,
      });
      setQrOpen(false);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      pushToast({ type: 'error', title: 'QR tidak diterima', description: err instanceof Error ? err.message : '' });
    }
  };

  if (loading) return <TableSkeleton />;
  if (error || !data) return <ErrorState message={error ?? 'Data tidak tersedia'} onRetry={load} />;

  const { summary, quota, openSessions, records, historical } = data;

  return (
    <div className="space-y-6">
      {/* KPI Kehadiran */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="col-span-2 sm:col-span-1 rounded-2xl bg-[#171A17] text-white p-4">
          <p className="text-xs text-[#B5D45D]">Persentase Hadir</p>
          <p className="text-3xl font-bold font-mono tabular-nums mt-2">{summary.percentage}%</p>
        </div>
        {[
          { label: 'Hadir', value: summary.hadir },
          { label: 'Izin', value: summary.izin },
          { label: 'Sakit', value: summary.sakit },
          { label: 'Alfa', value: summary.alfa },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl bg-white border border-[#D5E4B6] p-4">
            <p className="text-xs text-[#536F1A]">{item.label}</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-[#20251D] mt-2">{item.value}</p>
          </div>
        ))}
      </section>

      {/* Kuota Izin & Tombol Scan QR */}
      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[#364B0F]">
          Kuota Izin Semester Ber-XP (+10 XP):{' '}
          <strong className="font-mono tabular-nums">
            {quota.izin_used_count}/{quota.max_xp_izin_count}
          </strong>{' '}
          terpakai.
        </p>
        <button
          type="button"
          onClick={() => setQrOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2.5 text-xs font-bold"
        >
          <QrCode className="w-4 h-4" />
          Scan QR Absensi Luring
        </button>
      </div>

      {/* Sesi Terbuka */}
      {openSessions.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-[#536F1A]" />
            Sesi Absensi Terbuka Sekarang
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openSessions.map((ses) => (
              <div key={ses.id} className="rounded-2xl bg-[#F0F8DF] border border-[#B5D45D] p-5 flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#536F1A]">{ses.mode}</p>
                  <h4 className="text-base font-bold text-[#20251D]">{ses.title}</h4>
                  <p className="text-xs font-mono text-[#536F1A] mt-1">
                    Tutup: {formatWibDateTime(ses.close_at_utc)}
                  </p>
                </div>
                {ses.my_record_id ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-[#364B0F]">
                    <CheckCircle2 className="w-4 h-4" />
                    Tercatat ({ses.my_status})
                  </span>
                ) : ses.mode === 'Daring' ? (
                  <button
                    type="button"
                    onClick={() => void handleOnlineCheckIn(ses.id)}
                    className="rounded-full bg-[#171A17] text-[#B5D45D] px-5 py-2.5 text-xs font-bold shrink-0"
                  >
                    Catat Hadir
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setQrOpen(true)}
                    className="rounded-full bg-[#171A17] text-[#B5D45D] px-5 py-2.5 text-xs font-bold shrink-0"
                  >
                    Scan QR
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Histori Minggu 1-8 */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-3">
        <h3 className="text-sm font-bold text-[#20251D]">Histori Absensi Minggu 1–8</h3>
        {historical.length === 0 ? (
          <p className="text-xs text-[#536F1A]">Belum ada data histori Minggu 1–8.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => {
              const found = historical.find((h) => h.week_number === w);
              return (
                <div key={w} className="rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] p-3 text-center">
                  <p className="text-[11px] font-semibold text-[#536F1A]">Minggu {w}</p>
                  <p className="text-sm font-bold text-[#20251D] mt-1">{found?.status ?? '-'}</p>
                  <p className="text-[11px] font-mono text-[#364B0F]">
                    {found ? `+${found.xp_awarded} XP` : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Riwayat Reguler */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
        <div className="p-4 border-b border-[#D5E4B6] font-bold text-sm text-[#20251D]">
          Riwayat Absensi Reguler
        </div>
        {records.length === 0 ? (
          <p className="text-xs text-[#536F1A] p-6 text-center">Belum ada riwayat absensi reguler.</p>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">Sesi</th>
                <th className="px-4 py-3">Mode · Metode</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">XP</th>
                <th className="px-4 py-3 text-right">Waktu WIB</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-semibold text-[#20251D]">
                    {r.session_title}
                    {r.correction_reason && (
                      <span className="block text-[11px] font-normal text-amber-800">
                        Koreksi Admin: {r.correction_reason}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#536F1A]">
                    {r.mode} · {r.method}
                  </td>
                  <td className="px-4 py-3 font-bold">{r.status}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">+{r.xp_awarded}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums">
                    {formatWibDateTime(r.recorded_at_utc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <QrScannerModal open={qrOpen} onClose={() => setQrOpen(false)} onDetected={handleQrDetected} />
    </div>
  );
};
