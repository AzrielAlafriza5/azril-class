import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  Edit2,
  FileSpreadsheet,
  KeyRound,
  Plus,
  Search,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import type { StudentBadge, StudentRecord } from '../../../shared/types';

interface ProdiOpt {
  id: string;
  code: string;
  name: string;
}
interface ClassOpt {
  id: string;
  name: string;
  study_program_id: string;
  study_program_code: string;
}

interface ExcelPreviewData {
  sheets: Array<{
    sheetName: string;
    suggestedClassId: string | null;
    suggestedClassName: string | null;
    suggestedProdiId: string | null;
    totalRows: number;
    validRows: number;
    newStudentRows: number;
    existingWithNewWeeksRows: number;
    skippedExistingRows: number;
    afkRows: number;
    skippedBlackRows: number;
    duplicateRows: number;
    invalidRows: number;
    detectedWeeks: number[];
  }>;
  rows: Array<{
    sheetName: string;
    rowNumber: number;
    nim: string;
    fullName: string;
    username: string;
    password: string;
    cohortYear: number;
    semester: number;
    badge: StudentBadge;
    skipBlack: boolean;
    isDuplicateInFile: boolean;
    existsInDb: boolean;
    newWeeksCount: number;
    existingWeeksCount: number;
    willSkipExisting: boolean;
    validationError: string | null;
    historicalWeeks: Record<number, string>;
  }>;
  detectedWeeks?: number[];
  ignoredSheets?: Array<{ sheetName: string; reason: string }>;
}

export const AdminStudentsPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [items, setItems] = useState<StudentRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prodis, setProdis] = useState<ProdiOpt[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterProdi, setFilterProdi] = useState('');
  const [filterClass, setFilterClass] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterBadge, setFilterBadge] = useState('');

  // Add/Edit Student Modal
  const [studentModal, setStudentModal] = useState<{ open: boolean; editing: StudentRecord | null }>({
    open: false,
    editing: null,
  });
  const [fNim, setFNim] = useState('');
  const [fName, setFName] = useState('');
  const [fUsername, setFUsername] = useState('');
  const [fPassword, setFPassword] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fProdiId, setFProdiId] = useState('');
  const [fClassId, setFClassId] = useState('');
  const [fCohort, setFCohort] = useState(2026);
  const [fSemester, setFSemester] = useState(1);
  const [fBadge, setFBadge] = useState<StudentBadge>('Netral');

  // Account Management & Delete Modals
  const [accountModal, setAccountModal] = useState<StudentRecord | null>(null);
  const [accUsername, setAccUsername] = useState('');
  const [accNewPass, setAccNewPass] = useState('');
  const [accActive, setAccActive] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirm, setDeleteConfirm] = useState<
    | { mode: 'single'; student: StudentRecord }
    | { mode: 'bulk'; ids: string[] }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  // Excel Import Modal
  const [excelModalOpen, setExcelModalOpen] = useState(false);
  const [excelPreview, setExcelPreview] = useState<ExcelPreviewData | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [sheetClassMap, setSheetClassMap] = useState<Record<string, string>>({});
  const [importHistorical, setImportHistorical] = useState(true);
  const [importProgress, setImportProgress] = useState(0);
  const [importing, setImporting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const loadMeta = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      apiRequest<{ items: ProdiOpt[] }>('/api/admin/study-programs'),
      apiRequest<{ items: ClassOpt[] }>('/api/admin/classes'),
    ]);
    setProdis(pRes.items);
    setClasses(cRes.items);
  }, []);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(page),
        limit: '15',
        search: searchQuery,
        prodiId: filterProdi,
        classId: filterClass,
        status: filterStatus,
        badge: filterBadge,
      });
      const res = await apiRequest<{
        items: Array<Record<string, unknown>>;
        total: number;
      }>(`/api/admin/students?${qs.toString()}`);

      setItems(
        res.items.map((r) => ({
          id: String(r.id),
          userId: String(r.user_id),
          username: String(r.username),
          email: r.email ? String(r.email) : null,
          isActive: Number(r.is_active) === 1,
          nim: String(r.nim),
          fullName: String(r.full_name),
          studyProgramId: String(r.study_program_id),
          studyProgramCode: String(r.study_program_code),
          studyProgramName: String(r.study_program_name),
          classId: String(r.class_id),
          className: String(r.class_name),
          cohortYear: Number(r.cohort_year),
          semester: Number(r.semester),
          badge: r.badge as StudentBadge,
          totalXp: Number(r.total_xp),
          currentStreak: Number(r.current_streak),
          longestStreak: Number(r.longest_streak),
          lastLoginDateWib: r.last_login_date_wib ? String(r.last_login_date_wib) : null,
          createdAt: String(r.created_at),
        }))
      );
      setTotal(res.total);
      setSelectedIds([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data mahasiswa');
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, filterProdi, filterClass, filterStatus, filterBadge]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  const openStudentForm = (row: StudentRecord | null) => {
    setStudentModal({ open: true, editing: row });
    setFNim(row?.nim ?? '');
    setFName(row?.fullName ?? '');
    setFUsername(row?.username ?? '');
    setFPassword('');
    setFEmail(row?.email ?? '');
    const defaultProdi = row?.studyProgramId ?? prodis[0]?.id ?? '';
    setFProdiId(defaultProdi);
    const matchingClass = classes.find((c) => c.study_program_id === defaultProdi);
    setFClassId(row?.classId ?? matchingClass?.id ?? classes[0]?.id ?? '');
    setFCohort(row?.cohortYear ?? 2026);
    setFSemester(row?.semester ?? 1);
    setFBadge(row?.badge ?? 'Netral');
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (studentModal.editing) {
        await apiRequest(`/api/admin/students/${studentModal.editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            nim: fNim,
            fullName: fName,
            email: fEmail,
            studyProgramId: fProdiId,
            classId: fClassId,
            cohortYear: fCohort,
            semester: fSemester,
            badge: fBadge,
          }),
        });
        pushToast({ type: 'success', title: 'Data mahasiswa diperbarui' });
      } else {
        await apiRequest('/api/admin/students', {
          method: 'POST',
          body: JSON.stringify({
            nim: fNim,
            fullName: fName,
            username: fUsername,
            password: fPassword,
            email: fEmail,
            studyProgramId: fProdiId,
            classId: fClassId,
            cohortYear: fCohort,
            semester: fSemester,
            badge: fBadge,
          }),
        });
        pushToast({ type: 'success', title: 'Mahasiswa & akun berhasil dibuat' });
      }
      setStudentModal({ open: false, editing: null });
      await loadStudents();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan mahasiswa', description: err instanceof Error ? err.message : '' });
    }
  };

  const confirmDeleteAction = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      if (deleteConfirm.mode === 'single') {
        const st = deleteConfirm.student;
        await apiRequest(`/api/admin/students/${st.id}`, { method: 'DELETE' });
        pushToast({ type: 'success', title: `Data & akun ${st.fullName} dihapus` });
        if (accountModal?.id === st.id) setAccountModal(null);
      } else {
        const res = await apiRequest<{ deleted: number }>('/api/admin/students/bulk-delete', {
          method: 'POST',
          body: JSON.stringify({ studentIds: deleteConfirm.ids }),
        });
        pushToast({ type: 'success', title: `${res.deleted} data & akun mahasiswa dihapus` });
        setSelectedIds([]);
      }
      setDeleteConfirm(null);
      await loadStudents();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menghapus', description: err instanceof Error ? err.message : '' });
    } finally {
      setDeleting(false);
    }
  };

  const openAccountModal = (st: StudentRecord) => {
    setAccountModal(st);
    setAccUsername(st.username);
    setAccNewPass('');
    setAccActive(st.isActive);
  };

  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountModal) return;
    try {
      await apiRequest(`/api/admin/students/${accountModal.id}/account`, {
        method: 'PATCH',
        body: JSON.stringify({
          username: accUsername,
          newPassword: accNewPass || undefined,
          isActive: accActive,
        }),
      });
      pushToast({
        type: 'success',
        title: 'Kredensial akun diperbarui',
        description: accNewPass ? 'Password baru telah di-hash secara aman.' : undefined,
      });
      setAccountModal(null);
      await loadStudents();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal memperbarui akun', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleExcelFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setExcelError(null);
    setExcelPreview(null);
    setImporting(true);
    setImportProgress(30);
    abortRef.current = new AbortController();
    try {
      const preview = await apiRequest<ExcelPreviewData>('/api/admin/students/import-excel/preview', {
        method: 'POST',
        body: fd,
        signal: abortRef.current.signal,
      });
      setExcelPreview(preview);
      const map: Record<string, string> = {};
      for (const s of preview.sheets) {
        const autoFallback = s.suggestedProdiId
          ? `__AUTO__:${s.suggestedProdiId}`
          : prodis[0]?.id
            ? `__AUTO__:${prodis[0].id}`
            : '';
        map[s.sheetName] = s.suggestedClassId ?? classes[0]?.id ?? autoFallback;
      }
      setSheetClassMap(map);
      setImportProgress(100);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Gagal membaca file Excel';
        setExcelError(msg);
        pushToast({ type: 'error', title: 'Gagal membaca Excel', description: msg });
      }
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  };

  const handleExcelCommit = async () => {
    if (!excelPreview) return;
    setExcelError(null);
    const sheetsNeedingClass = new Set(
      excelPreview.rows
        .filter((r) => !r.skipBlack && !r.validationError && !r.isDuplicateInFile && !r.existsInDb)
        .map((r) => r.sheetName)
    );
    const unmapped = Array.from(sheetsNeedingClass).filter((name) => !sheetClassMap[name]);
    if (unmapped.length > 0) {
      const msg = `Pilih kelas tujuan atau opsi buat kelas otomatis untuk sheet: ${unmapped.join(', ')}`;
      setExcelError(msg);
      pushToast({ type: 'error', title: 'Pemetaan kelas belum lengkap', description: msg });
      return;
    }

    setImporting(true);
    setImportProgress(25);
    abortRef.current = new AbortController();
    try {
      const res = await apiRequest<{
        created: number;
        updated: number;
        updatedWithNewWeeks?: number;
        historicalAdded?: number;
        skippedExisting?: number;
        skipped: number;
        autoCreatedClasses?: number;
      }>('/api/admin/students/import-excel/commit', {
        method: 'POST',
        body: JSON.stringify({
          sheetClassMap,
          rows: excelPreview.rows,
          importHistorical,
        }),
        signal: abortRef.current.signal,
      });
      setImportProgress(100);
      const parts = [
        `${res.created} mahasiswa baru`,
        `${res.historicalAdded ?? 0} absensi minggu baru`,
        `${res.skippedExisting ?? 0} data sudah ada (dilewati)`,
      ];
      if (res.skipped > 0) parts.push(`${res.skipped} baris dilewati`);
      if (res.autoCreatedClasses) parts.push(`${res.autoCreatedClasses} kelas baru dibuat`);
      pushToast({
        type: 'success',
        title: 'Import Excel Selesai',
        description: parts.join(', ') + '.',
      });
      setExcelModalOpen(false);
      setExcelPreview(null);
      await Promise.all([loadMeta(), loadStudents()]);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const msg = err instanceof Error ? err.message : 'Gagal menyimpan data import';
        setExcelError(msg);
        pushToast({ type: 'error', title: 'Gagal commit import', description: msg });
      }
    } finally {
      setImporting(false);
    }
  };

  const cancelImportProcess = () => {
    abortRef.current?.abort();
    setImporting(false);
    setImportProgress(0);
    pushToast({ type: 'info', title: 'Proses import dibatalkan' });
  };

  const totalPages = Math.max(1, Math.ceil(total / 15));

  return (
    <div className="space-y-5">
      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openStudentForm(null)}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Tambah Mahasiswa
          </button>
          <button
            type="button"
            onClick={() => {
              setExcelPreview(null);
              setExcelError(null);
              setImportProgress(0);
              setExcelModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] hover:bg-[#232822] text-[#F0F8DF] px-4 py-2 text-xs font-semibold transition-colors"
          >
            <Upload className="w-3.5 h-3.5 text-[#B5D45D]" />
            Import Excel (.xlsx)
          </button>
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={() => setDeleteConfirm({ mode: 'bulk', ids: selectedIds })}
              className="inline-flex items-center gap-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white px-4 py-2 text-xs font-semibold transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Hapus Terpilih ({selectedIds.length})
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void apiDownloadFile('/api/files/template-excel', 'Template_Import_Mahasiswa.xlsx')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#F0F8DF] px-3.5 py-2 text-xs font-semibold"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-[#536F1A]" />
            Template Excel
          </button>
          <button
            type="button"
            onClick={() => void apiDownloadFile('/api/admin/export?module=mahasiswa&format=csv', 'Data_Mahasiswa.csv')}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#F0F8DF] px-3.5 py-2 text-xs font-semibold"
          >
            <Download className="w-3.5 h-3.5 text-[#536F1A]" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative lg:col-span-1">
          <Search className="w-4 h-4 text-[#536F1A] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Cari nama / NIM..."
            className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
          />
        </div>
        <select
          value={filterProdi}
          onChange={(e) => {
            setFilterProdi(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-[#D5E4B6] bg-white px-3 py-2 text-xs"
        >
          <option value="">Semua Prodi</option>
          {prodis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>
        <select
          value={filterClass}
          onChange={(e) => {
            setFilterClass(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-[#D5E4B6] bg-white px-3 py-2 text-xs"
        >
          <option value="">Semua Kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.study_program_code})
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-[#D5E4B6] bg-white px-3 py-2 text-xs"
        >
          <option value="">Semua Status Akun</option>
          <option value="active">Akun Aktif</option>
          <option value="inactive">Akun Nonaktif</option>
        </select>
        <select
          value={filterBadge}
          onChange={(e) => {
            setFilterBadge(e.target.value);
            setPage(1);
          }}
          className="rounded-full border border-[#D5E4B6] bg-white px-3 py-2 text-xs"
        >
          <option value="">Semua Badge</option>
          <option value="Netral">Netral</option>
          <option value="AFK">AFK</option>
          <option value="Lulus">Lulus</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={loadStudents} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Users className="w-5 h-5" />}
          title="Belum Ada Data Mahasiswa"
          description="Tambahkan mahasiswa satu per satu atau gunakan Import Excel multi-sheet. Pastikan minimal 1 Kelas sudah tersedia."
          action={
            <button
              type="button"
              onClick={() => openStudentForm(null)}
              className="rounded-full bg-[#B5D45D] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              + Tambah Mahasiswa
            </button>
          }
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
              <tr>
                <th className="pl-4 pr-2 py-3 w-8">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua mahasiswa di halaman ini"
                    checked={items.length > 0 && items.every((st) => selectedIds.includes(st.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(items.map((st) => st.id));
                      } else {
                        setSelectedIds([]);
                      }
                    }}
                    className="w-4 h-4 accent-[#536F1A]"
                  />
                </th>
                <th className="px-4 py-3">NIM</th>
                <th className="px-4 py-3">Nama & Username</th>
                <th className="px-4 py-3">Prodi / Kelas</th>
                <th className="px-4 py-3">Badge · Status</th>
                <th className="px-4 py-3 text-right">XP</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {items.map((st) => (
                <tr key={st.id} className="hover:bg-[#F0F8DF]/40">
                  <td className="pl-4 pr-2 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Pilih ${st.fullName}`}
                      checked={selectedIds.includes(st.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds((prev) => (prev.includes(st.id) ? prev : [...prev, st.id]));
                        } else {
                          setSelectedIds((prev) => prev.filter((id) => id !== st.id));
                        }
                      }}
                      className="w-4 h-4 accent-[#536F1A]"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono tabular-nums text-xs font-semibold">{st.nim}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#20251D]">{st.fullName}</p>
                    <p className="text-xs font-mono text-[#536F1A]">@{st.username}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-[#20251D]">
                    {st.studyProgramCode} · {st.className} · Smst {st.semester}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className={st.badge === 'AFK' ? 'text-red-700 font-semibold' : 'text-[#536F1A] font-medium'}>
                      {st.badge}
                    </span>
                    <span className="mx-1.5 text-[#D5E4B6]">·</span>
                    <span className={st.isActive ? 'text-[#364B0F]' : 'text-red-700 font-semibold'}>
                      {st.isActive ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">{st.totalXp}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openAccountModal(st)}
                        title="Manajemen Akun & Reset Password"
                        className="p-2 rounded-full hover:bg-[#DCECB8] text-[#364B0F]"
                      >
                        <KeyRound className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => openStudentForm(st)}
                        title="Edit Mahasiswa"
                        className="p-2 rounded-full hover:bg-[#F0F8DF] text-[#536F1A]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm({ mode: 'single', student: st })}
                        title="Hapus Data & Akun Mahasiswa"
                        className="p-2 rounded-full hover:bg-red-50 text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-[#EBF3DA] flex items-center justify-between text-xs text-[#536F1A]">
            <span className="tabular-nums">
              Menampilkan {items.length} dari {total} mahasiswa
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-full border border-[#D5E4B6] px-3 py-1 disabled:opacity-40"
              >
                Sebelumnya
              </button>
              <span className="font-mono tabular-nums">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-full border border-[#D5E4B6] px-3 py-1 disabled:opacity-40"
              >
                Berikutnya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Tambah/Edit Mahasiswa */}
      <Modal
        open={studentModal.open}
        onClose={() => setStudentModal({ open: false, editing: null })}
        title={studentModal.editing ? 'Edit Data Mahasiswa' : 'Tambah Mahasiswa & Akun Baru'}
        subtitle="Username & password mahasiswa ditentukan sepenuhnya oleh Admin"
      >
        <form onSubmit={handleSaveStudent} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">NIM</label>
              <input
                required
                value={fNim}
                onChange={(e) => setFNim(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Nama Lengkap</label>
              <input
                required
                value={fName}
                onChange={(e) => setFName(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
          </div>

          {!studentModal.editing && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1">Username Login</label>
                <input
                  required
                  value={fUsername}
                  onChange={(e) => setFUsername(e.target.value)}
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1">Password Awal</label>
                <input
                  required
                  type="password"
                  minLength={4}
                  value={fPassword}
                  onChange={(e) => setFPassword(e.target.value)}
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Program Studi</label>
              <select
                required
                value={fProdiId}
                onChange={(e) => {
                  setFProdiId(e.target.value);
                  const firstCls = classes.find((c) => c.study_program_id === e.target.value);
                  if (firstCls) setFClassId(firstCls.id);
                }}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                {prodis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Kelas</label>
              <select
                required
                value={fClassId}
                onChange={(e) => setFClassId(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                {classes
                  .filter((c) => !fProdiId || c.study_program_id === fProdiId)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Angkatan</label>
              <input
                type="number"
                value={fCohort}
                onChange={(e) => setFCohort(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Semester</label>
              <input
                type="number"
                min={1}
                max={14}
                value={fSemester}
                onChange={(e) => setFSemester(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Badge</label>
              <select
                value={fBadge}
                onChange={(e) => setFBadge(e.target.value as StudentBadge)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="Netral">Netral</option>
                <option value="AFK">AFK</option>
                <option value="Lulus">Lulus</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1">Email (Opsional)</label>
            <input
              type="email"
              value={fEmail}
              onChange={(e) => setFEmail(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setStudentModal({ open: false, editing: null })}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              Simpan
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Manajemen Akun Mahasiswa */}
      <Modal
        open={Boolean(accountModal)}
        onClose={() => setAccountModal(null)}
        title="Manajemen Akun Mahasiswa"
        subtitle={accountModal ? `${accountModal.fullName} · ${accountModal.nim}` : ''}
      >
        <form onSubmit={handleSaveAccount} className="space-y-4">
          <div className="rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] p-3 text-xs text-[#364B0F]">
            Password lama tersimpan dalam bentuk hash kriptografis dan tidak dapat dibaca ulang. Anda dapat
            menentukan password baru untuk mereset akses mahasiswa.
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Username</label>
            <input
              required
              value={accUsername}
              onChange={(e) => setAccUsername(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Password Baru / Reset (Kosongkan jika tetap)</label>
            <input
              type="password"
              minLength={4}
              value={accNewPass}
              onChange={(e) => setAccNewPass(e.target.value)}
              placeholder="Minimal 4 karakter"
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <label className="flex items-center gap-2.5 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={accActive}
              onChange={(e) => setAccActive(e.target.checked)}
              className="w-4 h-4 accent-[#536F1A]"
            />
            Akun Aktif (dapat login ke Portal Mahasiswa)
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {accountModal ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm({ mode: 'single', student: accountModal })}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 px-4 py-2 text-xs font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Hapus Akun & Data
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setAccountModal(null)}
                className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
              >
                Batal
              </button>
              <button
                type="submit"
                className="rounded-full bg-[#171A17] text-[#B5D45D] px-5 py-2 text-xs font-bold"
              >
                Simpan Perubahan Akun
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal Konfirmasi Hapus Data & Akun Mahasiswa */}
      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => !deleting && setDeleteConfirm(null)}
        title={
          deleteConfirm?.mode === 'bulk'
            ? `Hapus ${deleteConfirm.ids.length} Mahasiswa Terpilih?`
            : 'Hapus Data & Akun Mahasiswa?'
        }
        subtitle="Tindakan ini menghapus data mahasiswa sekaligus akun login secara permanen"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-red-50 border border-red-200 p-3.5 text-xs text-red-900 space-y-1">
            {deleteConfirm?.mode === 'single' ? (
              <p>
                Anda akan menghapus <strong>{deleteConfirm.student.fullName}</strong> (NIM{' '}
                <span className="font-mono">{deleteConfirm.student.nim}</span> · akun{' '}
                <span className="font-mono">@{deleteConfirm.student.username}</span>).
              </p>
            ) : (
              <p>
                Anda akan menghapus <strong>{deleteConfirm?.ids.length ?? 0} data & akun mahasiswa</strong> yang
                dipilih.
              </p>
            )}
            <p>
              Seluruh riwayat absensi, pengumpulan tugas, nilai, XP, streak, dan notifikasi milik mahasiswa tersebut
              juga ikut terhapus.
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteConfirm(null)}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void confirmDeleteAction()}
              className="rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white px-5 py-2 text-xs font-bold"
            >
              {deleting ? 'Menghapus...' : 'Ya, Hapus Permanen'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Import Excel Multi-Sheet */}
      <Modal
        open={excelModalOpen}
        onClose={() => !importing && setExcelModalOpen(false)}
        title="Import Mahasiswa & Absensi dari Excel (.xlsx)"
        subtitle="Tanpa batas jumlah minggu · Data yang sudah ada otomatis dilewati (hanya input data baru)"
        maxWidthClass="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-dashed border-[#536F1A] bg-[#F0F8DF]/50 p-5 text-center space-y-3">
            <p className="text-xs text-[#20251D]">
              Pilih workbook <strong>.xlsx</strong> atau <strong>.csv</strong> dengan kolom <strong>NIM/NPM</strong>,{' '}
              <strong>Nama</strong>, dan kolom minggu berapapun (contoh: <strong>Minggu 1, Minggu 9, M12</strong>).
              Saat import ulang di minggu berikutnya, data mahasiswa & minggu yang sudah tersimpan tidak akan ditimpa.
            </p>
            <label className="inline-flex items-center gap-2 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2.5 text-xs font-bold cursor-pointer">
              <Upload className="w-4 h-4" />
              Pilih File .xlsx / .csv
              <input type="file" accept=".xlsx,.csv" onChange={handleExcelFileSelect} className="hidden" />
            </label>
          </div>

          {excelError && (
            <div role="alert" className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-800">
              {excelError}
            </div>
          )}

          {importing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span>Memproses workbook Excel...</span>
                <button
                  type="button"
                  onClick={cancelImportProcess}
                  className="text-red-600 font-semibold hover:underline"
                >
                  Batalkan Proses
                </button>
              </div>
              <div className="h-2 rounded-full bg-[#DCECB8] overflow-hidden">
                <div
                  className="h-full bg-[#536F1A] transition-all"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}

          {excelPreview && (
            <div className="space-y-4">
              {excelPreview.ignoredSheets && excelPreview.ignoredSheets.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-xs text-amber-900">
                  Sheet dilewati: {excelPreview.ignoredSheets.map((s) => `${s.sheetName} (${s.reason})`).join('; ')}
                </div>
              )}

              {excelPreview.detectedWeeks && excelPreview.detectedWeeks.length > 0 && (
                <div className="rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] px-3.5 py-2 text-xs text-[#364B0F]">
                  Kolom absensi terdeteksi:{' '}
                  <span className="font-mono font-semibold">
                    {excelPreview.detectedWeeks.map((w) => `M${w}`).join(', ')}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-[#20251D]">Pemetaan Sheet ke Kelas Tujuan</h4>
                {excelPreview.sheets.map((sh) => (
                  <div
                    key={sh.sheetName}
                    className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <p className="font-bold text-[#20251D]">{sh.sheetName}</p>
                      <p className="text-[#536F1A] tabular-nums">
                        Mahasiswa Baru: {sh.newStudentRows} · Tambah Minggu Baru: {sh.existingWithNewWeeksRows} · Sudah
                        Ada (Dilewati): {sh.skippedExistingRows} · AFK: {sh.afkRows} · Blok Hitam: {sh.skippedBlackRows}{' '}
                        · Duplikat/Error: {sh.duplicateRows + sh.invalidRows}
                      </p>
                    </div>
                    <select
                      value={sheetClassMap[sh.sheetName] ?? ''}
                      onChange={(e) =>
                        setSheetClassMap((prev) => ({ ...prev, [sh.sheetName]: e.target.value }))
                      }
                      className="rounded-full border border-[#D5E4B6] bg-white px-3 py-1.5 text-xs max-w-full"
                    >
                      <option value="">-- Pilih Kelas --</option>
                      {classes.length > 0 && (
                        <optgroup label="Kelas Tersedia">
                          {classes.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name} ({c.study_program_code})
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {prodis.length > 0 && (
                        <optgroup label="Buat Kelas Baru Otomatis dari Nama Sheet">
                          {prodis.map((p) => (
                            <option key={p.id} value={`__AUTO__:${p.id}`}>
                              + Buat Kelas "{sh.sheetName}" ({p.code})
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs font-semibold text-[#20251D] cursor-pointer">
                <input
                  type="checkbox"
                  checked={importHistorical}
                  onChange={(e) => setImportHistorical(e.target.checked)}
                  className="w-4 h-4 accent-[#536F1A]"
                />
                Import seluruh absensi mingguan yang belum ada sekaligus kalkulasi XP (minggu lama tidak ditimpa)
              </label>

              <div className="max-h-56 overflow-y-auto rounded-xl border border-[#D5E4B6]">
                <table className="w-full text-xs text-left">
                  <thead className="bg-[#F0F8DF] sticky top-0">
                    <tr>
                      <th className="px-3 py-2">Sheet</th>
                      <th className="px-3 py-2">NIM</th>
                      <th className="px-3 py-2">Nama</th>
                      <th className="px-3 py-2">Status Deteksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBF3DA]">
                    {excelPreview.rows.slice(0, 60).map((r, idx) => (
                      <tr
                        key={idx}
                        className={
                          r.skipBlack
                            ? 'bg-neutral-900 text-white'
                            : r.willSkipExisting
                              ? 'bg-neutral-50 text-neutral-500'
                              : ''
                        }
                      >
                        <td className="px-3 py-1.5">{r.sheetName}</td>
                        <td className="px-3 py-1.5 font-mono">{r.nim}</td>
                        <td className="px-3 py-1.5">{r.fullName}</td>
                        <td className="px-3 py-1.5">
                          {r.skipBlack
                            ? 'Blok Hitam (Dilewati)'
                            : r.validationError
                              ? r.validationError
                              : r.isDuplicateInFile
                                ? 'Duplikat di File'
                                : r.willSkipExisting
                                  ? 'Sudah Ada (Dilewati)'
                                  : r.existsInDb
                                    ? `Tambah ${r.newWeeksCount} Minggu Baru (${r.existingWeeksCount} lama dilewati)`
                                    : r.badge === 'AFK'
                                      ? 'Mahasiswa Baru · Merah (AFK)'
                                      : 'Mahasiswa Baru'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setExcelModalOpen(false)}
                  className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  disabled={importing}
                  onClick={() => void handleExcelCommit()}
                  className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-6 py-2 text-xs font-bold"
                >
                  Konfirmasi & Import (
                  {
                    excelPreview.rows.filter(
                      (r) => !r.skipBlack && !r.validationError && !r.isDuplicateInFile && !r.willSkipExisting
                    ).length
                  }{' '}
                  baris baru)
                </button>
              </div>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};
