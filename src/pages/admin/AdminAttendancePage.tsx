import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Edit3,
  History,
  Plus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import { formatWibDateTime, utcIsoToWibLocalInput, wibLocalInputToUtcIso } from '../../../shared/time';
import type { AttendanceStatus, ClassMode } from '../../../shared/types';

interface SessionRow {
  id: string;
  class_id: string;
  class_name: string;
  course_name: string | null;
  title: string;
  mode: ClassMode;
  open_at_utc: string;
  close_at_utc: string;
  qr_token: string;
  status: 'OPEN' | 'CLOSED';
  recorded_count: number;
  total_students: number;
  qrDataUrl: string;
}

interface SessionStudentRecord {
  student_id: string;
  nim: string;
  full_name: string;
  badge: string;
  record_id: string | null;
  status: AttendanceStatus | null;
  method: string | null;
  recorded_at_utc: string | null;
  notes: string | null;
  correction_reason: string | null;
  corrected_at_utc: string | null;
  corrected_by_admin_name: string | null;
  xp_awarded: number | null;
}

interface QuotaRow {
  student_id: string;
  nim: string;
  full_name: string;
  class_name: string;
  prodi_code: string;
  izin_used_count: number;
  max_xp_izin_count: number;
}

interface HistoricalRow {
  id: string;
  nim: string;
  full_name: string;
  class_name: string;
  prodi_code: string;
  weeks: Record<number, { status: AttendanceStatus; xp: number }>;
}

export const AdminAttendancePage: React.FC = () => {
  const { pushToast } = useAuth();
  const [tab, setTab] = useState<'sessions' | 'quotas' | 'historical'>('sessions');
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; study_program_code: string }>>([]);
  const [schedules, setSchedules] = useState<Array<{ id: string; course_name: string; class_id: string; mode: ClassMode }>>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [historical, setHistorical] = useState<HistoricalRow[]>([]);
  const [histClassFilter, setHistClassFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Open Session Modal
  const [openModal, setOpenModal] = useState(false);
  const [sClassId, setSClassId] = useState('');
  const [sScheduleId, setSScheduleId] = useState('');
  const [sTitle, setSTitle] = useState('');
  const [sMode, setSMode] = useState<ClassMode>('Luring');
  const [sDuration, setSDuration] = useState(30);
  const [sOpenWib, setSOpenWib] = useState(() => utcIsoToWibLocalInput(new Date().toISOString()));

  // QR Modal
  const [qrSession, setQrSession] = useState<SessionRow | null>(null);

  // Records Modal
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [records, setRecords] = useState<SessionStudentRecord[]>([]);
  const [correcting, setCorrecting] = useState<SessionStudentRecord | null>(null);
  const [corrStatus, setCorrStatus] = useState<AttendanceStatus>('Hadir');
  const [corrReason, setCorrReason] = useState('');

  // Historical edits
  const [histEdits, setHistEdits] = useState<Record<string, AttendanceStatus>>({});
  const [extraHistWeeks, setExtraHistWeeks] = useState(8);

  const maxRecordedWeek = historical.reduce((max, row) => {
    const rowMax = Object.keys(row.weeks).reduce((m, w) => Math.max(m, Number(w) || 0), 0);
    return Math.max(max, rowMax);
  }, 8);
  const totalHistWeeks = Math.max(8, maxRecordedWeek, extraHistWeeks);
  const histWeekNumbers = Array.from({ length: totalHistWeeks }, (_, i) => i + 1);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sesRes, clsRes, schRes, qRes, hRes] = await Promise.all([
        apiRequest<{ items: SessionRow[] }>('/api/admin/attendance/sessions'),
        apiRequest<{ items: Array<{ id: string; name: string; study_program_code: string }> }>('/api/admin/classes'),
        apiRequest<{ items: Array<{ id: string; course_name: string; class_id: string; mode: ClassMode }> }>('/api/admin/schedules'),
        apiRequest<{ items: QuotaRow[] }>('/api/admin/attendance/quotas'),
        apiRequest<{ items: HistoricalRow[] }>(`/api/admin/attendance/historical${histClassFilter ? `?classId=${histClassFilter}` : ''}`),
      ]);
      setSessions(sesRes.items);
      setClasses(clsRes.items);
      setSchedules(schRes.items);
      setQuotas(qRes.items);
      setHistorical(hRes.items);
      if (clsRes.items.length > 0 && !sClassId) setSClassId(clsRes.items[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data absensi');
    } finally {
      setLoading(false);
    }
  }, [histClassFilter, sClassId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const loadSessionRecords = async (ses: SessionRow) => {
    setActiveSession(ses);
    const res = await apiRequest<{ items: SessionStudentRecord[] }>(`/api/admin/attendance/sessions/${ses.id}/records`);
    setRecords(res.items);
  };

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiRequest('/api/admin/attendance/sessions', {
        method: 'POST',
        body: JSON.stringify({
          classId: sClassId,
          scheduleId: sScheduleId || null,
          title: sTitle,
          mode: sMode,
          openAtUtc: wibLocalInputToUtcIso(sOpenWib),
          durationMinutes: sDuration,
        }),
      });
      pushToast({ type: 'success', title: 'Sesi absensi dibuka' });
      setOpenModal(false);
      setSTitle('');
      await loadAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal membuka sesi', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleCloseSession = async (id: string) => {
    await apiRequest(`/api/admin/attendance/sessions/${id}/close`, { method: 'POST' });
    pushToast({ type: 'success', title: 'Sesi absensi ditutup' });
    await loadAll();
  };

  const handleRefreshQr = async (ses: SessionRow) => {
    const res = await apiRequest<{ qrToken: string; qrDataUrl: string }>(
      `/api/admin/attendance/sessions/${ses.id}/refresh-qr`,
      { method: 'POST' }
    );
    setQrSession({ ...ses, qr_token: res.qrToken, qrDataUrl: res.qrDataUrl });
    pushToast({ type: 'success', title: 'QR Code disegarkan' });
    await loadAll();
  };

  const handleManualRecord = async (studentId: string, status: AttendanceStatus) => {
    if (!activeSession) return;
    try {
      await apiRequest('/api/admin/attendance/manual', {
        method: 'POST',
        body: JSON.stringify({ sessionId: activeSession.id, studentId, status }),
      });
      pushToast({ type: 'success', title: `Status ${status} dicatat` });
      await loadSessionRecords(activeSession);
      await loadAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal mencatat absensi', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleSubmitCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correcting?.record_id || !activeSession) return;
    try {
      await apiRequest(`/api/admin/attendance/records/${correcting.record_id}/correct`, {
        method: 'PATCH',
        body: JSON.stringify({ status: corrStatus, correctionReason: corrReason }),
      });
      pushToast({ type: 'success', title: 'Koreksi absensi & XP diperbarui konsisten' });
      setCorrecting(null);
      setCorrReason('');
      await loadSessionRecords(activeSession);
      await loadAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Koreksi gagal', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleSaveHistorical = async () => {
    const updates = Object.entries(histEdits).map(([key, status]) => {
      const [studentId, weekStr] = key.split(':');
      return { studentId, weekNumber: Number(weekStr), status };
    });
    if (updates.length === 0) {
      pushToast({ type: 'info', title: 'Belum ada perubahan histori yang perlu disimpan' });
      return;
    }
    try {
      const res = await apiRequest<{ studentsRecalculated: number }>('/api/admin/attendance/historical', {
        method: 'PUT',
        body: JSON.stringify({ updates }),
      });
      pushToast({
        type: 'success',
        title: 'Histori Mingguan & XP Historis Dikalkulasi',
        description: `${res.studentsRecalculated} mahasiswa diperbarui.`,
      });
      setHistEdits({});
      await loadAll();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan histori', description: err instanceof Error ? err.message : '' });
    }
  };

  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={loadAll} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
          <button
            type="button"
            onClick={() => setTab('sessions')}
            className={`px-4 py-2 rounded-full text-xs font-semibold ${
              tab === 'sessions' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Sesi Absensi ({sessions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('quotas')}
            className={`px-4 py-2 rounded-full text-xs font-semibold ${
              tab === 'quotas' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Kuota Izin (Max 2x XP)
          </button>
          <button
            type="button"
            onClick={() => setTab('historical')}
            className={`px-4 py-2 rounded-full text-xs font-semibold ${
              tab === 'historical' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Histori Mingguan ({totalHistWeeks})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Buka Sesi Absensi
        </button>
      </div>

      {tab === 'sessions' && (
        <>
          {sessions.length === 0 ? (
            <EmptyState
              icon={<UserCheck className="w-5 h-5" />}
              title="Belum Ada Sesi Absensi"
              description="Buka sesi absensi Daring atau Luring (dengan QR dinamis) untuk mulai mencatat kehadiran mahasiswa."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sessions.map((ses) => (
                <div key={ses.id} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-[#536F1A]">
                          {ses.class_name} · {ses.mode} ·{' '}
                          <span className={ses.status === 'OPEN' ? 'text-[#364B0F] font-bold' : 'text-neutral-500'}>
                            {ses.status === 'OPEN' ? 'TERBUKA' : 'DITUTUP'}
                          </span>
                        </p>
                        <h3 className="text-base font-bold text-[#20251D] mt-1">{ses.title}</h3>
                      </div>
                      <span className="font-mono tabular-nums text-xs font-bold bg-[#F0F8DF] border border-[#D5E4B6] px-2.5 py-1 rounded-full">
                        {ses.recorded_count}/{ses.total_students}
                      </span>
                    </div>
                    <p className="text-xs text-[#536F1A] mt-2 font-mono tabular-nums">
                      Buka: {formatWibDateTime(ses.open_at_utc)}
                      <br />
                      Tutup: {formatWibDateTime(ses.close_at_utc)}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#EBF3DA]">
                    <button
                      type="button"
                      onClick={() => void loadSessionRecords(ses)}
                      className="rounded-full bg-[#171A17] text-[#F0F8DF] px-4 py-2 text-xs font-semibold"
                    >
                      Kelola & Koreksi ({ses.recorded_count})
                    </button>
                    {ses.mode === 'Luring' && ses.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => setQrSession(ses)}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] text-[#171A17] px-4 py-2 text-xs font-bold"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        Tampilkan QR
                      </button>
                    )}
                    {ses.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => void handleCloseSession(ses.id)}
                        className="inline-flex items-center gap-1 rounded-full border border-red-200 text-red-700 hover:bg-red-50 px-3.5 py-2 text-xs font-semibold"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Tutup Sesi
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'quotas' && (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <div className="p-4 border-b border-[#D5E4B6] bg-[#F0F8DF]/50 text-xs text-[#364B0F]">
            Aturan Kuota Izin: Maksimal <strong>2 kali Izin</strong> per semester mendapatkan <strong>+10 XP</strong>.
            Izin ke-3 dan seterusnya memperoleh <strong>0 XP</strong>.
          </div>
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">NIM</th>
                <th className="px-4 py-3">Nama Mahasiswa</th>
                <th className="px-4 py-3">Prodi · Kelas</th>
                <th className="px-4 py-3 text-right">Izin Terpakai</th>
                <th className="px-4 py-3 text-right">Status Kuota XP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {quotas.map((q) => (
                <tr key={q.student_id}>
                  <td className="px-4 py-3 font-mono text-xs">{q.nim}</td>
                  <td className="px-4 py-3 font-semibold">{q.full_name}</td>
                  <td className="px-4 py-3 text-xs text-[#536F1A]">
                    {q.prodi_code} · {q.class_name}
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">{q.izin_used_count}</td>
                  <td className="px-4 py-3 text-right text-xs font-semibold">
                    {q.izin_used_count >= q.max_xp_izin_count ? (
                      <span className="text-amber-700">Kuota +10 XP habis (0 XP berikutnya)</span>
                    ) : (
                      <span className="text-[#536F1A]">
                        Sisa {q.max_xp_izin_count - q.izin_used_count}x (+10 XP)
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'historical' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <select
              value={histClassFilter}
              onChange={(e) => setHistClassFilter(e.target.value)}
              className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
            >
              <option value="">Semua Kelas</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.study_program_code})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setExtraHistWeeks(totalHistWeeks + 1)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#F0F8DF] px-4 py-2 text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5 text-[#536F1A]" />
              Tambah Kolom M{totalHistWeeks + 1}
            </button>

            <button
              type="button"
              onClick={() => void handleSaveHistorical()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              <History className="w-3.5 h-3.5" />
              Simpan & Kalkulasi XP Historis ({Object.keys(histEdits).length})
            </button>
          </div>

          <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] font-semibold text-[#364B0F]">
                <tr>
                  <th className="px-3 py-3">Mahasiswa</th>
                  {histWeekNumbers.map((w) => (
                    <th key={w} className="px-2 py-3 text-center">
                      M{w}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBF3DA]">
                {historical.map((st) => (
                  <tr key={st.id}>
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-[#20251D]">{st.full_name}</p>
                      <p className="text-[11px] font-mono text-[#536F1A]">
                        {st.nim} · {st.class_name}
                      </p>
                    </td>
                    {histWeekNumbers.map((w) => {
                      const editKey = `${st.id}:${w}`;
                      const cur = histEdits[editKey] ?? st.weeks[w]?.status ?? '';
                      return (
                        <td key={w} className="px-1.5 py-2 text-center">
                          <select
                            value={cur}
                            onChange={(e) => {
                              const val = e.target.value as AttendanceStatus;
                              if (val) setHistEdits((prev) => ({ ...prev, [editKey]: val }));
                            }}
                            className="rounded-lg border border-[#D5E4B6] bg-white px-1.5 py-1 text-[11px]"
                          >
                            <option value="">-</option>
                            <option value="Hadir">H</option>
                            <option value="Izin">I</option>
                            <option value="Sakit">S</option>
                            <option value="Alfa">A</option>
                          </select>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Buka Sesi Absensi */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Buka Sesi Absensi Baru">
        <form onSubmit={handleCreateSession} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Kelas</label>
            <select
              required
              value={sClassId}
              onChange={(e) => setSClassId(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.study_program_code})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Tautkan ke Jadwal (Opsional)</label>
            <select
              value={sScheduleId}
              onChange={(e) => {
                setSScheduleId(e.target.value);
                const found = schedules.find((x) => x.id === e.target.value);
                if (found) {
                  setSMode(found.mode);
                  if (!sTitle) setSTitle(`Pertemuan ${found.course_name}`);
                }
              }}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
            >
              <option value="">-- Sesi Manual --</option>
              {schedules
                .filter((sc) => !sClassId || sc.class_id === sClassId)
                .map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.course_name} ({sc.mode})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Judul Sesi Absensi</label>
            <input
              required
              value={sTitle}
              onChange={(e) => setSTitle(e.target.value)}
              placeholder="Contoh: Pertemuan 3 - Pengantar Ilmu Hukum"
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Mode Absensi</label>
              <select
                value={sMode}
                onChange={(e) => setSMode(e.target.value as ClassMode)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="Luring">Luring (QR Dinamis)</option>
                <option value="Daring">Daring (Self Check-In)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Durasi (5–180 Menit)</label>
              <input
                type="number"
                min={5}
                max={180}
                required
                value={sDuration}
                onChange={(e) => setSDuration(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Waktu Buka (WIB)</label>
            <input
              type="datetime-local"
              required
              value={sOpenWib}
              onChange={(e) => setSOpenWib(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setOpenModal(false)}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#B5D45D] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              Buka Sesi
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal QR Code Dinamis */}
      <Modal
        open={Boolean(qrSession)}
        onClose={() => setQrSession(null)}
        title="QR Code Absensi Luring"
        subtitle={qrSession?.title}
      >
        {qrSession && (
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="p-4 rounded-2xl bg-white border-2 border-[#171A17]">
              {qrSession.qrDataUrl && (
                <img src={qrSession.qrDataUrl} alt="QR Code Absensi" className="w-56 h-56" />
              )}
            </div>
            <div className="w-full rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] p-3">
              <p className="text-[11px] text-[#536F1A]">Token QR Dinamis</p>
              <p className="text-xs font-mono font-bold text-[#20251D] break-all select-all mt-0.5">
                {qrSession.qr_token}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefreshQr(qrSession)}
              className="inline-flex items-center gap-2 rounded-full bg-[#171A17] text-[#B5D45D] px-5 py-2.5 text-xs font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Segarkan QR Code
            </button>
          </div>
        )}
      </Modal>

      {/* Modal Kelola & Koreksi Kehadiran Sesi */}
      <Modal
        open={Boolean(activeSession)}
        onClose={() => {
          setActiveSession(null);
          setCorrecting(null);
        }}
        title={`Daftar Kehadiran: ${activeSession?.title ?? ''}`}
        subtitle={`${activeSession?.class_name ?? ''} · ${activeSession?.mode ?? ''}`}
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          {correcting && (
            <form
              onSubmit={handleSubmitCorrection}
              className="rounded-2xl bg-[#F0F8DF] border border-[#B5D45D] p-4 space-y-3"
            >
              <div className="flex items-center gap-2 text-xs font-bold text-[#364B0F]">
                <ShieldAlert className="w-4 h-4" />
                Koreksi Absensi: {correcting.full_name} ({correcting.nim})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <select
                  value={corrStatus}
                  onChange={(e) => setCorrStatus(e.target.value as AttendanceStatus)}
                  className="rounded-full border border-[#D5E4B6] bg-white px-3 py-2 text-xs"
                >
                  <option value="Hadir">Hadir (+20 XP)</option>
                  <option value="Izin">Izin (+10 XP maks 2x)</option>
                  <option value="Sakit">Sakit (0 XP)</option>
                  <option value="Alfa">Alfa (0 XP)</option>
                </select>
                <input
                  required
                  minLength={3}
                  value={corrReason}
                  onChange={(e) => setCorrReason(e.target.value)}
                  placeholder="Alasan koreksi wajib diisi..."
                  className="sm:col-span-2 rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCorrecting(null)}
                  className="rounded-full border border-[#D5E4B6] bg-white px-4 py-1.5 text-xs"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-[#171A17] text-[#B5D45D] px-4 py-1.5 text-xs font-bold"
                >
                  Simpan Koreksi & Hitung Ulang XP
                </button>
              </div>
            </form>
          )}

          <div className="max-h-96 overflow-y-auto divide-y divide-[#EBF3DA]">
            {records.map((r) => (
              <div key={r.student_id} className="py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#20251D]">
                    {r.full_name} <span className="font-mono text-xs text-[#536F1A]">({r.nim})</span>
                  </p>
                  {r.record_id ? (
                    <p className="text-xs text-[#536F1A]">
                      Status: <strong>{r.status}</strong> (+{r.xp_awarded} XP) · {r.method}
                      {r.correction_reason && (
                        <span className="block text-[11px] text-amber-800">
                          Riwayat koreksi: &ldquo;{r.correction_reason}&rdquo; oleh {r.corrected_by_admin_name}
                        </span>
                      )}
                    </p>
                  ) : (
                    <p className="text-xs text-neutral-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Belum tercatat
                    </p>
                  )}
                </div>

                {r.record_id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCorrecting(r);
                      setCorrStatus(r.status ?? 'Hadir');
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-[#D5E4B6] px-3 py-1.5 text-xs font-semibold hover:bg-[#F0F8DF]"
                  >
                    <Edit3 className="w-3 h-3" />
                    Koreksi
                  </button>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(['Hadir', 'Izin', 'Sakit', 'Alfa'] as AttendanceStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => void handleManualRecord(r.student_id, st)}
                        className="rounded-full border border-[#D5E4B6] hover:bg-[#B5D45D] px-3 py-1 text-xs font-semibold transition-colors"
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
};
