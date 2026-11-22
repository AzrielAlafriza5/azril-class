import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, Edit2, ExternalLink, MapPin, Plus, Trash2 } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { Modal } from '../../components/ui/Modal';
import { DAY_NAMES_ID } from '../../../shared/time';
import type { ClassMode } from '../../../shared/types';

interface ScheduleRow {
  id: string;
  course_name: string;
  course_code: string;
  lecturer_name: string;
  class_id: string;
  class_name: string;
  study_program_code: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  mode: ClassMode;
  meeting_link: string;
  room_name: string;
  semester: number;
  is_active: number;
}

interface ClassOpt {
  id: string;
  name: string;
  study_program_code: string;
}

export const AdminSchedulesPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [items, setItems] = useState<ScheduleRow[]>([]);
  const [classes, setClasses] = useState<ClassOpt[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filterClass, setFilterClass] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleRow | null>(null);
  const [courseName, setCourseName] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [classId, setClassId] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('09:40');
  const [mode, setMode] = useState<ClassMode>('Luring');
  const [meetingLink, setMeetingLink] = useState('');
  const [roomName, setRoomName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scRes, cRes] = await Promise.all([
        apiRequest<{ items: ScheduleRow[] }>(`/api/admin/schedules${filterClass ? `?classId=${filterClass}` : ''}`),
        apiRequest<{ items: ClassOpt[] }>('/api/admin/classes'),
      ]);
      setItems(scRes.items);
      setClasses(cRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat jadwal');
    } finally {
      setLoading(false);
    }
  }, [filterClass]);

  useEffect(() => {
    void load();
  }, [load]);

  const openModal = (row: ScheduleRow | null) => {
    setEditing(row);
    setCourseName(row?.course_name ?? '');
    setCourseCode(row?.course_code ?? '');
    setLecturerName(row?.lecturer_name ?? '');
    setClassId(row?.class_id ?? classes[0]?.id ?? '');
    setDayOfWeek(row?.day_of_week ?? 1);
    setStartTime(row?.start_time ?? '08:00');
    setEndTime(row?.end_time ?? '09:40');
    setMode(row?.mode ?? 'Luring');
    setMeetingLink(row?.meeting_link ?? '');
    setRoomName(row?.room_name ?? '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        courseName,
        courseCode,
        lecturerName,
        classId,
        dayOfWeek,
        startTime,
        endTime,
        mode,
        meetingLink,
        roomName,
        semester: 1,
      };
      if (editing) {
        await apiRequest(`/api/admin/schedules/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        pushToast({ type: 'success', title: 'Jadwal diperbarui' });
      } else {
        await apiRequest('/api/admin/schedules', { method: 'POST', body: JSON.stringify(payload) });
        pushToast({ type: 'success', title: 'Jadwal ditambahkan' });
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan jadwal', description: err instanceof Error ? err.message : '' });
    }
  };

  const handleDelete = async (id: string) => {
    await apiRequest(`/api/admin/schedules/${id}`, { method: 'DELETE' });
    pushToast({ type: 'success', title: 'Jadwal dihapus' });
    await load();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                viewMode === 'list' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
              }`}
            >
              Daftar Jadwal
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                viewMode === 'calendar' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
              }`}
            >
              Kalender Mingguan
            </button>
          </div>
          <select
            value={filterClass}
            onChange={(e) => setFilterClass(e.target.value)}
            className="rounded-full border border-[#D5E4B6] bg-white px-4 py-2 text-xs"
          >
            <option value="">Semua Kelas</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.study_program_code})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => openModal(null)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-4 py-2 text-xs font-bold"
        >
          <Plus className="w-3.5 h-3.5" />
          Tambah Jadwal
        </button>
      </div>

      {loading ? (
        <TableSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Calendar className="w-5 h-5" />}
          title="Jadwal Perkuliahan Kosong"
          description="Buat jadwal mata kuliah untuk kelas tertentu agar tampil pada kalender Admin dan Mahasiswa."
        />
      ) : viewMode === 'list' ? (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] text-xs font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">Hari & Jam WIB</th>
                <th className="px-4 py-3">Mata Kuliah</th>
                <th className="px-4 py-3">Kelas</th>
                <th className="px-4 py-3">Mode & Lokasi</th>
                <th className="px-4 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {items.map((sc) => (
                <tr key={sc.id} className="hover:bg-[#F0F8DF]/40">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#20251D]">{DAY_NAMES_ID[sc.day_of_week]}</p>
                    <p className="text-xs font-mono tabular-nums text-[#536F1A]">
                      {sc.start_time} – {sc.end_time} WIB
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-semibold text-[#20251D]">{sc.course_name}</p>
                    <p className="text-xs text-[#536F1A]">
                      {sc.course_code ? `${sc.course_code} · ` : ''}
                      {sc.lecturer_name || 'Dosen pengampu'}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-xs font-medium">
                    {sc.study_program_code} · {sc.class_name}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <span className="font-semibold text-[#20251D]">{sc.mode}</span>
                    <span className="mx-1.5 text-[#D5E4B6]">·</span>
                    {sc.mode === 'Daring' && sc.meeting_link ? (
                      <a
                        href={sc.meeting_link}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#536F1A] hover:underline"
                      >
                        Meet/Zoom <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[#536F1A]">
                        <MapPin className="w-3 h-3" /> {sc.room_name || 'Ruang Kuliah'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openModal(sc)}
                        className="p-2 rounded-full hover:bg-[#F0F8DF] text-[#536F1A]"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(sc.id)}
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
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((dow) => {
            const dayItems = items.filter((i) => i.day_of_week === dow);
            return (
              <div key={dow} className="rounded-2xl bg-white border border-[#D5E4B6] p-4 space-y-3">
                <h3 className="text-sm font-bold text-[#20251D] pb-2 border-b border-[#EBF3DA]">
                  {DAY_NAMES_ID[dow]}
                </h3>
                {dayItems.length === 0 ? (
                  <p className="text-xs text-[#536F1A]">Tidak ada jadwal</p>
                ) : (
                  <div className="space-y-2">
                    {dayItems.map((sc) => (
                      <div key={sc.id} className="p-3 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] text-xs">
                        <p className="font-mono tabular-nums text-[#536F1A] font-semibold">
                          {sc.start_time}–{sc.end_time} WIB
                        </p>
                        <p className="font-bold text-[#20251D] mt-0.5">{sc.course_name}</p>
                        <p className="text-[#536F1A] mt-0.5">
                          {sc.class_name} · {sc.mode}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit Jadwal Kuliah' : 'Tambah Jadwal Kuliah'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1">Kelas</label>
            <select
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.study_program_code})
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Mata Kuliah</label>
              <input
                required
                value={courseName}
                onChange={(e) => setCourseName(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Kode MK (Opsional)</label>
              <input
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">Dosen Pengampu</label>
            <input
              value={lecturerName}
              onChange={(e) => setLecturerName(e.target.value)}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Hari</label>
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full rounded-full border border-[#D5E4B6] px-3 py-2 text-sm bg-white"
              >
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                  <option key={d} value={d}>
                    {DAY_NAMES_ID[d]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Mulai (WIB)</label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Selesai (WIB)</label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-full border border-[#D5E4B6] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold mb-1">Mode Perkuliahan</label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as ClassMode)}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="Luring">Luring (Tatap Muka)</option>
                <option value="Daring">Daring (Online)</option>
              </select>
            </div>
            {mode === 'Daring' ? (
              <div>
                <label className="block text-xs font-semibold mb-1">Link Meet / Zoom</label>
                <input
                  type="url"
                  value={meetingLink}
                  onChange={(e) => setMeetingLink(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold mb-1">Nama Ruangan</label>
                <input
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Gedung A Lt. 2"
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
                />
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-full border border-[#D5E4B6] px-5 py-2 text-xs font-semibold"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-5 py-2 text-xs font-bold"
            >
              Simpan Jadwal
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
