import React, { useCallback, useEffect, useState } from 'react';
import {
  CheckSquare,
  ExternalLink,
  FileCheck2,
  FileText,
  History,
  Search,
  Sparkles,
} from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import { formatWibDateTime } from '../../../shared/time';

interface SubmissionRow {
  id: string;
  assignment_id: string;
  assignment_title: string;
  student_id: string;
  student_name: string;
  nim: string;
  study_program_code: string;
  class_name: string;
  submitted_at_utc: string;
  is_late: number;
  revision_count: number;
  status: string;
  is_verified: number;
  score: number | null;
  feedback: string | null;
  latest_ai_status: string | null;
  latest_ai_match: number | null;
}

interface SubmissionDetail {
  submission: Record<string, unknown>;
  revisions: Array<Record<string, unknown>>;
  verification: { checklist_json: string; is_verified: number; notes: string } | null;
  grade: { id: string; score: number; feedback: string; needs_revision: number; graded_at_utc: string } | null;
  gradeHistory: Array<{
    id: string;
    previous_score: number | null;
    new_score: number;
    new_feedback: string;
    changed_by_name: string;
    changed_at_utc: string;
  }>;
  aiAnalyses: Array<{
    id: string;
    status: 'COMPLETED' | 'UNAVAILABLE';
    file_status: string;
    completeness_status: string;
    match_percentage: number | null;
    summary: string;
    matched_parts_json: string;
    unmatched_parts_json: string;
    revision_recommendations_json: string;
    model_used: string;
    analyzed_at_utc: string;
  }>;
}

const DEFAULT_CHECKLIST = [
  'Format file / tautan sesuai ketentuan',
  'Identitas mahasiswa tercantum jelas',
  'Seluruh instruksi utama terjawab',
];

export const AdminSubmissionsGradingPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [items, setItems] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState('');
  const [gradedFilter, setGradedFilter] = useState('');

  // Active inspection modal
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [checklist, setChecklist] = useState<Array<{ label: string; checked: boolean }>>([]);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [score, setScore] = useState<number>(85);
  const [feedback, setFeedback] = useState('');
  const [needsRevision, setNeedsRevision] = useState(false);
  const [aiRunning, setAiRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        search,
        verified: verifiedFilter,
        graded: gradedFilter,
      });
      const res = await apiRequest<{ items: SubmissionRow[] }>(`/api/admin/submissions?${qs.toString()}`);
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar pengumpulan');
    } finally {
      setLoading(false);
    }
  }, [search, verifiedFilter, gradedFilter]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const openInspect = async (id: string) => {
    const res = await apiRequest<SubmissionDetail>(`/api/admin/submissions/${id}`);
    setDetail(res);
    if (res.verification?.checklist_json) {
      try {
        setChecklist(JSON.parse(res.verification.checklist_json));
      } catch {
        setChecklist(DEFAULT_CHECKLIST.map((label) => ({ label, checked: false })));
      }
      setVerifyNotes(res.verification.notes ?? '');
    } else {
      setChecklist(DEFAULT_CHECKLIST.map((label) => ({ label, checked: false })));
      setVerifyNotes('');
    }
    setScore(res.grade?.score ?? 85);
    setFeedback(res.grade?.feedback ?? '');
    setNeedsRevision(Boolean(res.grade?.needs_revision));
  };

  const handleSaveVerify = async (isVerified: boolean) => {
    if (!detail) return;
    const subId = String(detail.submission.id);
    await apiRequest(`/api/admin/submissions/${subId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ checklist, isVerified, notes: verifyNotes }),
    });
    pushToast({ type: 'success', title: isVerified ? 'Pengumpulan terverifikasi' : 'Checklist disimpan' });
    await openInspect(subId);
    await load();
  };

  const handleRunAi = async () => {
    if (!detail) return;
    const subId = String(detail.submission.id);
    setAiRunning(true);
    try {
      const res = await apiRequest<{ status: string }>(`/api/admin/submissions/${subId}/ai-analyze`, {
        method: 'POST',
      });
      if (res.status === 'COMPLETED') {
        pushToast({ type: 'success', title: 'Rekomendasi AI Assistant selesai' });
      } else {
        pushToast({
          type: 'info',
          title: 'Integrasi Gemini AI Belum Aktif',
          description: 'Status transparan ditampilkan pada panel AI Assistant.',
        });
      }
      await openInspect(subId);
    } finally {
      setAiRunning(false);
    }
  };

  const handleSaveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    const subId = String(detail.submission.id);
    try {
      await apiRequest(`/api/admin/submissions/${subId}/grade`, {
        method: 'POST',
        body: JSON.stringify({ score, feedback, needsRevision }),
      });
      pushToast({ type: 'success', title: 'Penilaian disimpan & notifikasi dikirim ke mahasiswa' });
      await openInspect(subId);
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan nilai', description: err instanceof Error ? err.message : '' });
    }
  };

  const latestAi = detail?.aiAnalyses?.[0] ?? null;
  const parseArr = (jsonStr: string): string[] => {
    try {
      const arr = JSON.parse(jsonStr);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-5">
      {/* Filter Bar */}
      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#536F1A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari mahasiswa, NIM, atau judul tugas..."
            className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-9 pr-3 py-2 text-xs"
          />
        </div>
        <select
          value={verifiedFilter}
          onChange={(e) => setVerifiedFilter(e.target.value)}
          className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
        >
          <option value="">Semua Status Verifikasi</option>
          <option value="yes">Sudah Terverifikasi</option>
          <option value="no">Belum Diverifikasi</option>
        </select>
        <select
          value={gradedFilter}
          onChange={(e) => setGradedFilter(e.target.value)}
          className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
        >
          <option value="">Semua Status Penilaian</option>
          <option value="yes">Sudah Dinilai</option>
          <option value="no">Menunggu Penilaian</option>
        </select>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 className="w-5 h-5" />}
          title="Belum Ada Pengumpulan Tugas"
          description="Pengumpulan tugas dari mahasiswa akan tampil di sini untuk diverifikasi, dianalisis AI Assistant, dan diberi nilai."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">Mahasiswa</th>
                <th className="px-4 py-3">Prodi · Kelas</th>
                <th className="px-4 py-3">Tugas</th>
                <th className="px-4 py-3">Waktu Kumpul WIB</th>
                <th className="px-4 py-3">Verifikasi · Revisi</th>
                <th className="px-4 py-3 text-right">Nilai</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {items.map((sub) => (
                <tr key={sub.id} className="hover:bg-[#F0F8DF]/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#20251D]">{sub.student_name}</p>
                    <p className="text-xs font-mono text-[#536F1A]">{sub.nim}</p>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {sub.study_program_code} · {sub.class_name}
                  </td>
                  <td className="px-4 py-3 text-xs font-medium max-w-[200px] truncate">{sub.assignment_title}</td>
                  <td className="px-4 py-3 text-xs font-mono tabular-nums">
                    {formatWibDateTime(sub.submitted_at_utc)}
                    {sub.is_late === 1 && <span className="block text-red-700 font-semibold">Terlambat</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={sub.is_verified ? 'text-[#364B0F] font-semibold' : 'text-amber-700'}>
                      {sub.is_verified ? 'Terverifikasi' : 'Belum'}
                    </span>
                    <span className="mx-1.5 text-[#D5E4B6]">·</span>
                    <span>Rev {sub.revision_count}</span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">
                    {sub.score !== null ? sub.score : '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => void openInspect(sub.id)}
                      className="rounded-full bg-[#171A17] hover:bg-[#232822] text-[#B5D45D] px-4 py-1.5 text-xs font-semibold"
                    >
                      Periksa & Nilai
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Inspeksi: Jawaban + Verifikasi + AI Assistant Human-in-the-Loop + Penilaian */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title={`Evaluasi: ${String(detail?.submission?.student_name ?? '')}`}
        subtitle={`${String(detail?.submission?.assignment_title ?? '')} · ${String(detail?.submission?.nim ?? '')}`}
        maxWidthClass="max-w-4xl"
      >
        {detail && (
          <div className="space-y-6">
            {/* Jawaban Mahasiswa */}
            <div className="rounded-2xl bg-[#F0F8DF] border border-[#D5E4B6] p-4 space-y-2">
              <h4 className="text-xs font-bold text-[#364B0F]">Jawaban Mahasiswa</h4>
              {Boolean(detail.submission.text_answer) && (
                <p className="text-sm text-[#20251D] whitespace-pre-line bg-white rounded-xl p-3 border border-[#D5E4B6]">
                  {String(detail.submission.text_answer)}
                </p>
              )}
              <div className="flex flex-wrap gap-2 pt-1">
                {Boolean(detail.submission.storage_path) && (
                  <button
                    type="button"
                    onClick={() =>
                      void apiDownloadFile(
                        `/api/files/download/${String(detail.submission.storage_path)}`,
                        String(detail.submission.file_name || 'file-mahasiswa')
                      )
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] text-[#F0F8DF] px-4 py-2 text-xs font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#B5D45D]" />
                    Unduh: {String(detail.submission.file_name)}
                  </button>
                )}
                {Boolean(detail.submission.link_url) && (
                  <a
                    href={String(detail.submission.link_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-white border border-[#D5E4B6] px-4 py-2 text-xs font-semibold text-[#364B0F] hover:underline"
                  >
                    Buka Link Drive/URL <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Verifikasi Checklist */}
              <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 space-y-3">
                <h4 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
                  <CheckSquare className="w-4 h-4 text-[#536F1A]" />
                  Verifikasi Checklist
                </h4>
                <div className="space-y-2">
                  {checklist.map((item, idx) => (
                    <label key={idx} className="flex items-center gap-2.5 text-xs cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={(e) => {
                          const next = [...checklist];
                          next[idx] = { ...item, checked: e.target.checked };
                          setChecklist(next);
                        }}
                        className="w-4 h-4 accent-[#536F1A]"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
                <input
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="Catatan verifikasi (opsional)"
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-xs"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveVerify(true)}
                  className="w-full rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] py-2 text-xs font-bold"
                >
                  Simpan & Tandai Terverifikasi
                </button>
              </div>

              {/* AI Assistant Human-in-the-Loop */}
              <div className="rounded-2xl bg-[#171A17] text-[#F0F8DF] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-[#B5D45D]" />
                      AI Assistant (Human-in-the-Loop)
                    </h4>
                    <p className="text-[11px] text-[#DCECB8]/70">
                      AI hanya memberi rekomendasi, bukan nilai akhir otomatis.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={aiRunning}
                    onClick={() => void handleRunAi()}
                    className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] disabled:opacity-50 text-[#171A17] px-3.5 py-1.5 text-xs font-bold whitespace-nowrap"
                  >
                    {aiRunning ? 'Menganalisis...' : 'Analisis AI'}
                  </button>
                </div>

                {!latestAi ? (
                  <p className="text-xs text-[#DCECB8]/75 py-4">
                    Klik &ldquo;Analisis AI&rdquo; untuk mendapatkan ringkasan kesesuaian dan rekomendasi revisi.
                  </p>
                ) : (
                  <div className="space-y-2 text-xs bg-[#232822] rounded-xl p-3">
                    <div className="flex justify-between">
                      <span className="text-[#B5D45D] font-semibold">
                        Status: {latestAi.status === 'COMPLETED' ? 'Rekomendasi Tersedia' : 'Layanan AI Tidak Aktif'}
                      </span>
                      {latestAi.match_percentage !== null && (
                        <span className="font-mono font-bold text-white">
                          Kesesuaian: {latestAi.match_percentage}%
                        </span>
                      )}
                    </div>
                    <p><strong>Status File:</strong> {latestAi.file_status}</p>
                    <p><strong>Kelengkapan:</strong> {latestAi.completeness_status}</p>
                    <p><strong>Ringkasan:</strong> {latestAi.summary}</p>
                    {parseArr(latestAi.matched_parts_json).length > 0 && (
                      <div>
                        <strong className="text-[#B5D45D]">Bagian Sesuai:</strong>
                        <ul className="list-disc pl-4">
                          {parseArr(latestAi.matched_parts_json).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parseArr(latestAi.unmatched_parts_json).length > 0 && (
                      <div>
                        <strong className="text-amber-300">Bagian Belum Sesuai:</strong>
                        <ul className="list-disc pl-4">
                          {parseArr(latestAi.unmatched_parts_json).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {parseArr(latestAi.revision_recommendations_json).length > 0 && (
                      <div>
                        <strong className="text-white">Rekomendasi Revisi:</strong>
                        <ul className="list-disc pl-4">
                          {parseArr(latestAi.revision_recommendations_json).map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Form Penilaian Final Admin */}
            <form onSubmit={handleSaveGrade} className="rounded-2xl bg-white border border-[#D5E4B6] p-4 space-y-3">
              <h4 className="text-sm font-bold text-[#20251D]">Penilaian Final Admin</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Nilai (0–100)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step="0.5"
                    required
                    value={score}
                    onChange={(e) => setScore(Number(e.target.value))}
                    className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm font-mono font-bold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold mb-1">Feedback Admin (Minimal 3 Karakter)</label>
                  <input
                    required
                    minLength={3}
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    placeholder="Berikan catatan penilaian yang jelas..."
                    className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={needsRevision}
                    onChange={(e) => setNeedsRevision(e.target.checked)}
                    className="w-4 h-4 accent-[#536F1A]"
                  />
                  Tandai tugas perlu revisi oleh mahasiswa
                </label>
                <button
                  type="submit"
                  className="rounded-full bg-[#171A17] hover:bg-[#232822] text-[#B5D45D] px-6 py-2.5 text-xs font-bold"
                >
                  Simpan Nilai Final
                </button>
              </div>
            </form>

            {/* Riwayat Perubahan Nilai & Revisi */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl border border-[#D5E4B6] p-4">
                <h5 className="font-bold text-[#20251D] flex items-center gap-1.5 mb-2">
                  <History className="w-3.5 h-3.5 text-[#536F1A]" />
                  Riwayat Perubahan Nilai
                </h5>
                {detail.gradeHistory.length === 0 ? (
                  <p className="text-[#536F1A]">Belum ada riwayat perubahan nilai.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.gradeHistory.map((gh) => (
                      <div key={gh.id} className="p-2 rounded-xl bg-[#F0F8DF]">
                        <p className="font-mono font-bold">
                          {gh.previous_score !== null ? `${gh.previous_score} → ` : ''}
                          {gh.new_score}/100
                        </p>
                        <p className="text-[#536F1A]">
                          {gh.changed_by_name} · {formatWibDateTime(gh.changed_at_utc)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[#D5E4B6] p-4">
                <h5 className="font-bold text-[#20251D] mb-2">Riwayat Revisi Mahasiswa</h5>
                {detail.revisions.length === 0 ? (
                  <p className="text-[#536F1A]">Belum ada revisi.</p>
                ) : (
                  <div className="space-y-2">
                    {detail.revisions.map((rev) => (
                      <div key={String(rev.id)} className="p-2 rounded-xl bg-[#F0F8DF]">
                        <p className="font-semibold">
                          Versi #{String(rev.revision_number)} · {formatWibDateTime(String(rev.submitted_at_utc))}
                        </p>
                        {Boolean(rev.note) && <p className="text-[#536F1A]">{String(rev.note)}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
