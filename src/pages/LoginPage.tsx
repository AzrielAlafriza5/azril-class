import React, { useState } from 'react';
import { Eye, EyeOff, Lock, ShieldCheck, User, ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { PWAInstallButton } from '../components/ui/PWAInstallButton';

export const LoginPage: React.FC = () => {
  const { systemStatus, loginAdmin, bootstrapAdmin, loginStudent, pushToast } = useAuth();
  const [portal, setPortal] = useState<'MAHASISWA' | 'ADMIN'>('MAHASISWA');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Student login state
  const [studentUsername, setStudentUsername] = useState('');
  const [studentPassword, setStudentPassword] = useState('');

  // Admin login state
  const [adminIdentifier, setAdminIdentifier] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  // First-run Admin Claim state (only shown if no admin exists yet)
  const [claimUsername, setClaimUsername] = useState('admin');
  const [claimEmail, setClaimEmail] = useState('');
  const [claimFullName, setClaimFullName] = useState('Administrator AZRIL CLAS');
  const [claimPassword, setClaimPassword] = useState('');

  const needsAdminClaim =
    portal === 'ADMIN' && systemStatus && !systemStatus.hasAdmin && !systemStatus.envBootstrapConfigured;

  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!studentUsername.trim() || !studentPassword) {
      setErrorMsg('Username dan password mahasiswa wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      const { loginReward } = await loginStudent(studentUsername.trim(), studentPassword);
      if (loginReward && (loginReward.xpAwarded > 0 || loginReward.streakBonusAwarded > 0)) {
        const total = loginReward.xpAwarded + loginReward.streakBonusAwarded;
        pushToast({
          type: 'success',
          title: `+${total} XP Login Harian!`,
          description: `Streak aktif: ${loginReward.currentStreak} hari berturut-turut.`,
        });
      } else {
        pushToast({ type: 'success', title: 'Selamat datang kembali di AZRIL CLAS' });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk ke portal mahasiswa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!adminIdentifier.trim() || !adminPassword) {
      setErrorMsg('Username/email dan password Admin wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await loginAdmin(adminIdentifier.trim(), adminPassword);
      pushToast({ type: 'success', title: 'Sesi Admin aktif (maksimal 8 jam)' });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal masuk sebagai Admin.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      await bootstrapAdmin({
        username: claimUsername.trim(),
        email: claimEmail.trim() || undefined,
        fullName: claimFullName.trim(),
        password: claimPassword,
      });
      pushToast({
        type: 'success',
        title: 'Akun Admin Utama Berhasil Dibuat',
        description: 'Anda sekarang masuk ke Dashboard Admin AZRIL CLAS.',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal membuat akun Admin awal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F8DF] text-[#20251D] flex flex-col justify-between p-4 sm:p-6 lg:p-10">
      {/* Minimal Header */}
      <header className="max-w-6xl w-full mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-[#D5E4B6] flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/Desain_tanpa_judul_4212b3ec.png"
              alt="Logo AZRIL CLAS"
              className="w-full h-full object-contain scale-[1.35]"
            />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-[#20251D]">AZRIL CLAS</span>
            <p className="text-xs text-[#536F1A]">Manage Your Class, Simplify Your Academic Life.</p>
          </div>
        </div>
        <PWAInstallButton />
      </header>

      {/* Main Split Card */}
      <main className="max-w-6xl w-full mx-auto my-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left Clean Minimalist Summary Panel (No Photos/Extra Images) */}
        <section className="lg:col-span-6 rounded-3xl bg-[#171A17] text-[#F0F8DF] p-6 sm:p-10 flex flex-col justify-between">
          <div className="space-y-4">
            <p className="text-xs font-medium text-[#B5D45D]">
              {systemStatus?.institutionName ?? 'AZRIL CLAS Academic'} · {systemStatus?.activeAcademicYear ?? '2026/2027'} (
              {systemStatus?.activeSemester ?? 'Ganjil'})
            </p>
            <h1 className="text-2xl sm:text-4xl font-bold leading-tight text-white [text-wrap:balance]">
              Manage Your Class, Simplify Your Academic Life.
            </h1>
            <p className="text-sm text-[#DCECB8]/80 leading-relaxed max-w-md">
              Platform manajemen kelas, absensi QR dinamis, penugasan terarah, evaluasi terstruktur, dan gamifikasi XP
              akademik dalam satu ruang kerja terpadu.
            </p>
          </div>

          <div className="mt-8 pt-6 border-t border-[#232822] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-[#232822] p-4">
              <p className="text-xs font-semibold text-[#B5D45D]">Absensi Pintar</p>
              <p className="text-xs text-[#DCECB8]/80 mt-1 leading-relaxed">
                Check-in Daring &amp; Scan QR Luring dengan kuota izin otomatis.
              </p>
            </div>
            <div className="rounded-2xl bg-[#232822] p-4">
              <p className="text-xs font-semibold text-[#B5D45D]">Penugasan &amp; Nilai</p>
              <p className="text-xs text-[#DCECB8]/80 mt-1 leading-relaxed">
                Pengumpulan multi-format, riwayat revisi, dan penilaian resmi Admin.
              </p>
            </div>
            <div className="rounded-2xl bg-[#232822] p-4">
              <p className="text-xs font-semibold text-[#B5D45D]">XP &amp; Ranking WIB</p>
              <p className="text-xs text-[#DCECB8]/80 mt-1 leading-relaxed">
                Akumulasi poin kehadiran, streak harian WIB, dan klasemen kelas.
              </p>
            </div>
          </div>
        </section>

        {/* Right Login Form */}
        <section className="lg:col-span-6 rounded-3xl bg-white border border-[#D5E4B6] p-6 sm:p-8 flex flex-col justify-center">
          {/* Role Switcher */}
          <div className="inline-flex p-1 rounded-full bg-[#F0F8DF] border border-[#D5E4B6] self-start mb-6">
            <button
              type="button"
              onClick={() => {
                setPortal('MAHASISWA');
                setErrorMsg(null);
              }}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors min-h-[40px] ${
                portal === 'MAHASISWA'
                  ? 'bg-[#171A17] text-[#B5D45D]'
                  : 'text-[#536F1A] hover:text-[#20251D]'
              }`}
            >
              Portal Mahasiswa
            </button>
            <button
              type="button"
              onClick={() => {
                setPortal('ADMIN');
                setErrorMsg(null);
              }}
              className={`px-5 py-2 rounded-full text-xs font-semibold transition-colors min-h-[40px] ${
                portal === 'ADMIN'
                  ? 'bg-[#171A17] text-[#B5D45D]'
                  : 'text-[#536F1A] hover:text-[#20251D]'
              }`}
            >
              Portal Admin
            </button>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="mb-5 rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-800"
            >
              {errorMsg}
            </div>
          )}

          {portal === 'MAHASISWA' ? (
            <form onSubmit={handleStudentSubmit} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-[#20251D]">Masuk Akun Mahasiswa</h2>
                <p className="text-xs text-[#536F1A] mt-1">
                  Gunakan username dan password resmi yang telah diberikan oleh Admin kelas Anda.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="student-username" className="block text-xs font-semibold text-[#20251D]">
                  Username
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#536F1A] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    id="student-username"
                    type="text"
                    autoComplete="username"
                    value={studentUsername}
                    onChange={(e) => setStudentUsername(e.target.value)}
                    placeholder="Masukkan username Anda"
                    className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="student-password" className="block text-xs font-semibold text-[#20251D]">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#536F1A] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    id="student-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={studentPassword}
                    onChange={(e) => setStudentPassword(e.target.value)}
                    placeholder="Masukkan password"
                    className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-11 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#536F1A] hover:text-[#20251D]"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#B5D45D] hover:bg-[#C5E370] disabled:opacity-60 text-[#171A17] font-bold py-3.5 text-sm transition-colors min-h-[48px]"
              >
                {submitting ? 'Memverifikasi...' : 'Masuk Dashboard Mahasiswa'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-xs text-[#536F1A] pt-2 border-t border-[#EBF3DA]">
                Akun mahasiswa dikelola penuh oleh Admin. Hubungi Admin jika Anda memerlukan bantuan atau reset akun.
              </p>
            </form>
          ) : needsAdminClaim ? (
            <form onSubmit={handleAdminBootstrap} className="space-y-4">
              <div>
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#536F1A] mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  Aktivasi Pertama Kali
                </div>
                <h2 className="text-xl font-bold text-[#20251D]">Buat Akun Admin Utama</h2>
                <p className="text-xs text-[#536F1A] mt-1">
                  Database baru belum memiliki akun Admin. Klaim akun Admin pertama untuk mengelola sistem.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1">Username Admin</label>
                  <input
                    type="text"
                    required
                    value={claimUsername}
                    onChange={(e) => setClaimUsername(e.target.value)}
                    className="w-full rounded-full border border-[#D5E4B6] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1">Email (Opsional)</label>
                  <input
                    type="email"
                    value={claimEmail}
                    onChange={(e) => setClaimEmail(e.target.value)}
                    placeholder="admin@kampus.ac.id"
                    className="w-full rounded-full border border-[#D5E4B6] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Nama Lengkap</label>
                <input
                  type="text"
                  required
                  value={claimFullName}
                  onChange={(e) => setClaimFullName(e.target.value)}
                  className="w-full rounded-full border border-[#D5E4B6] px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1">Password Admin (min. 6 karakter)</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={claimPassword}
                    onChange={(e) => setClaimPassword(e.target.value)}
                    placeholder="Buat password yang kuat"
                    className="w-full rounded-full border border-[#D5E4B6] px-4 pr-11 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#536F1A]"
                    aria-label="Toggle password"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-full bg-[#B5D45D] hover:bg-[#C5E370] text-[#171A17] font-bold py-3.5 text-sm transition-colors min-h-[48px]"
              >
                {submitting ? 'Membuat Akun...' : 'Aktifkan & Masuk Dashboard Admin'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminSubmit} className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-[#20251D]">Masuk Konsol Admin</h2>
                <p className="text-xs text-[#536F1A] mt-1">
                  Akses khusus pengelola akademik. Masa sesi dibatasi maksimal 8 jam.
                </p>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-id" className="block text-xs font-semibold text-[#20251D]">
                  Username atau Email Admin
                </label>
                <div className="relative">
                  <ShieldCheck className="w-4 h-4 text-[#536F1A] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-id"
                    type="text"
                    autoComplete="username"
                    value={adminIdentifier}
                    onChange={(e) => setAdminIdentifier(e.target.value)}
                    placeholder="admin atau email@kampus.ac.id"
                    className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-11 pr-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="admin-pass" className="block text-xs font-semibold text-[#20251D]">
                  Password Admin
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-[#536F1A] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    id="admin-pass"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Masukkan password Admin"
                    className="w-full rounded-full border border-[#D5E4B6] bg-[#F0F8DF]/40 pl-11 pr-12 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#B5D45D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-[#536F1A]"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-[#171A17] hover:bg-[#232822] text-[#B5D45D] font-bold py-3.5 text-sm transition-colors min-h-[48px]"
              >
                {submitting ? 'Memverifikasi...' : 'Masuk Dashboard Admin'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="max-w-6xl w-full mx-auto text-center text-xs text-[#536F1A]">
        AZRIL CLAS Web Platform · Lime Green Minimalist Academic Suite
      </footer>
    </div>
  );
};
