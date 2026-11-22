import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, GraduationCap, Lock, Settings, ShieldCheck } from 'lucide-react';
import { apiRequest } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import { TableSkeleton } from '../../components/ui/Skeletons';
import { EmptyState, ErrorState } from '../../components/ui/EmptyAndErrorState';
import { formatWibDateTime } from '../../../shared/time';
import type { AuthUser, NotificationItem } from '../../../shared/types';

export const StudentProfilePage: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<AuthUser | null>(user);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ profile: AuthUser }>('/api/student/profile');
      setProfile(res.profile);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat profil mahasiswa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !profile) return <TableSkeleton rows={5} />;
  if (error && !profile) return <ErrorState message={error} onRetry={load} />;
  if (!profile) return null;

  const fields = [
    { label: 'Nama Lengkap', value: profile.fullName },
    { label: 'Nomor Induk Mahasiswa (NIM)', value: profile.nim ?? '-', mono: true },
    { label: 'Username Login', value: `@${profile.username}`, mono: true },
    { label: 'Email Terdaftar', value: profile.email || 'Belum diisi' },
    { label: 'Program Studi', value: `${profile.studyProgramCode ?? ''} — ${profile.studyProgramName ?? ''}` },
    { label: 'Kelas', value: profile.className ?? '-' },
    { label: 'Angkatan / Semester', value: `${profile.cohortYear ?? '-'} · Semester ${profile.semester ?? '-'}` },
    { label: 'Status Akun & Badge', value: `${profile.isActive ? 'Aktif' : 'Nonaktif'} · Badge ${profile.badge ?? 'Netral'}` },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="rounded-2xl bg-[#171A17] text-white p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#B5D45D] text-[#171A17] flex items-center justify-center shrink-0">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{profile.fullName}</h2>
            <p className="text-xs font-mono text-[#B5D45D]">
              {profile.nim} · {profile.studyProgramCode} · {profile.className}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-[#DCECB8]/70">Total XP & Streak</p>
          <p className="text-lg font-bold font-mono tabular-nums text-[#B5D45D]">
            {profile.totalXp ?? 0} XP · {profile.currentStreak ?? 0} hari
          </p>
        </div>
      </div>

      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-6">
        <h3 className="text-sm font-bold text-[#20251D] mb-4">Identitas Akademik Mahasiswa (Read-Only)</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.label} className="p-3.5 rounded-xl bg-[#F0F8DF]/60 border border-[#D5E4B6]">
              <p className="text-[11px] font-medium text-[#536F1A]">{f.label}</p>
              <p className={`text-sm font-semibold text-[#20251D] mt-0.5 ${f.mono ? 'font-mono' : ''}`}>{f.value}</p>
            </div>
          ))}
        </div>

        <div className="mt-5 p-4 rounded-xl bg-[#F0F8DF] border border-[#D5E4B6] flex items-start gap-3 text-xs text-[#364B0F]">
          <Lock className="w-4 h-4 shrink-0 mt-0.5" />
          <p>
            Sesuai kebijakan akun AZRIL CLAS, data akademik, username, dan password dikelola sepenuhnya oleh Admin.
            Apabila terdapat kesalahan data atau membutuhkan perubahan kredensial, silakan hubungi Admin kelas Anda.
          </p>
        </div>
      </div>
    </div>
  );
};

export const StudentNotificationsPage: React.FC<{ onUnreadChange?: () => void }> = ({ onUnreadChange }) => {
  const { pushToast } = useAuth();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [browserPerm, setBrowserPerm] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{ items: Array<Record<string, unknown>> }>(
        `/api/student/notifications?filter=${filter}`
      );
      setItems(
        res.items.map((n) => ({
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat notifikasi');
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    await apiRequest(`/api/student/notifications/${id}/read`, { method: 'PATCH' });
    await load();
    onUnreadChange?.();
  };

  const markAllRead = async () => {
    await apiRequest('/api/student/notifications/read-all', { method: 'PATCH' });
    await load();
    onUnreadChange?.();
  };

  const requestBrowserNotif = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserPerm(perm);
    pushToast({
      type: perm === 'granted' ? 'success' : 'info',
      title: perm === 'granted' ? 'Notifikasi browser diaktifkan' : 'Izin notifikasi belum diberikan',
    });
  };

  if (loading) return <TableSkeleton rows={5} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white border border-[#D5E4B6] p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex p-1 rounded-full bg-[#F0F8DF]">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              filter === 'all' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Semua
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold ${
              filter === 'unread' ? 'bg-[#171A17] text-[#B5D45D]' : 'text-[#536F1A]'
            }`}
          >
            Belum Dibaca
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {browserPerm === 'default' && (
            <button
              type="button"
              onClick={() => void requestBrowserNotif()}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#F0F8DF] border border-[#D5E4B6] px-4 py-1.5 text-xs font-semibold text-[#364B0F]"
            >
              <Bell className="w-3.5 h-3.5" />
              Izinkan Notifikasi Browser
            </button>
          )}
          <button
            type="button"
            onClick={() => void markAllRead()}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D5E4B6] px-4 py-1.5 text-xs font-semibold hover:bg-[#F0F8DF]"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Tandai Semua Dibaca
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<Bell className="w-5 h-5" />}
          title="Tidak Ada Notifikasi"
          description="Pemberitahuan tugas baru, sesi absensi terbuka, dan nilai resmi Admin akan muncul di sini."
        />
      ) : (
        <div className="rounded-2xl bg-white border border-[#D5E4B6] divide-y divide-[#EBF3DA]">
          {items.map((n) => (
            <div key={n.id} className="p-4 flex items-start justify-between gap-3">
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
  );
};

export const StudentSettingsPage: React.FC = () => {
  const { pushToast } = useAuth();
  const [prefs, setPrefs] = useState({
    browserNotifications: false,
    compactTables: false,
    streakReminderAlert: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<{
        prefs: { browserNotifications: boolean; compactTables: boolean; streakReminderAlert: boolean };
      }>('/api/student/settings');
      setPrefs(res.prefs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat preferensi mahasiswa');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (prefs.browserNotifications && typeof window !== 'undefined' && 'Notification' in window) {
        if (Notification.permission === 'default') {
          await Notification.requestPermission();
        }
      }
      const res = await apiRequest<{
        prefs: { browserNotifications: boolean; compactTables: boolean; streakReminderAlert: boolean };
      }>('/api/student/settings', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      });
      setPrefs(res.prefs);
      pushToast({ type: 'success', title: 'Preferensi tampilan & notifikasi disimpan' });
    } catch (err) {
      pushToast({ type: 'error', title: 'Gagal menyimpan preferensi', description: err instanceof Error ? err.message : '' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <TableSkeleton rows={3} />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-6 max-w-2xl">
      <form onSubmit={handleSave} className="rounded-2xl bg-white border border-[#D5E4B6] p-6 space-y-5">
        <div className="flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-[#536F1A]" />
          <h3 className="text-base font-bold text-[#20251D]">Preferensi Portal Mahasiswa</h3>
        </div>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F0F8DF]/70 border border-[#D5E4B6] cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.browserNotifications}
              onChange={(e) => setPrefs({ ...prefs, browserNotifications: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-[#536F1A]"
            />
            <div>
              <p className="text-sm font-semibold text-[#20251D]">Notifikasi Web Browser</p>
              <p className="text-xs text-[#536F1A]">
                Aktifkan izin notifikasi browser untuk pemberitahuan tugas dan sesi absensi baru.
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F0F8DF]/70 border border-[#D5E4B6] cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.streakReminderAlert}
              onChange={(e) => setPrefs({ ...prefs, streakReminderAlert: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-[#536F1A]"
            />
            <div>
              <p className="text-sm font-semibold text-[#20251D]">Pengingat Streak Harian (WIB)</p>
              <p className="text-xs text-[#536F1A]">
                Tampilkan pengingat harian untuk mempertahankan login streak (+5 XP setiap hari).
              </p>
            </div>
          </label>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-[#F0F8DF]/70 border border-[#D5E4B6] cursor-pointer">
            <input
              type="checkbox"
              checked={prefs.compactTables}
              onChange={(e) => setPrefs({ ...prefs, compactTables: e.target.checked })}
              className="mt-0.5 w-4 h-4 accent-[#536F1A]"
            />
            <div>
              <p className="text-sm font-semibold text-[#20251D]">Mode Tampilan Ringkas</p>
              <p className="text-xs text-[#536F1A]">Padatkan jarak baris tabel jadwal dan riwayat transaksi XP.</p>
            </div>
          </label>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] px-6 py-2.5 text-xs font-bold"
        >
          {saving ? 'Menyimpan...' : 'Simpan Preferensi'}
        </button>
      </form>

      <div className="rounded-2xl bg-[#171A17] text-[#F0F8DF] p-5 flex items-start gap-3 text-xs">
        <ShieldCheck className="w-5 h-5 text-[#B5D45D] shrink-0 mt-0.5" />
        <div>
          <p className="font-bold text-white">Keamanan Akun Mahasiswa</p>
          <p className="text-[#DCECB8]/80 mt-1 leading-relaxed">
            Username dan password akun mahasiswa dikendalikan secara terpusat oleh Admin. Tidak tersedia fitur ubah
            password atau registrasi mandiri pada portal mahasiswa.
          </p>
        </div>
      </div>
    </div>
  );
};
