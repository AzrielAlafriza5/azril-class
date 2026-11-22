import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, Settings, Shield } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatWibDateTime } from '../../../shared/time';
import type { AcademicSettings, NotificationItem } from '../../../shared/types';

interface AuditLogRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details_json: string;
  created_at_utc: string;
  admin_name: string | null;
  admin_username: string | null;
}

export const AdminSystemPage: React.FC<{ onUnreadChange?: () => void }> = ({ onUnreadChange }) => {
  const { pushToast, refreshSystemStatus } = useAuth();
  const [tab, setTab] = useState<'notifications' | 'settings' | 'audit'>('notifications');
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [settings, setSettings] = useState<AcademicSettings | null>(null);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nRes, sRes, lRes] = await Promise.all([
        apiRequest<{ items: Array<Record<string, unknown>> }>(`/api/admin/notifications?filter=${notifFilter}`),
        apiRequest<AcademicSettings>('/api/admin/settings'),
        apiRequest<{ items: AuditLogRow[] }>('/api/admin/audit-logs'),
      ]);
      setNotifications(
        nRes.items.map((n) => ({
          id: String(n.id),
          recipientUserId: String(n.recipient_user_id),
          title: String(n.title),
          message: String(n.message),
          category: String(n.category),
          isRead: Number(n.is_read) === 1,
          relatedPath: String(n.related_path ?? ''),
          createdAtUtc: String(n.created_at_utc),
        }))
      );
      setSettings(sRes);
      setLogs(lRes.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sistem & pengaturan');
    } finally {
      setLoading(false);
    }
  }, [notifFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await apiRequest(`/api/admin/notifications/${id}/read`, { method: 'PATCH' });
    await load();
    onUnreadChange?.();
  };

  const markAllRead = async () => {
    await apiRequest('/api/admin/notifications/read-all', { method: 'PATCH' });
    await load();
    onUnreadChange?.();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      await apiRequest('/api/admin/settings', {
        method: 'PUT',
        body: JSON.stringify(settings),
      });
      await refreshSystemStatus();
      pushToast({ type: 'success', title: 'Pengaturan sistem disimpan' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan pengaturan', description: err instanceof Error ? err.message : '' });
    }
  };

  if (loading) return <TableSkeleton />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6">
      <div className="inline-flex p-1 rounded-full bg-white border border-[#D5E4B6]">
        <button
          type="button"
          onClick={() => setTab('notifications')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${
            tab === 'notifications' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          Notifikasi
        </button>
        <button
          type="button"
          onClick={() => setTab('settings')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${
            tab === 'settings' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Pengaturan Sistem
        </button>
        <button
          type="button"
          onClick={() => setTab('audit')}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold ${
            tab === 'audit' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Audit Aktivitas Admin
        </button>
      </div>

      {tab === 'notifications' && (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex p-1 rounded-full bg-[#F0F8DF]">
              <button
                type="button"
                onClick={() => setNotifFilter('all')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                  notifFilter === 'all' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
                }`}
              >
                Semua
              </button>
              <button
                type="button"
                onClick={() => setNotifFilter('unread')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
                  notifFilter === 'unread' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
                }`}
              >
                Belum Dibaca
              </button>
            </div>
            <button
              type="button"
              onClick={() => void markAllRead()}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] px-4 py-1.5 text-xs font-semibold hover:bg-[#F0F8DF]"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Tandai Semua Dibaca
            </button>
          </div>

          {notifications.length === 0 ? (
            <p className="text-xs text-[#536F1A] py-8 text-center">Tidak ada notifikasi.</p>
          ) : (
            <div className="divide-y divide-[#EBF3DA]">
              {notifications.map((n) => (
                <div key={n.id} className="py-3.5 flex items-start justify-between gap-3">
                  <div>
                    <p className={`text-sm font-semibold ${n.isRead ? 'text-[#20251D]/70' : 'text-[#20251D]'}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-[#536F1A] mt-0.5">{n.message}</p>
                    <p className="text-[11px] font-mono text-[#20251D]/60 mt-1">
                      {n.category} · {formatWibDateTime(n.createdAtUtc)}
                    </p>
                  </div>
                  {!n.isRead && (
                    <button
                      type="button"
                      onClick={() => void markRead(n.id)}
                      className="rounded-full bg-[#B5D45D] text-[#171A17] px-3 py-1 text-xs font-bold shrink-0"
                    >
                      Tandai Dibaca
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'settings' && settings && (
        <form onSubmit={handleSaveSettings} className="rounded-2xl bg-white border border-[#D5E4B6] p-6 space-y-5 max-w-2xl">
          <h3 className="text-base font-bold text-[#20251D]">Konfigurasi Akademik & Sistem</h3>
          <div>
            <label className="block text-xs font-semibold mb-1">Nama Institusi</label>
            <input
              required
              value={settings.institutionName}
              onChange={(e) => setSettings({ ...settings, institutionName: e.target.value })}
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Tahun Akademik Aktif</label>
              <input
                required
                value={settings.activeAcademicYear}
                onChange={(e) => setSettings({ ...settings, activeAcademicYear: e.target.value })}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Semester Aktif</label>
              <select
                value={settings.activeSemester}
                onChange={(e) => setSettings({ ...settings, activeSemester: e.target.value })}
                className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm bg-white"
              >
                <option value="Ganjil">Ganjil</option>
                <option value="Genap">Genap</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1">
              Durasi Default Sesi Absensi (5–180 Menit)
            </label>
            <input
              type="number"
              min={5}
              max={180}
              required
              value={settings.defaultAttendanceDurationMinutes}
              onChange={(e) =>
                setSettings({ ...settings, defaultAttendanceDurationMinutes: Number(e.target.value) })
              }
              className="w-full rounded-full border border-[#D5E4B6] px-4 py-2 text-sm"
            />
          </div>
          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showAiInitialScore}
                onChange={(e) => setSettings({ ...settings, showAiInitialScore: e.target.checked })}
                className="w-4 h-4 accent-[#536F1A]"
              />
              Tampilkan rekomendasi & skor kesesuaian AI ke Mahasiswa
            </label>
            <label className="flex items-center gap-2.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={settings.showGlobalRankingToStudents}
                onChange={(e) => setSettings({ ...settings, showGlobalRankingToStudents: e.target.checked })}
                className="w-4 h-4 accent-[#536F1A]"
              />
              Aktifkan visibilitas Ranking Global bagi Mahasiswa
            </label>
          </div>
          <button
            type="submit"
            className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-6 py-2.5 text-xs font-bold"
          >
            Simpan Pengaturan
          </button>
        </form>
      )}

      {tab === 'audit' && (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-[#F0F8DF] border-b border-[#D5E4B6] font-semibold text-[#364B0F]">
              <tr>
                <th className="px-4 py-3">Waktu WIB</th>
                <th className="px-4 py-3">Admin</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Entitas</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EBF3DA]">
              {logs.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-2.5 font-mono tabular-nums whitespace-nowrap">
                    {formatWibDateTime(l.created_at_utc)}
                  </td>
                  <td className="px-4 py-2.5 font-semibold">{l.admin_name || l.admin_username || '-'}</td>
                  <td className="px-4 py-2.5 font-mono font-semibold text-[#364B0F]">{l.action}</td>
                  <td className="px-4 py-2.5">{l.entity_type}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] max-w-xs truncate">{l.details_json}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
