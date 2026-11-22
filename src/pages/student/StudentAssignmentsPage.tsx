import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, ExternalLink, FileText, Paperclip, Send, Upload } from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CardsSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import { formatCountdown, formatWibDateTime } from '../../../shared/time';

interface StudentAssignmentRow {
  id: string;
  title: string;
  description: string;
  deadlineUtc: string;
  allowLate: boolean;
  lockAfterDeadline: boolean;
  allowedFormats: string;
  maxFileSizeMb: number;
  submissionMethod: 'TEXT' | 'LINK' | 'FILE' | 'ANY';
  externalLink: string;
  attachments: Array<{ id: string; fileName: string; storagePath: string }>;
  mySubmission: {
    id: string;
    textAnswer: string;
    linkUrl: string;
    fileName: string;
    storagePath: string;
    submittedAtUtc: string;
    isLate: boolean;
    revisionCount: number;
    status: string;
    isVerified: boolean;
    grade: { score: number; feedback: string } | null;
  } | null;
}

export const StudentAssignmentsPage: React.FC = () => {
  const { pushToast, refreshUser } = useAuth();
  const [items, setItems] = useState<StudentAssignmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Submit / Revise Modal
  const [activeTask, setActiveTask] = useState<StudentAssignmentRow | null>(null);
  const [textAnswer, setTextAnswer] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [revisionNote, setRevisionNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: StudentAssignmentRow[] }>('/api/student/assignments');
      setItems(res.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat tugas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openSubmitModal = (a: StudentAssignmentRow) => {
    setActiveTask(a);
    setTextAnswer(a.mySubmission?.textAnswer ?? '');
    setLinkUrl(a.mySubmission?.linkUrl ?? '');
    setRevisionNote('');
    setFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTask) return;
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('textAnswer', textAnswer);
      fd.append('linkUrl', linkUrl);
      fd.append('revisionNote', revisionNote);
      if (file) fd.append('file', file);

      const res = await apiRequest<{ revisionNumber: number; xpEarned: number; isLate: boolean }>(
        `/api/student/assignments/${activeTask.id}/submit`,
        { method: 'POST', body: fd }
      );
      pushToast({
        type: 'success',
        title: res.revisionNumber > 0 ? `Revisi ke-${res.revisionNumber} Tersimpan` : `Tugas Terkumpul (+${res.xpEarned} XP)`,
        description: res.isLate ? 'Tercatat terlambat sesuai waktu server.' : undefined,
      });
      setActiveTask(null);
      await Promise.all([load(), refreshUser()]);
    } catch (err) {
      pushToast({ type: 'error', title: 'Pengumpulan gagal', description: err instanceof Error ? err.message : '' });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <CardsSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      {items.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-5 h-5" />}
          title="Belum Ada Tugas untuk Kelas Anda"
          description="Tugas yang ditargetkan Admin ke kelas atau program studi Anda akan tampil otomatis di sini."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((a) => {
            const cd = formatCountdown(a.deadlineUtc);
            const isLocked = cd.isPast && (a.lockAfterDeadline || !a.allowLate);
            return (
              <div key={a.id} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-medium text-[#536F1A]">
                        Metode: {a.submissionMethod} ·{' '}
                        <span className={cd.isPast ? 'text-red-700 font-semibold' : 'text-[#364B0F] font-semibold'}>
                          {cd.label}
                        </span>
                      </p>
                      <h3 className="text-base font-bold text-[#20251D] mt-1">{a.title}</h3>
                    </div>
                    {a.mySubmission && (
                      <span className="rounded-full bg-[#171A17] text-[#B5D45D] px-3 py-1 text-[11px] font-bold shrink-0">
                        {a.mySubmission.status === 'NEEDS_REVISION'
                          ? 'Perlu Revisi'
                          : a.mySubmission.grade
                            ? `Nilai ${a.mySubmission.grade.score}`
                            : 'Terkumpul'}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-[#20251D]/85 whitespace-pre-line">{a.description}</p>

                  <p className="text-xs font-mono tabular-nums text-[#536F1A]">
                    Deadline: {formatWibDateTime(a.deadlineUtc)}
                  </p>

                  {(a.attachments.length > 0 || a.externalLink) && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {a.attachments.map((att) => (
                        <button
                          key={att.id}
                          type="button"
                          onClick={() =>
                            void apiDownloadFile(`/api/files/download/${att.storagePath}`, att.fileName)
                          }
                          className="inline-flex items-center gap-1 rounded-full bg-[#F0F8DF] border border-[#D5E4B6] px-3 py-1 text-[11px] font-semibold"
                        >
                          <Paperclip className="w-3 h-3" />
                          {att.fileName}
                        </button>
                      ))}
                      {a.externalLink && (
                        <a
                          href={a.externalLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-full bg-[#F0F8DF] border border-[#D5E4B6] px-3 py-1 text-[11px] font-semibold text-[#364B0F]"
                        >
                          Link Referensi <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {a.mySubmission && (
                    <div className="mt-2 p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] text-xs space-y-1">
                      <p className="font-semibold text-[#20251D]">
                        Dikumpulkan: {formatWibDateTime(a.mySubmission.submittedAtUtc)}{' '}
                        {a.mySubmission.isLate && <span className="text-red-700">(Terlambat)</span>}
                      </p>
                      <p className="text-[#536F1A]">
                        Revisi: {a.mySubmission.revisionCount} · Verifikasi:{' '}
                        {a.mySubmission.isVerified ? 'Terverifikasi' : 'Menunggu'}
                      </p>
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[#EBF3DA] flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#536F1A]">
                    Format: {a.allowedFormats} (maks {a.maxFileSizeMb} MB)
                  </span>
                  {isLocked ? (
                    <span className="text-xs font-semibold text-red-700">Tugas Dikunci</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSubmitModal(a)}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {a.mySubmission ? 'Kirim Revisi' : 'Kumpulkan Tugas'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(activeTask)}
        onClose={() => setActiveTask(null)}
        title={activeTask?.mySubmission ? `Revisi Tugas: ${activeTask.title}` : `Kumpulkan: ${activeTask?.title ?? ''}`}
        subtitle={`Deadline server: ${formatWibDateTime(activeTask?.deadlineUtc)}`}
      >
        {activeTask && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {(activeTask.submissionMethod === 'ANY' || activeTask.submissionMethod === 'TEXT') && (
              <div>
                <label className="block text-xs font-semibold mb-1">Jawaban Teks</label>
                <textarea
                  rows={4}
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Tuliskan jawaban atau ringkasan tugas Anda..."
                  className="w-full rounded-2xl border border-[#D5E4B6] p-3 text-sm"
                />
              </div>
            )}

            {(activeTask.submissionMethod === 'ANY' || activeTask.submissionMethod === 'LINK') && (
              <div>
                <label className="block text-xs font-semibold mb-1">Link URL / Google Drive</label>
                <input
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                />
              </div>
            )}

            {(activeTask.submissionMethod === 'ANY' || activeTask.submissionMethod === 'FILE') && (
              <div>
                <label className="block text-xs font-semibold mb-1">
                  Upload File ({activeTask.allowedFormats}, maks {activeTask.maxFileSizeMb} MB)
                </label>
                <label className="flex items-center gap-2 rounded-2xl border border-dashed border-[#536F1A] bg-[#F0F8DF]/50 p-4 text-xs cursor-pointer">
                  <Upload className="w-4 h-4 text-[#536F1A]" />
                  <span>{file ? file.name : 'Pilih file untuk diunggah'}</span>
                  <input
                    type="file"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {activeTask.mySubmission && (
              <div>
                <label className="block text-xs font-semibold mb-1">Catatan Revisi</label>
                <input
                  value={revisionNote}
                  onChange={(e) => setRevisionNote(e.target.value)}
                  placeholder="Jelaskan perubahan yang dilakukan pada revisi ini..."
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setActiveTask(null)}
                className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="rounded-full bg-[#171A17] text-[#B5D45D] px-6 py-2 text-xs font-bold"
              >
                {submitting ? 'Mengirim...' : activeTask.mySubmission ? 'Simpan Revisi' : 'Kirim Pengumpulan'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
};
