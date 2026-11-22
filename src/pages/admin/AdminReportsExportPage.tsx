import React, { useCallback, useEffect, useState } from 'react';
import { BarChart3, Download, FileSpreadsheet } from 'lucide-react';
import { apiDownloadFile, apiRequest } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { ErrorState } from '../../components/ui/EmptyAndErrorState';

const REPORT_TYPES = [
  { id: 'rekap_mahasiswa', label: '1. Rekap Mahasiswa' },
  { id: 'tugas', label: '2. Tugas' },
  { id: 'pengumpulan', label: '3. Pengumpulan' },
  { id: 'keterlambatan', label: '4. Keterlambatan' },
  { id: 'penilaian', label: '5. Penilaian' },
  { id: 'absensi', label: '6. Absensi' },
  { id: 'kehadiran_kelas', label: '7. Kehadiran per Kelas' },
  { id: 'kehadiran_mahasiswa', label: '8. Kehadiran per Mahasiswa' },
];

const EXPORT_MODULES = [
  { id: 'absensi', title: '1. Ekspor Absensi', desc: 'Rekap kehadiran sesi dan XP absensi mahasiswa.' },
  { id: 'pengumpulan', title: '2. Ekspor Pengumpulan Tugas', desc: 'Status pengumpulan, keterlambatan, dan nilai.' },
  { id: 'xp_ranking', title: '3. Ekspor XP dan Ranking', desc: 'Klasemen XP aktif beserta streak harian.' },
  { id: 'mahasiswa', title: '4. Ekspor Data Mahasiswa', desc: 'Direktori NIM, prodi, kelas, badge, dan status akun.' },
  {
    id: 'laporan_lengkap',
    title: '5. Ekspor Laporan Lengkap (6 Sheet XLSX)',
    desc: 'Workbook XLSX berisi Ringkasan, Mahasiswa, Absensi, Pengumpulan Tugas, XP & Ranking, dan Riwayat XP.',
  },
];

export const AdminReportsExportPage: React.FC = () => {
  const [reportType, setReportType] = useState('rekap_mahasiswa');
  const [prodis, setProdis] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; study_program_code: string }>>([]);
  const [prodiId, setProdiId] = useState('');
  const [classId, setClassId] = useState('');
  const [datePreset, setDatePreset] = useState<'semester' | '7d' | '30d'>('semester');
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      apiRequest<{ items: Array<{ id: string; code: string; name: string }> }>('/api/admin/study-programs'),
      apiRequest<{ items: Array<{ id: string; name: string; study_program_code: string }> }>('/api/admin/classes'),
    ]).then(([p, c]) => {
      setProdis(p.items);
      setClasses(c.items);
    });
  }, []);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ type: reportType, prodiId, classId });
      const res = await apiRequest<{ rows: Array<Record<string, unknown>> }>(`/api/admin/reports?${qs.toString()}`);
      setRows(res.rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat laporan');
    } finally {
      setLoading(false);
    }
  }, [reportType, prodiId, classId]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const handleExport = (moduleId: string, format: 'xlsx' | 'csv') => {
    const qs = new URLSearchParams({
      module: moduleId,
      format,
      prodiId,
      classId,
      preset: datePreset,
    });
    const ext = moduleId === 'laporan_lengkap' ? 'xlsx' : format;
    void apiDownloadFile(`/api/admin/export?${qs.toString()}`, `AZRIL_CLAS_${moduleId}.${ext}`);
  };

  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <div className="space-y-6">
      {/* Global Filter Bar */}
      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center gap-3">
        <select
          value={prodiId}
          onChange={(e) => setProdiId(e.target.value)}
          className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
        >
          <option value="">Semua Program Studi</option>
          {prodis.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} — {p.name}
            </option>
          ))}
        </select>

        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
        >
          <option value="">Semua Kelas</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.study_program_code})
            </option>
          ))}
        </select>

        <div className="inline-flex p-1 rounded-full bg-[#F0F8DF] ml-auto">
          {([
            { id: '7d', label: '7 Hari' },
            { id: '30d', label: '30 Hari' },
            { id: 'semester', label: 'Semester Aktif' },
          ] as const).map((pr) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => setDatePreset(pr.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                datePreset === pr.id ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
              }`}
            >
              {pr.label}
            </button>
          ))}
        </div>
      </div>

      {/* 5 Modul Pusat Ekspor Data */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-[#536F1A]" />
          Pusat Ekspor Data (5 Modul)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {EXPORT_MODULES.map((mod) => (
            <div
              key={mod.id}
              className={`rounded-2xl p-5 flex flex-col justify-between gap-4 ${
                mod.id === 'laporan_lengkap'
                  ? 'bg-[#171A17] text-[#F0F8DF] md:col-span-2 lg:col-span-2'
                  : 'bg-white border border-[#D5E4B6]'
              }`}
            >
              <div>
                <h4 className={`text-sm font-bold ${mod.id === 'laporan_lengkap' ? 'text-[#B5D45D]' : 'text-[#20251D]'}`}>
                  {mod.title}
                </h4>
                <p className={`text-xs mt-1 ${mod.id === 'laporan_lengkap' ? 'text-[#DCECB8]/80' : 'text-[#536F1A]'}`}>
                  {mod.desc}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleExport(mod.id, 'xlsx')}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
                >
                  <Download className="w-3.5 h-3.5" />
                  Unduh XLSX
                </button>
                {mod.id !== 'laporan_lengkap' && (
                  <button
                    type="button"
                    onClick={() => handleExport(mod.id, 'csv')}
                    className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] bg-white hover:bg-[#F0F8DF] text-[#20251D] px-4 py-2 text-xs font-semibold"
                  >
                    Unduh CSV
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 8 Jenis Laporan */}
      <section className="space-y-3">
        <h3 className="text-sm font-bold text-[#20251D] flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-[#536F1A]" />
          8 Jenis Laporan Akademik
        </h3>
        <div className="flex flex-wrap gap-2">
          {REPORT_TYPES.map((rt) => (
            <button
              key={rt.id}
              type="button"
              onClick={() => setReportType(rt.id)}
              className={`rounded-full px-4 py-2 text-xs font-semibold border transition-colors ${
                reportType === rt.id
                  ? 'bg-[#171A17] text-[#B5D45D] border-[#171A17]'
                  : 'bg-white text-[#20251D] border-[#D5E4B6] hover:bg-[#F0F8DF]'
              }`}
            >
              {rt.label}
            </button>
          ))}
        </div>

        {loading ? (
          <TableSkeleton rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={loadReport} />
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-white border border-[#D5E4B6] p-8 text-center text-xs text-[#536F1A]">
            Belum ada data untuk kategori laporan ini.
          </div>
        ) : (
          <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] font-semibold text-[#364B0F]">
                <tr>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-3 whitespace-nowrap">
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EBF3DA]">
                {rows.map((r, i) => (
                  <tr key={i} className="hover:bg-[#F0F8DF]/40">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                        {r[col] === null || r[col] === undefined ? '-' : String(r[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
