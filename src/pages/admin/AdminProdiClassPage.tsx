import React, { useCallback, useEffect, useState } from 'react';
import { Edit2, FolderKanban, Plus, Trash2, Upload } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';

interface ProdiRow {
  id: string;
  code: string;
  name: string;
  faculty: string;
  degree_level: string;
  class_quota: number;
  class_count: number;
  student_count: number;
}

interface ClassRow {
  id: string;
  name: string;
  study_program_id: string;
  study_program_code: string;
  study_program_name: string;
  semester: number;
  academic_year: string;
  homeroom_lecturer: string;
  student_count: number;
}

export const AdminProdiClassPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [tab, setTab] = useState<'prodi' | 'classes'>('prodi');
  const [prodis, setProdis] = useState<ProdiRow[]>([]);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Prodi Modal
  const [prodiModal, setProdiModal] = useState<{ open: boolean; editing: ProdiRow | null }>({
    open: false,
    editing: null,
  });
  const [pCode, setPCode] = useState('');
  const [pName, setPName] = useState('');
  const [pFaculty, setPFaculty] = useState('');
  const [pDegree, setPDegree] = useState('S1');
  const [pQuota, setPQuota] = useState(10);

  // Class Modal
  const [classModal, setClassModal] = useState<{ open: boolean; editing: ClassRow | null }>({
    open: false,
    editing: null,
  });
  const [cName, setCName] = useState('');
  const [cProdiId, setCProdiId] = useState('');
  const [cSemester, setCSemester] = useState(1);
  const [cYear, setCYear] = useState('2026/2027');
  const [cLecturer, setCLecturer] = useState('');

  // CSV Import Modal
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('Nama Kelas,Kode Prodi,Semester,Tahun Akademik,Dosen Wali\nHES-1A,HES,1,2026/2027,Dr. Ahmad Fauzi');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, cRes] = await Promise.all([
        apiRequest<{ items: ProdiRow[] }>('/api/admin/study-programs'),
        apiRequest<{ items: ClassRow[] }>('/api/admin/classes'),
      ]);
      setProdis(pRes.items);
      setClasses(cRes.items);
      if (pRes.items.length > 0 && !cProdiId) {
        setCProdiId(pRes.items[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat program studi & kelas');
    } finally {
      setLoading(false);
    }
  }, [cProdiId]);

  useEffect(() => {
    void load();
  }, [load]);

  const openProdiForm = (row: ProdiRow | null) => {
    setProdiModal({ open: true, editing: row });
    setPCode(row?.code ?? '');
    setPName(row?.name ?? '');
    setPFaculty(row?.faculty ?? '');
    setPDegree(row?.degree_level ?? 'S1');
    setPQuota(row?.class_quota ?? 10);
  };

  const saveProdi = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { code: pCode, name: pName, faculty: pFaculty, degreeLevel: pDegree, classQuota: pQuota };
      if (prodiModal.editing) {
        await apiRequest(`/api/admin/study-programs/${prodiModal.editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        pushToast({ type: 'success', title: 'Program studi diperbarui' });
      } else {
        await apiRequest('/api/admin/study-programs', { method: 'POST', body: JSON.stringify(payload) });
        pushToast({ type: 'success', title: 'Program studi ditambahkan' });
      }
      setProdiModal({ open: false, editing: null });
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan prodi', description: err instanceof Error ? err.message : '' });
    }
  };

  const deleteProdi = async (id: string) => {
    try {
      await apiRequest(`/api/admin/study-programs/${id}`, { method: 'DELETE' });
      pushToast({ type: 'success', title: 'Program studi dihapus' });
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Tidak dapat menghapus', description: err instanceof Error ? err.message : '' });
    }
  };

  const openClassForm = (row: ClassRow | null) => {
    setClassModal({ open: true, editing: row });
    setCName(row?.name ?? '');
    setCProdiId(row?.study_program_id ?? prodis[0]?.id ?? '');
    setCSemester(row?.semester ?? 1);
    setCYear(row?.academic_year ?? '2026/2027');
    setCLecturer(row?.homeroom_lecturer ?? '');
  };

  const saveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: cName,
        studyProgramId: cProdiId,
        semester: cSemester,
        academicYear: cYear,
        homeroomLecturer: cLecturer,
      };
      if (classModal.editing) {
        await apiRequest(`/api/admin/classes/${classModal.editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        pushToast({ type: 'success', title: 'Kelas diperbarui' });
      } else {
        await apiRequest('/api/admin/classes', { method: 'POST', body: JSON.stringify(payload) });
        pushToast({ type: 'success', title: 'Kelas ditambahkan' });
      }
      setClassModal({ open: false, editing: null });
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan kelas', description: err instanceof Error ? err.message : '' });
    }
  };

  const deleteClass = async (id: string) => {
    try {
      await apiRequest(`/api/admin/classes/${id}`, { method: 'DELETE' });
      pushToast({ type: 'success', title: 'Kelas dihapus' });
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Tidak dapat menghapus', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiRequest<{ inserted: number; skipped: number; errors: string[] }>(
        '/api/admin/classes/import-csv',
        { method: 'POST', body: JSON.stringify({ csvText }) }
      );
      pushToast({
        type: 'success',
        title: `Import CSV Kelas Selesai`,
        description: `${res.inserted} kelas ditambahkan, ${res.skipped} dilewati.`,
      });
      setCsvModalOpen(false);
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal import CSV', description: err instanceof Error ? err.message : '' });
    }
  };

  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
          <button
            type="button"
            onClick={() => setTab('prodi')}
            className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors ${
              tab === 'prodi' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Program Studi ({prodis.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('classes')}
            className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors ${
              tab === 'classes' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Daftar Kelas ({classes.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {tab === 'classes' && (
            <button
              type="button"
              onClick={() => setCsvModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#DCECB8]/50 text-[#20251D] px-4 py-2 text-xs font-semibold transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              Import CSV Kelas
            </button>
          )}
          <button
            type="button"
            onClick={() => (tab === 'prodi' ? openProdiForm(null) : openClassForm(null))}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            {tab === 'prodi' ? 'Tambah Prodi' : 'Tambah Kelas'}
          </button>
        </div>
      </div>

      {tab === 'prodi' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {prodis.map((p) => (
            <div key={p.id} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between">
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-mono font-semibold text-[#536F1A]">
                      {p.code} · {p.degree_level}
                    </p>
                    <h3 className="text-base font-bold text-[#20251D] mt-1">{p.name}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => openProdiForm(p)}
                      className="p-2 rounded-full hover:bg-[#F0F8DF] text-[#536F1A]"
                      aria-label="Edit Prodi"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteProdi(p.id)}
                      className="p-2 rounded-full hover:bg-red-50 text-red-600"
                      aria-label="Hapus Prodi"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <p className="text-xs text-[#536F1A] mt-2">{p.faculty}</p>
              </div>
              <div className="mt-5 pt-3 border-t border-[#EBF3DA] flex items-center justify-between text-xs">
                <span className="tabular-nums text-[#20251D]">
                  Kelas: <strong>{p.class_count}</strong> / {p.class_quota}
                </span>
                <span className="tabular-nums text-[#536F1A]">
                  <strong>{p.student_count}</strong> Mahasiswa
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="w-5 h-5" />}
          title="Belum Ada Kelas"
          description="Buat kelas baru atau import massal melalui CSV untuk mulai menempatkan mahasiswa."
          action={
            <button
              type="button"
              onClick={() => openClassForm(null)}
              className="rounded-full bg-[#B5D45D] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              + Tambah Kelas Pertama
            </button>
          }
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">Nama Kelas</th>
                <th className="px-4 py-3">Program Studi</th>
                <th className="px-4 py-3">Semester / TA</th>
                <th className="px-4 py-3">Dosen / Wali Kelas</th>
                <th className="px-4 py-3 text-right">Mahasiswa</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {classes.map((c) => (
                <tr key={c.id} className="hover:bg-[#F0F8DF]/40">
                  <td className="px-4 py-3 font-semibold text-[#20251D]">{c.name}</td>
                  <td className="px-4 py-3 text-[#536F1A]">
                    {c.study_program_code} · {c.study_program_name}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    Smst {c.semester} · {c.academic_year}
                  </td>
                  <td className="px-4 py-3 text-[#20251D]/80">{c.homeroom_lecturer || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">{c.student_count}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openClassForm(c)}
                        className="p-2 rounded-full hover:bg-[#F0F8DF] text-[#536F1A]"
                        aria-label="Edit Kelas"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteClass(c.id)}
                        className="p-2 rounded-full hover:bg-red-50 text-red-600"
                        aria-label="Hapus Kelas"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Prodi */}
      <Modal
        open={prodiModal.open}
        onClose={() => setProdiModal({ open: false, editing: null })}
        title={prodiModal.editing ? 'Edit Program Studi' : 'Tambah Program Studi'}
      >
        <form onSubmit={saveProdi} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Kode Prodi</label>
              <input
                required
                value={pCode}
                onChange={(e) => setPCode(e.target.value)}
                placeholder="HES / PJKR / FARMASI"
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Jenjang</label>
              <select
                value={pDegree}
                onChange={(e) => setPDegree(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="D3">D3</option>
                <option value="S1">S1</option>
                <option value="S2">S2</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Nama Program Studi</label>
            <input
              required
              value={pName}
              onChange={(e) => setPName(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Fakultas</label>
            <input
              required
              value={pFaculty}
              onChange={(e) => setPFaculty(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Kuota Kelas</label>
            <input
              type="number"
              min={1}
              required
              value={pQuota}
              onChange={(e) => setPQuota(Number(e.target.value))}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setProdiModal({ open: false, editing: null })}
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

      {/* Modal Kelas */}
      <Modal
        open={classModal.open}
        onClose={() => setClassModal({ open: false, editing: null })}
        title={classModal.editing ? 'Edit Kelas' : 'Tambah Kelas Baru'}
      >
        <form onSubmit={saveClass} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Program Studi</label>
            <select
              required
              value={cProdiId}
              onChange={(e) => setCProdiId(e.target.value)}
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
            <label className="block text-xs font-semibold mb-1">Nama Kelas</label>
            <input
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="Contoh: HES-1A"
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Semester</label>
              <input
                type="number"
                min={1}
                max={14}
                required
                value={cSemester}
                onChange={(e) => setCSemester(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Tahun Akademik</label>
              <input
                required
                value={cYear}
                onChange={(e) => setCYear(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Dosen / Wali Kelas</label>
            <input
              value={cLecturer}
              onChange={(e) => setCLecturer(e.target.value)}
              placeholder="Nama dosen wali"
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setClassModal({ open: false, editing: null })}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              Simpan Kelas
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal Import CSV Kelas */}
      <Modal
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        title="Import CSV Kelas"
        subtitle="Format kolom: Nama Kelas, Kode Prodi, Semester, Tahun Akademik, Dosen Wali"
      >
        <form onSubmit={handleCsvImport} className="space-y-4">
          <textarea
            rows={6}
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            className="w-full rounded-2xl border border-[#D5E4B6] p-3 text-xs font-mono"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCsvModalOpen(false)}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#171A17] text-[#B5D45D] px-5 py-2 text-xs font-bold"
            >
              Import Sekarang
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
