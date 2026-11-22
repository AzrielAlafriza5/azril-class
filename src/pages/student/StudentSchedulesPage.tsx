import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, ExternalLink, MapPin } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { DAY_NAMES_ID } from '../../../shared/time';

interface StudentScheduleItem {
  id: string;
  course_name: string;
  course_code: string;
  lecturer_name: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  mode: 'Daring' | 'Luring';
  meeting_link: string;
  room_name: string;
}

export const StudentSchedulesPage: React.FC<{ onNavigate: (pageId: string) => void }> = ({ onNavigate }) => {
  const [items, setItems] = useState<StudentScheduleItem[]>([]);
  const [openSessionsCount, setOpenSessionsCount] = useState(0);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: StudentScheduleItem[]; openSessions: unknown[] }>(
        '/api/student/schedules'
      );
      setItems(res.items);
      setOpenSessionsCount(res.openSessions.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal kelas');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              viewMode === 'list' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Daftar Mingguan
          </button>
          <button
            type="button"
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              viewMode === 'calendar' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Kalender
          </button>
        </div>

        <button
          type="button"
          onClick={() => onNavigate('attendance')}
          className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
        >
          Akses Absensi ({openSessionsCount} Sesi Terbuka)
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-5 h-5" />}
          title="Belum Ada Jadwal Kelas"
          description="Admin belum menambahkan jadwal perkuliahan untuk kelas Anda."
        />
      ) : viewMode === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {items.map((sc) => (
            <div key={sc.id} className="rounded-2xl bg-white border border-[#D5E4B6] p-5 flex flex-col justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-[#536F1A]">
                  {DAY_NAMES_ID[sc.day_of_week]} ·{' '}
                  <span className="font-mono tabular-nums">
                    {sc.start_time}–{sc.end_time} WIB
                  </span>{' '}
                  · {sc.mode}
                </p>
                <h3 className="text-base font-bold text-[#20251D] mt-1">{sc.course_name}</h3>
                <p className="text-xs text-[#536F1A] mt-0.5">
                  {sc.course_code ? `${sc.course_code} · ` : ''}
                  {sc.lecturer_name || 'Dosen pengampu'}
                </p>
              </div>
              <div className="pt-3 border-t border-[#EBF3DA] flex items-center justify-between text-xs">
                {sc.mode === 'Daring' && sc.meeting_link ? (
                  <a
                    href={sc.meeting_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full bg-[#171A17] text-[#B5D45D] px-4 py-1.5 font-semibold"
                  >
                    Buka Link Pertemuan <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-[#20251D] font-medium">
                    <MapPin className="w-3.5 h-3.5 text-[#536F1A]" />
                    {sc.room_name || 'Ruang Perkuliahan'}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onNavigate('attendance')}
                  className="font-semibold text-[#536F1A] hover:underline"
                >
                  Cek Absensi
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((dow) => {
            const list = items.filter((i) => i.day_of_week === dow);
            return (
              <div key={dow} className="rounded-2xl bg-white border border-[#D5E4B6] p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-[#20251D] pb-2 border-b border-[#EBF3DA]">
                  {DAY_NAMES_ID[dow]}
                </h3>
                {list.length === 0 ? (
                  <p className="text-xs text-[#536F1A]">Tidak ada kuliah</p>
                ) : (
                  list.map((sc) => (
                    <div key={sc.id} className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] text-xs">
                      <p className="font-mono tabular-nums font-semibold text-[#536F1A]">
                        {sc.start_time}–{sc.end_time} WIB
                      </p>
                      <p className="font-bold text-[#20251D] mt-0.5">{sc.course_name}</p>
                      <p className="text-[#536F1A]">
                        {sc.mode} · {sc.mode === 'Daring' ? 'Online' : sc.room_name || 'Ruang'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
