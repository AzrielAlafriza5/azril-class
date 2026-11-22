import React, { useCallback, useEffect, useState } from 'react';
import { Award, CheckCircle2, Trophy, Zap } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { RankingSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatWibDateTime } from '../../../shared/time';

interface RankItem {
  id: string;
  nim: string;
  full_name: string;
  total_xp: number;
  current_streak: number;
  study_program_code: string;
  class_name: string;
}

interface XpTx {
  id: string;
  student_name: string;
  nim: string;
  class_name: string;
  amount: number;
  source_type: string;
  description: string;
  granted_by_admin_name: string | null;
  created_at_utc: string;
}

export const AdminXpRankingPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [tab, setTab] = useState<'ranking' | 'activity'>('ranking');
  const [scope, setScope] = useState<'global' | 'prodi' | 'class'>('global');
  const [prodis, setProdis] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [classes, setClasses] = useState<Array<{ id: string; name: string; study_program_code: string }>>([]);
  const [selectedProdiId, setSelectedProdiId] = useState('');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [ranking, setRanking] = useState<RankItem[]>([]);
  const [transactions, setTransactions] = useState<XpTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // XP Keaktifan Step Flow
  const [actClassId, setActClassId] = useState('');
  const [actStudents, setActStudents] = useState<Array<{ id: string; nim: string; full_name: string }>>([]);
  const [actStudentId, setActStudentId] = useState('');
  const [actCategory, setActCategory] = useState<'BIASA' | 'KRITIS'>('BIASA');
  const [actNotes, setActNotes] = useState('');
  const [confirmStep, setConfirmStep] = useState(false);

  const loadMeta = useCallback(async () => {
    const [pRes, cRes] = await Promise.all([
      apiRequest<{ items: Array<{ id: string; code: string; name: string }> }>('/api/admin/study-programs'),
      apiRequest<{ items: Array<{ id: string; name: string; study_program_code: string }> }>('/api/admin/classes'),
    ]);
    setProdis(pRes.items);
    setClasses(cRes.items);
    if (pRes.items[0] && !selectedProdiId) setSelectedProdiId(pRes.items[0].id);
    if (cRes.items[0]) {
      if (!selectedClassId) setSelectedClassId(cRes.items[0].id);
      if (!actClassId) setActClassId(cRes.items[0].id);
    }
  }, [actClassId, selectedClassId, selectedProdiId]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        scope,
        prodiId: selectedProdiId,
        classId: selectedClassId,
      });
      const [rRes, tRes] = await Promise.all([
        apiRequest<{ items: RankItem[] }>(`/api/admin/ranking?${qs.toString()}`),
        apiRequest<{ items: XpTx[] }>('/api/admin/xp/transactions'),
      ]);
      setRanking(rRes.items);
      setTransactions(tRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat ranking & XP');
    } finally {
      setLoading(false);
    }
  }, [scope, selectedProdiId, selectedClassId]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!actClassId) {
      setActStudents([]);
      return;
    }
    void apiRequest<{ items: Array<{ id: string; nim: string; full_name: string }> }>(
      `/api/admin/students?classId=${actClassId}&limit=100`
    ).then((res) => {
      setActStudents(res.items);
      setActStudentId(res.items[0]?.id ?? '');
    });
  }, [actClassId]);

  const handleGrantActivity = async () => {
    if (!actStudentId) return;
    try {
      const res = await apiRequest<{ amount: number }>('/api/admin/xp/activity', {
        method: 'POST',
        body: JSON.stringify({ studentId: actStudentId, category: actCategory, notes: actNotes }),
      });
      pushToast({
        type: 'success',
        title: `+${res.amount} XP Keaktifan Diberikan`,
        description: 'Transaksi XP tersimpan dengan identitas Admin & waktu WIB.',
      });
      setConfirmStep(false);
      setActNotes('');
      await loadData();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal memberi XP', description: err instanceof Error ? err.message : '' });
    }
  };

  const top3 = ranking.slice(0, 3);
  const selectedStudentObj = actStudents.find((s) => s.id === actStudentId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
          <button
            type="button"
            onClick={() => setTab('ranking')}
            className={`px-5 py-2 rounded-full text-xs font-semibold ${
              tab === 'ranking' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Papan Peringkat
          </button>
          <button
            type="button"
            onClick={() => setTab('activity')}
            className={`px-5 py-2 rounded-full text-xs font-semibold ${
              tab === 'activity' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Beri XP Keaktifan
          </button>
        </div>
      </div>

      {tab === 'ranking' ? (
        <div className="space-y-5">
          {/* Scope Filter */}
          <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex p-1 rounded-full bg-[#F0F8DF]">
              {(['global', 'prodi', 'class'] as const).map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => setScope(sc)}
                  className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                    scope === sc ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
                  }`}
                >
                  {sc === 'global' ? 'Global' : sc === 'prodi' ? 'Program Studi' : 'Kelas'}
                </button>
              ))}
            </div>
            {scope === 'prodi' && (
              <select
                value={selectedProdiId}
                onChange={(e) => setSelectedProdiId(e.target.value)}
                className="rounded-full border border-[#D5E4B6] px-4 py-2 text-xs bg-white"
              >
                {prodis.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </select>
            )}
            {scope === 'class' && (
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="rounded-full border border-[#D5E4B6] px-4 py-2 text-xs bg-white"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.study_program_code})
                  </option>
                ))}
              </select>
            )}
            <span className="text-xs text-[#536F1A] ml-auto">Mahasiswa berstatus AFK otomatis dikecualikan</span>
          </div>

          {loading ? (
            <RankingSkeleton />
          ) : error ? (
            <ErrorState message={error} onRetry={loadData} />
          ) : ranking.length === 0 ? (
            <EmptyState
              icon={<Trophy className="w-5 h-5" />}
              title="Belum Ada Data Peringkat"
              description="Peringkat akan terisi otomatis ketika mahasiswa aktif memperoleh XP dari login, absensi, tugas, atau keaktifan."
            />
          ) : (
            <>
              {/* Podium Top 3 */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
                {[1, 0, 2].map((posIdx) => {
                  const st = top3[posIdx];
                  if (!st) return <div key={posIdx} className="hidden sm:block" />;
                  const isFirst = posIdx === 0;
                  return (
                    <div
                      key={st.id}
                      className={`rounded-2xl p-5 flex flex-col justify-between ${
                        isFirst
                          ? 'bg-[#171A17] text-white sm:min-h-[190px]'
                          : 'bg-white border border-[#D5E4B6] sm:min-h-[156px]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-bold ${
                            isFirst ? 'bg-[#B5D45D] text-[#171A17]' : 'bg-[#F0F8DF] text-[#364B0F]'
                          }`}
                        >
                          Peringkat #{posIdx + 1}
                        </span>
                        <Award className={`w-5 h-5 ${isFirst ? 'text-[#B5D45D]' : 'text-[#536F1A]'}`} />
                      </div>
                      <div className="my-3">
                        <p className="font-bold text-base truncate">{st.full_name}</p>
                        <p className={`text-xs ${isFirst ? 'text-[#DCECB8]/75' : 'text-[#536F1A]'}`}>
                          {st.nim} · {st.study_program_code} · {st.class_name}
                        </p>
                      </div>
                      <p className="text-2xl font-bold font-mono tabular-nums">
                        {st.total_xp} <span className="text-xs font-normal">XP</span>
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Klasemen Table */}
              <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      <th className="px-4 py-3">Mahasiswa</th>
                      <th className="px-4 py-3">Prodi · Kelas</th>
                      <th className="px-4 py-3 text-right">Streak</th>
                      <th className="px-4 py-3 text-right">Total XP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#EBF3DA]">
                    {ranking.map((st, idx) => (
                      <tr key={st.id} className="hover:bg-[#F0F8DF]/40">
                        <td className="px-4 py-3 font-mono tabular-nums font-bold">#{idx + 1}</td>
                        <td className="px-4 py-3">
                          <p className="font-semibold text-[#20251D]">{st.full_name}</p>
                          <p className="text-xs font-mono text-[#536F1A]">{st.nim}</p>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {st.study_program_code} · {st.class_name}
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-xs">
                          {st.current_streak} hari
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums font-bold">{st.total_xp}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Alur 6 Langkah XP Keaktifan */}
          <div className="lg:col-span-5 rounded-2xl bg-white border border-[#D5E4B6] p-6 space-y-4">
            <h3 className="text-base font-bold text-[#20251D] flex items-center gap-2">
              <Zap className="w-4 h-4 text-[#536F1A]" />
              Input XP Keaktifan Mahasiswa
            </h3>

            <div>
              <label className="block text-xs font-semibold mb-1">1. Pilih Kelas</label>
              <select
                value={actClassId}
                onChange={(e) => {
                  setActClassId(e.target.value);
                  setConfirmStep(false);
                }}
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
              <label className="block text-xs font-semibold mb-1">2. Pilih Mahasiswa</label>
              <select
                value={actStudentId}
                onChange={(e) => {
                  setActStudentId(e.target.value);
                  setConfirmStep(false);
                }}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                {actStudents.length === 0 ? (
                  <option value="">-- Tidak ada mahasiswa di kelas ini --</option>
                ) : (
                  actStudents.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.nim})
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">3. Kategori Keaktifan</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActCategory('BIASA')}
                  className={`p-3 rounded-2xl border text-left text-xs transition-colors ${
                    actCategory === 'BIASA'
                      ? 'bg-[#171A17] text-white border-[#171A17]'
                      : 'bg-[#F0F8DF] border-[#D5E4B6] text-[#20251D]'
                  }`}
                >
                  <p className="font-bold">Keaktifan Biasa</p>
                  <p className="font-mono text-[#B5D45D] font-bold mt-0.5">+10 XP</p>
                </button>
                <button
                  type="button"
                  onClick={() => setActCategory('KRITIS')}
                  className={`p-3 rounded-2xl border text-left text-xs transition-colors ${
                    actCategory === 'KRITIS'
                      ? 'bg-[#171A17] text-white border-[#171A17]'
                      : 'bg-[#F0F8DF] border-[#D5E4B6] text-[#20251D]'
                  }`}
                >
                  <p className="font-bold">Pertanyaan Kritis</p>
                  <p className="font-mono text-[#B5D45D] font-bold mt-0.5">+20 XP</p>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1">4. Catatan Opsional</label>
              <input
                value={actNotes}
                onChange={(e) => setActNotes(e.target.value)}
                placeholder="Contoh: Menjawab studi kasus kontrak syariah"
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>

            {!confirmStep ? (
              <button
                type="button"
                disabled={!actStudentId}
                onClick={() => setConfirmStep(true)}
                className="w-full rounded-full bg-[#B5D45D] hover:bg-[#C5E370] disabled:opacity-50 text-[#171A17] font-bold py-3 text-xs"
              >
                5. Lanjut ke Konfirmasi
              </button>
            ) : (
              <div className="rounded-2xl bg-[#171A17] text-[#F0F8DF] p-4 space-y-3">
                <p className="text-xs">
                  Konfirmasi pemberian{' '}
                  <strong className="text-[#B5D45D]">{actCategory === 'KRITIS' ? '+20 XP' : '+10 XP'}</strong> kepada{' '}
                  <strong>{selectedStudentObj?.full_name}</strong>?
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmStep(false)}
                    className="flex-1 rounded-full bg-[#232822] py-2 text-xs font-semibold"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleGrantActivity()}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-[#B5D45D] text-[#171A17] py-2 text-xs font-bold"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Simpan XP
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Riwayat Transaksi XP */}
          <div className="lg:col-span-7 rounded-2xl bg-white border border-[#D5E4B6] p-5">
            <h3 className="text-sm font-bold text-[#20251D] mb-4">Riwayat Transaksi XP Terbaru (WIB)</h3>
            {transactions.length === 0 ? (
              <p className="text-xs text-[#536F1A] py-8 text-center">Belum ada transaksi XP.</p>
            ) : (
              <div className="divide-y divide-[#EBF3DA] max-h-[500px] overflow-y-auto">
                {transactions.map((tx) => (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#20251D] truncate">
                        {tx.student_name} <span className="font-mono text-xs text-[#536F1A]">({tx.class_name})</span>
                      </p>
                      <p className="text-xs text-[#536F1A] truncate">{tx.description}</p>
                      <p className="text-[11px] font-mono text-[#20251D]/60">
                        {formatWibDateTime(tx.created_at_utc)}
                        {tx.granted_by_admin_name ? ` · Admin: ${tx.granted_by_admin_name}` : ''}
                      </p>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-sm text-[#364B0F] shrink-0">
                      +{tx.amount} XP
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
