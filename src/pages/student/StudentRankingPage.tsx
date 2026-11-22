import React, { useCallback, useEffect, useState } from 'react';
import { Award, Trophy } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { RankingSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';

interface StudentRankItem {
  id: string;
  nim: string;
  full_name: string;
  total_xp: number;
  current_streak: number;
  badge: string;
  study_program_code: string;
  class_name: string;
}

export const StudentRankingPage: React.FC = () => {
  const { user } = useAuth();
  const [scope, setScope] = useState<'class' | 'prodi' | 'global'>('class');
  const [items, setItems] = useState<StudentRankItem[]>([]);
  const [myPosition, setMyPosition] = useState<number | null>(null);
  const [allowGlobal, setAllowGlobal] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        items: StudentRankItem[];
        myPosition: number | null;
        allowGlobal: boolean;
      }>(`/api/student/ranking?scope=${scope}`);
      setItems(res.items);
      setMyPosition(res.myPosition);
      setAllowGlobal(res.allowGlobal);
    } catch (err) {
      if (scope === 'global') {
        setScope('class');
        return;
      }
      setError(err instanceof Error ? err.message : 'Gagal memuat papan peringkat');
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const top3 = items.slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Scope Switcher & Posisi Pribadi */}
      <section className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-[#F0F8DF]">
          <button
            type="button"
            onClick={() => setScope('class')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              scope === 'class' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Kelas ({user?.className})
          </button>
          <button
            type="button"
            onClick={() => setScope('prodi')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              scope === 'prodi' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Prodi ({user?.studyProgramCode})
          </button>
          {allowGlobal && (
            <button
              type="button"
              onClick={() => setScope('global')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                scope === 'global' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
              }`}
            >
              Global
            </button>
          )}
        </div>

        <div className="text-xs text-[#364B0F] font-semibold">
          {user?.badge === 'AFK'
            ? 'Status akun AFK tidak diikutsertakan dalam peringkat'
            : myPosition
              ? `Posisi Anda: #${myPosition} dari ${items.length} mahasiswa`
              : 'Mahasiswa berstatus AFK otomatis dikecualikan'}
        </div>
      </section>

      {loading ? (
        <RankingSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Trophy className="w-5 h-5" />}
          title="Belum Ada Peringkat Tersedia"
          description="Peringkat akan tampil setelah mahasiswa aktif di cakupan ini mulai memperoleh poin XP."
        />
      ) : (
        <>
          {/* Podium Top 3 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            {[1, 0, 2].map((posIdx) => {
              const st = top3[posIdx];
              if (!st) return <div key={posIdx} className="hidden sm:block" />;
              const isFirst = posIdx === 0;
              const isMe = st.id === user?.studentId;
              return (
                <div
                  key={st.id}
                  className={`rounded-2xl p-5 flex flex-col justify-between ${
                    isFirst
                      ? 'bg-[#171A17] text-white sm:min-h-[190px]'
                      : 'bg-white border border-[#D5E4B6] sm:min-h-[156px]'
                  } ${isMe ? 'ring-2 ring-[#B5D45D]' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        isFirst ? 'bg-[#B5D45D] text-[#171A17]' : 'bg-[#F0F8DF] text-[#364B0F]'
                      }`}
                    >
                      Peringkat #{posIdx + 1} {isMe ? '(Anda)' : ''}
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

          {/* Tabel Klasemen */}
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
                {items.map((st, idx) => {
                  const isMe = st.id === user?.studentId;
                  return (
                    <tr key={st.id} className={isMe ? 'bg-[#DCECB8]/55 font-semibold' : 'hover:bg-[#F0F8DF]/40'}>
                      <td className="px-4 py-3 font-mono tabular-nums font-bold">#{idx + 1}</td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[#20251D]">
                          {st.full_name} {isMe && <span className="text-xs text-[#364B0F]">(Anda)</span>}
                        </p>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
