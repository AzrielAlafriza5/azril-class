import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, Eye, ExternalLink, FileText, Paperclip, Plus, Power, Trash2 } from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { CardsSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import { formatCountdown, formatWibDateTime, wibLocalInputToUtcIso } from '../../../shared/time';
import type { AssignmentItem, SubmissionMethod } from '../../../shared/types';

export const AdminAssignmentsPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; study_program_code: string }>>([]);
  const [prodis, setProdis] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [deadlineWib, setDeadlineWib] = useState('');
  const [allowLate, setAllowLate] = useState(true);
  const [lockAfterDeadline, setLockAfterDeadline] = useState(false);
  const [allowedFormats, setAllowedFormats] = useState('pdf,docx,xlsx,zip,jpg,png');
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(10);
  const [submissionMethod, setSubmissionMethod] = useState<SubmissionMethod>('ANY');
  const [externalLink, setExternalLink] = useState('');
  const [selectedTargets, setSelectedTargets] = useState<Array<{ targetType: 'CLASS' | 'PRODI'; targetId: string }>>([]);
  const [files, setFiles] = useState<File[]>([]);

  // Detail Modal
  const [detailModal, setDetailModal] = useState<{
    assignment: Record<string, unknown>;
    attachments: Array<{ id: string; fileName: string; storagePath: string }>;
    recipients: Array<Record<string, unknown>>;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [aRes, cRes, pRes] = await Promise.all([
        apiRequest<{ items: AssignmentItem[] }>('/api/admin/assignments'),
        apiRequest<{ items: Array<{ id: string; name: string; study_program_code: string }> }>('/api/admin/classes'),
        apiRequest<{ items: Array<{ id: string; code: string; name: string }> }>('/api/admin/study-programs'),
      ]);
      setItems(aRes.items);
      setClasses(cRes.items);
      setProdis(pRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar penugasan');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleTarget = (targetType: 'CLASS' | 'PRODI', targetId: string) => {
    setSelectedTargets((prev) => {
      const exists = prev.some((t) => t.targetType === targetType && t.targetId === targetId);
      if (exists) return prev.filter((t) => !(t.targetType === targetType && t.targetId === targetId));
      return [...prev, { targetType, targetId }];
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTargets.length === 0) {
      pushToast({ type: 'error', title: 'Pilih minimal 1 target kelas atau program studi' });
      return;
    }
    const fd = new FormData();
    fd.append('title', title);
    fd.append('description', description);
    fd.append('deadlineUtc', wibLocalInputToUtcIso(deadlineWib));
    fd.append('allowLate', String(allowLate));
    fd.append('lockAfterDeadline', String(lockAfterDeadline));
    fd.append('allowedFormats', allowedFormats);
    fd.append('maxFileSizeMb', String(maxFileSizeMb));
    fd.append('submissionMethod', submissionMethod);
    fd.append('externalLink', externalLink);
    fd.append('targetsJson', JSON.stringify(selectedTargets));
    files.slice(0, 2).forEach((f) => fd.append('attachments', f));

    try {
      await apiRequest('/api/admin/assignments', { method: 'POST', body: fd });
      pushToast({ type: 'success', title: 'Tugas berhasil dibuat & notifikasi dikirim' });
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setExternalLink('');
      setSelectedTargets([]);
      setFiles([]);
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal membuat tugas', description: err instanceof Error ? err.message : '' });
    }
  };

  const openDetail = async (id: string) => {
    const res = await apiRequest<{
      assignment: Record<string, unknown>;
      attachments: Array<{ id: string; fileName: string; storagePath: string }>;
      recipients: Array<Record<string, unknown>>;
    }>(`/api/admin/assignments/${id}/detail`);
    setDetailModal(res);
  };

  const handleToggleActive = async (a: AssignmentItem) => {
    await apiRequest(`/api/admin/assignments/${a.id}/toggle`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    pushToast({ type: 'success', title: a.isActive ? 'Tugas dinonaktifkan' : 'Tugas diaktifkan' });
    await load();
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/api/admin/assignments/${id}`, { method: 'DELETE' });
    pushToast({ type: 'success', title: 'Tugas dihapus' });
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#536F1A]">
          Tugas otomatis muncul kepada mahasiswa sesuai target kelas atau program studi.
        </p>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2 text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Buat Penugasan
        </button>
      </div>

      {loading ? (
        <CardsSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="w-5 h-5" />}
          title="Belum Ada Penugasan"
          description="Buat tugas pertama untuk kelas atau program studi tertentu lengkap dengan lampiran dan aturan deadline WIB."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((a) => {
            const cd = formatCountdown(a.deadlineUtc);
            return (
              <div key={a.id} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between gap-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-[#536F1A]">
                        {a.isActive ? 'Aktif' : 'Nonaktif'} · {a.submissionMethod} ·{' '}
                        <span className={cd.isPast ? 'text-red-700 font-semibold' : 'text-[#364B0F]'}>{cd.label}</span>
                      </p>
                      <h3 className="text-base font-bold text-[#20251D] mt-1">{a.title}</h3>
                    </div>
                    <span className="text-xs font-mono tabular-nums font-bold bg-[#F0F8DF] border border-[#D5E4B6] px-2.5 py-1 rounded-full shrink-0">
                      {a.submissionCount ?? 0}/{a.targetStudentCount ?? 0}
                    </span>
                  </div>

                  <p className="text-xs text-[#20251D]/80 mt-2 line-clamp-3 whitespace-pre-line">{a.description}</p>

                  <div className="mt-3 text-xs text-[#536F1A] space-y-1">
                    <p className="font-mono tabular-nums">Deadline: {formatWibDateTime(a.deadlineUtc)}</p>
                    <p>Target: {a.targets.map((t) => t.label).join(', ')}</p>
                    {a.attachments.length > 0 && (
                      <p className="flex items-center gap-1">
                        <Paperclip className="w-3 h-3" /> {a.attachments.length} lampiran file
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#EBF3DA]">
                  <button
                    type="button"
                    onClick={() => void openDetail(a.id)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] text-[#F0F8DF] px-4 py-2 text-xs font-semibold"
                  >
                    <Eye className="w-3.5 h-3.5 text-[#B5D45D]" />
                    Detail & Penerima
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleToggleActive(a)}
                    className="inline-flex items-center gap-1 rounded-full border border-[#D5E4B6] px-3.5 py-2 text-xs font-semibold hover:bg-[#F0F8DF]"
                  >
                    <Power className="w-3.5 h-3.5" />
                    {a.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(a.id)}
                    className="p-2 rounded-full hover:bg-red-50 text-red-600 ml-auto"
                    aria-label="Hapus Tugas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Buat Tugas */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat Penugasan Baru"
        subtitle="Aturan deadline mengacu pada waktu server (WIB)"
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Judul Tugas</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Deskripsi Tugas (Tanpa Batas Kata)</label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tuliskan instruksi tugas selengkap mungkin..."
              className="w-full rounded-2xl border border-[#D5E4B6] p-3 text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Deadline (Tanggal & Jam WIB)</label>
              <input
                type="datetime-local"
                required
                value={deadlineWib}
                onChange={(e) => setDeadlineWib(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Metode Pengumpulan</label>
              <select
                value={submissionMethod}
                onChange={(e) => setSubmissionMethod(e.target.value as SubmissionMethod)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="ANY">Bebas (Teks / Link / File)</option>
                <option value="FILE">Upload File</option>
                <option value="LINK">Link URL / Google Drive</option>
                <option value="TEXT">Jawaban Teks</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Format File Diperbolehkan</label>
              <input
                value={allowedFormats}
                onChange={(e) => setAllowedFormats(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-xs font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Batas Ukuran File (MB)</label>
              <input
                type="number"
                min={1}
                max={100}
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Link File Referensi / Modul (Opsional)</label>
            <input
              type="url"
              value={externalLink}
              onChange={(e) => setExternalLink(e.target.value)}
              placeholder="https://drive.google.com/..."
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Lampiran File (Maksimal 2 File)</label>
            <input
              type="file"
              multiple
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 2))}
              className="text-xs"
            />
            {files.length > 0 && (
              <p className="text-xs text-[#536F1A] mt-1">{files.map((f) => f.name).join(', ')}</p>
            )}
          </div>

          <div className="space-y-2 p-3 rounded-2xl bg-[#F0F8DF] border border-[#D5E4B6]">
            <p className="text-xs font-bold text-[#364B0F]">Target Tugas (Pilih Kelas dan/atau Prodi)</p>
            <div className="flex flex-wrap gap-2">
              {prodis.map((p) => {
                const active = selectedTargets.some((t) => t.targetType === 'PRODI' && t.targetId === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleTarget('PRODI', p.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#171A17] text-[#B5D45D] border-[#171A17]'
                        : 'bg-white text-[#20251D] border-[#D5E4B6]'
                    }`}
                  >
                    Prodi {p.code}
                  </button>
                );
              })}
              {classes.map((c) => {
                const active = selectedTargets.some((t) => t.targetType === 'CLASS' && t.targetId === c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggleTarget('CLASS', c.id)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold border transition-colors ${
                      active
                        ? 'bg-[#B5D45D] text-[#171A17] border-[#536F1A]'
                        : 'bg-white text-[#20251D] border-[#D5E4B6]'
                    }`}
                  >
                    Kelas {c.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-4 text-xs font-medium">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allowLate}
                onChange={(e) => setAllowLate(e.target.checked)}
                className="accent-[#536F1A]"
              />
              Izinkan pengumpulan terlambat (+10 XP)
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={lockAfterDeadline}
                onChange={(e) => setLockAfterDeadline(e.target.checked)}
                className="accent-[#536F1A]"
              />
              Kunci pengumpulan setelah deadline
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-6 py-2 text-xs font-bold"
            >
              Terbitkan Tugas
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Detail Tugas */}
      <Modal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        title={String(detailModal?.assignment?.title ?? 'Detail Tugas')}
        subtitle={`Deadline: ${formatWibDateTime(String(detailModal?.assignment?.deadline_utc ?? ''))}`}
        maxWidthClass="max-w-3xl"
      >
        {detailModal && (
          <div className="space-y-4">
            {detailModal.attachments.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {detailModal.attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() =>
                      void apiDownloadFile(`/api/files/download/${att.storagePath}`, att.fileName)
                    }
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F8DF] border border-[#D5E4B6] px-3.5 py-1.5 text-xs font-semibold"
                  >
                    <FileText className="w-3.5 h-3.5 text-[#536F1A]" />
                    {att.fileName}
                  </button>
                ))}
              </div>
            )}

            <div className="rounded-2xl border border-[#D5E4B6] overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] font-semibold text-[#364B0F]">
                  <tr>
                    <th className="px-3 py-2.5">Mahasiswa</th>
                    <th className="px-3 py-2.5">Kelas</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Lampiran / Link</th>
                    <th className="px-3 py-2.5 text-right">Revisi · Nilai</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#EBF3DA]">
                  {detailModal.recipients.map((r) => (
                    <tr key={String(r.student_id)}>
                      <td className="px-3 py-2.5">
                        <p className="font-semibold">{String(r.full_name)}</p>
                        <p className="font-mono text-[11px] text-[#536F1A]">{String(r.nim)}</p>
                      </td>
                      <td className="px-3 py-2.5">{String(r.class_name)}</td>
                      <td className="px-3 py-2.5">
                        {r.submission_id ? (
                          <span className="font-semibold text-[#364B0F]">
                            {Number(r.is_verified) === 1 ? 'Terverifikasi' : 'Terkumpul'}
                            {Number(r.is_late) === 1 ? ' (Terlambat)' : ''}
                          </span>
                        ) : (
                          <span className="text-neutral-500">Belum Mengumpulkan</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 space-x-2">
                        {Boolean(r.storage_path) && (
                          <button
                            type="button"
                            onClick={() =>
                              void apiDownloadFile(
                                `/api/files/download/${String(r.storage_path)}`,
                                String(r.file_name || 'jawaban')
                              )
                            }
                            className="text-[#536F1A] font-semibold hover:underline"
                          >
                            Buka File
                          </button>
                        )}
                        {Boolean(r.link_url) && (
                          <a
                            href={String(r.link_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-0.5 text-[#536F1A] font-semibold hover:underline"
                          >
                            Drive/URL <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        Rev {String(r.revision_count ?? 0)} ·{' '}
                        {r.score !== null && r.score !== undefined ? `${r.score}` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
