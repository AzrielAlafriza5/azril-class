import React, { useEffect, useState } from 'react';
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Calendar,
  CheckSquare,
  ClipboardCheck,
  DownloadCloud,
  FileCheck2,
  FolderKanban,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { PWAInstallButton } from '../ui/PWAInstallButton';

export interface NavItem {
  id: string;
  label: string;
  shortLabel: string;
  category: string;
  icon: React.ReactNode;
  coreMobile?: boolean;
}

export const ADMIN_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', category: 'Utama', icon: <LayoutDashboard className="w-4 h-4" />, coreMobile: true },
  { id: 'prodi-classes', label: 'Prodi & Kelas', shortLabel: 'Prodi/Kls', category: 'Akademik', icon: <FolderKanban className="w-4 h-4" /> },
  { id: 'students', label: 'Data Mahasiswa', shortLabel: 'Mahasiswa', category: 'Akademik', icon: <Users className="w-4 h-4" />, coreMobile: true },
  { id: 'schedules', label: 'Jadwal Kuliah', shortLabel: 'Jadwal', category: 'Perkuliahan', icon: <Calendar className="w-4 h-4" /> },
  { id: 'attendance', label: 'Absensi & QR', shortLabel: 'Absensi', category: 'Perkuliahan', icon: <UserCheck className="w-4 h-4" />, coreMobile: true },
  { id: 'assignments', label: 'Penugasan', shortLabel: 'Tugas', category: 'Evaluasi', icon: <BookOpen className="w-4 h-4" />, coreMobile: true },
  { id: 'submissions', label: 'Pengumpulan & Nilai', shortLabel: 'Nilai/AI', category: 'Evaluasi', icon: <FileCheck2 className="w-4 h-4" /> },
  { id: 'xp-ranking', label: 'XP & Ranking', shortLabel: 'Ranking', category: 'Evaluasi', icon: <Trophy className="w-4 h-4" /> },
  { id: 'reports-export', label: 'Laporan & Ekspor', shortLabel: 'Ekspor', category: 'Sistem', icon: <BarChart3 className="w-4 h-4" /> },
  { id: 'system', label: 'Notifikasi & Pengaturan', shortLabel: 'Sistem', category: 'Sistem', icon: <Settings className="w-4 h-4" /> },
];

export const STUDENT_NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Beranda', category: 'Utama', icon: <LayoutDashboard className="w-4 h-4" />, coreMobile: true },
  { id: 'schedules', label: 'Jadwal', shortLabel: 'Jadwal', category: 'Akademik', icon: <Calendar className="w-4 h-4" />, coreMobile: true },
  { id: 'attendance', label: 'Absensi', shortLabel: 'Absensi', category: 'Akademik', icon: <CheckSquare className="w-4 h-4" />, coreMobile: true },
  { id: 'assignments', label: 'Tugas', shortLabel: 'Tugas', category: 'Akademik', icon: <BookOpen className="w-4 h-4" />, coreMobile: true },
  { id: 'grades', label: 'Nilai & AI', shortLabel: 'Nilai', category: 'Akademik', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'xp', label: 'Riwayat XP', shortLabel: 'XP', category: 'Gamifikasi', icon: <Zap className="w-4 h-4" /> },
  { id: 'ranking', label: 'Ranking', shortLabel: 'Ranking', category: 'Gamifikasi', icon: <Trophy className="w-4 h-4" />, coreMobile: true },
  { id: 'profile', label: 'Profil', shortLabel: 'Profil', category: 'Akun', icon: <GraduationCap className="w-4 h-4" /> },
  { id: 'notifications', label: 'Notifikasi', shortLabel: 'Notif', category: 'Akun', icon: <Bell className="w-4 h-4" /> },
  { id: 'settings', label: 'Pengaturan', shortLabel: 'Atur', category: 'Akun', icon: <Settings className="w-4 h-4" /> },
];

interface AppShellProps {
  activePage: string;
  onNavigate: (pageId: string) => void;
  unreadNotifications?: number;
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({
  activePage,
  onNavigate,
  unreadNotifications = 0,
  children,
}) => {
  const { user, logout, systemStatus } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [wibClock, setWibClock] = useState('');

  const navItems = user?.role === 'ADMIN' ? ADMIN_NAV_ITEMS : STUDENT_NAV_ITEMS;
  const activeItem = navItems.find((i) => i.id === activePage) ?? navItems[0];
  const mobileCoreItems = navItems.filter((i) => i.coreMobile).slice(0, 5);

  useEffect(() => {
    const updateClock = () => {
      const str = new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(new Date());
      setWibClock(`${str} WIB`);
    };
    updateClock();
    const id = setInterval(updateClock, 30000);
    return () => clearInterval(id);
  }, []);

  const categories = Array.from(new Set(navItems.map((i) => i.category)));

  const handleSelect = (id: string) => {
    onNavigate(id);
    setDrawerOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#F0F8DF] text-[#20251D] flex">
      {/* 1. DESKTOP (>= 840px): Permanent Dark Sidebar 240px */}
      <aside className="hidden min-[840px]:flex flex-col w-[240px] shrink-0 bg-[#171A17] text-[#F0F8DF] sticky top-0 h-screen border-r border-[#232822]">
        <div className="p-5 border-b border-[#232822] flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl overflow-hidden bg-white border border-[#364B0F] flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/Desain_tanpa_judul_4212b3ec.png"
              alt="AZRIL CLAS Logo"
              className="w-full h-full object-contain scale-[1.35]"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white truncate">AZRIL CLAS</p>
            <p className="text-[11px] text-[#B5D45D] truncate">
              {user?.role === 'ADMIN' ? 'Panel Admin' : 'Portal Mahasiswa'}
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Navigasi utama">
          {categories.map((cat) => (
            <div key={cat}>
              <p className="px-3 mb-1.5 text-[11px] font-medium text-[#DCECB8]/60">{cat}</p>
              <div className="space-y-1">
                {navItems
                  .filter((i) => i.category === cat)
                  .map((item) => {
                    const active = item.id === activePage;
                    const isNotif = item.id === 'notifications' || item.id === 'system';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelect(item.id)}
                        className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left min-h-[40px] ${
                          active
                            ? 'bg-[#B5D45D] text-[#171A17] font-semibold'
                            : 'text-[#DCECB8]/85 hover:bg-[#232822] hover:text-white'
                        }`}
                      >
                        <span className="flex items-center gap-2.5 min-w-0">
                          {item.icon}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {isNotif && unreadNotifications > 0 && (
                          <span
                            className={`text-[11px] tabular-nums font-semibold px-1.5 py-0.5 rounded-full ${
                              active ? 'bg-[#171A17] text-[#B5D45D]' : 'bg-[#B5D45D] text-[#171A17]'
                            }`}
                          >
                            {unreadNotifications}
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-[#232822] space-y-2">
          <div className="px-3 py-2 rounded-xl bg-[#232822]">
            <p className="text-xs font-semibold text-white truncate">{user?.fullName}</p>
            <p className="text-[11px] text-[#DCECB8]/70 truncate font-mono">
              {user?.role === 'ADMIN' ? `@${user.username}` : `${user?.nim} · ${user?.className}`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full flex items-center justify-center gap-2 rounded-full bg-[#232822] hover:bg-red-950/70 text-[#DCECB8] hover:text-red-200 px-3 py-2 text-xs font-medium transition-colors min-h-[40px]"
          >
            <LogOut className="w-3.5 h-3.5" />
            Keluar
          </button>
        </div>
      </aside>

      {/* 2. TABLET (600px - 839px): Dark Navigation Rail 76px */}
      <aside className="hidden min-[600px]:flex min-[840px]:hidden flex-col w-[76px] shrink-0 bg-[#171A17] text-[#F0F8DF] sticky top-0 h-screen items-center py-4 justify-between border-r border-[#232822]">
        <div className="flex flex-col items-center gap-4 w-full px-2">
          <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-[#364B0F] flex items-center justify-center shrink-0">
            <img
              src="/assets/aistudio/Desain_tanpa_judul_4212b3ec.png"
              alt="AZRIL CLAS"
              className="w-full h-full object-contain scale-[1.35]"
            />
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="w-11 h-11 rounded-xl bg-[#232822] text-[#B5D45D] flex items-center justify-center hover:bg-[#364B0F] transition-colors"
            aria-label="Buka semua menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-full space-y-1.5 pt-2">
            {navItems.slice(0, 7).map((item) => {
              const active = item.id === activePage;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelect(item.id)}
                  title={item.label}
                  className={`w-full py-2.5 rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${
                    active ? 'bg-[#B5D45D] text-[#171A17]' : 'text-[#DCECB8]/80 hover:bg-[#232822]'
                  }`}
                >
                  {item.icon}
                  <span className="text-[10px] font-medium truncate max-w-[60px]">{item.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void logout()}
          title="Keluar"
          className="w-11 h-11 rounded-full bg-[#232822] text-[#DCECB8] hover:text-red-300 flex items-center justify-center"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-24 min-[600px]:pb-8">
        {/* Structured Top Header */}
        <header className="sticky top-0 z-30 bg-[#F0F8DF]/90 backdrop-blur-md border-b border-[#D5E4B6] px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="min-[600px]:hidden p-2 rounded-full bg-white border border-[#D5E4B6] text-[#20251D] min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Menu lainnya"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold text-[#20251D] truncate">{activeItem.label}</h1>
              <p className="text-xs text-[#536F1A] truncate">
                {systemStatus?.institutionName ?? 'AZRIL CLAS Academic'} · {systemStatus?.activeAcademicYear} (
                {systemStatus?.activeSemester}) · <span className="font-mono tabular-nums">{wibClock}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <PWAInstallButton />
            <button
              type="button"
              onClick={() => handleSelect(user?.role === 'ADMIN' ? 'system' : 'notifications')}
              className="relative p-2.5 rounded-full bg-white border border-[#D5E4B6] text-[#20251D] hover:bg-[#DCECB8]/50 transition-colors min-w-[40px] min-h-[40px] flex items-center justify-center"
              aria-label="Notifikasi"
            >
              <Bell className="w-4 h-4" />
              {unreadNotifications > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#171A17] text-[#B5D45D] text-[10px] font-bold flex items-center justify-center tabular-nums">
                  {unreadNotifications}
                </span>
              )}
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1320px] w-full mx-auto">
          {children}
        </main>
      </div>

      {/* 3. SMARTPHONE (< 600px): Floating Pill Bottom Navigation Bar (5 core items) */}
      <nav
        aria-label="Navigasi cepat mobile"
        className="min-[600px]:hidden fixed bottom-3 left-3 right-3 z-40 rounded-full bg-[#171A17] border border-[#232822] shadow-xl px-2 py-1.5 flex items-center justify-around"
      >
        {mobileCoreItems.map((item) => {
          const active = item.id === activePage;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelect(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-full min-h-[44px] min-w-[52px] transition-colors ${
                active ? 'bg-[#B5D45D] text-[#171A17] font-semibold' : 'text-[#DCECB8]/80'
              }`}
            >
              {item.icon}
              <span className="text-[10px] leading-none truncate max-w-[54px]">{item.shortLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Slide-out Navigation Drawer for Mobile & Tablet extra menus */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-[#171A17]/60" onClick={() => setDrawerOpen(false)} />
          <div className="relative z-10 w-72 max-w-[85vw] bg-[#171A17] text-[#F0F8DF] h-full flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#232822] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg overflow-hidden bg-white flex items-center justify-center shrink-0">
                  <img
                    src="/assets/aistudio/Desain_tanpa_judul_4212b3ec.png"
                    alt="AZRIL CLAS"
                    className="w-full h-full object-contain scale-[1.35]"
                  />
                </div>
                <span className="font-bold text-sm">AZRIL CLAS</span>
              </div>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-2 rounded-full text-[#DCECB8] hover:bg-[#232822] min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="px-3 mb-1 text-[11px] text-[#DCECB8]/60">{cat}</p>
                  <div className="space-y-1">
                    {navItems
                      .filter((i) => i.category === cat)
                      .map((item) => {
                        const active = item.id === activePage;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => handleSelect(item.id)}
                            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium min-h-[44px] ${
                              active ? 'bg-[#B5D45D] text-[#171A17] font-semibold' : 'text-[#DCECB8]/85 hover:bg-[#232822]'
                            }`}
                          >
                            {item.icon}
                            <span>{item.label}</span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-[#232822]">
              <button
                type="button"
                onClick={() => void logout()}
                className="w-full flex items-center justify-center gap-2 rounded-full bg-[#232822] text-[#DCECB8] py-2.5 text-sm font-medium min-h-[44px]"
              >
                <LogOut className="w-4 h-4" />
                Keluar Akun
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
