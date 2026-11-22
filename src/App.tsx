import React, { useCallback, useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { apiRequest } from './lib/api';
import { AppShell } from './components/layout/AppShell';
import { LimeRunnerBar } from './components/ui/LimeRunnerBar';
import { PageTransition } from './components/ui/PageTransition';
import { ToastContainer } from './components/ui/EmptyAndErrorState';
import { OfflineIndicator } from './components/ui/PWAInstallButton';
import { LoginPage } from './pages/LoginPage';

// Admin Pages (10 Menus)
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminProdiClassPage } from './pages/admin/AdminProdiClassPage';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminSchedulesPage } from './pages/admin/AdminSchedulesPage';
import { AdminAttendancePage } from './pages/admin/AdminAttendancePage';
import { AdminAssignmentsPage } from './pages/admin/AdminAssignmentsPage';
import { AdminSubmissionsGradingPage } from './pages/admin/AdminSubmissionsGradingPage';
import { AdminXpRankingPage } from './pages/admin/AdminXpRankingPage';
import { AdminReportsExportPage } from './pages/admin/AdminReportsExportPage';
import { AdminSystemPage } from './pages/admin/AdminSystemPage';

// Student Pages (10 Menus)
import { StudentDashboardPage } from './pages/student/StudentDashboardPage';
import { StudentSchedulesPage } from './pages/student/StudentSchedulesPage';
import { StudentAttendancePage } from './pages/student/StudentAttendancePage';
import { StudentAssignmentsPage } from './pages/student/StudentAssignmentsPage';
import { StudentGradesPage } from './pages/student/StudentGradesPage';
import { StudentXpPage } from './pages/student/StudentXpPage';
import { StudentRankingPage } from './pages/student/StudentRankingPage';
import {
  StudentNotificationsPage,
  StudentProfilePage,
  StudentSettingsPage,
} from './pages/student/StudentAccountPages';

const ADMIN_PAGES = new Set([
  'dashboard',
  'prodi-classes',
  'students',
  'schedules',
  'attendance',
  'assignments',
  'submissions',
  'xp-ranking',
  'reports-export',
  'system',
]);

const STUDENT_PAGES = new Set([
  'dashboard',
  'schedules',
  'attendance',
  'assignments',
  'grades',
  'xp',
  'ranking',
  'profile',
  'notifications',
  'settings',
]);

const AuthenticatedWorkspace: React.FC = () => {
  const { user, loading } = useAuth();
  const [activePage, setActivePage] = useState<string>('dashboard');
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0);

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setUnreadNotifications(0);
      return;
    }
    try {
      const endpoint =
        user.role === 'ADMIN'
          ? '/api/admin/notifications?filter=unread'
          : '/api/student/notifications?filter=unread';
      const res = await apiRequest<{ items: unknown[] }>(endpoint);
      setUnreadNotifications(res.items.length);
    } catch {
      // ignore transient notification polling errors
    }
  }, [user]);

  useEffect(() => {
    setActivePage('dashboard');
    void refreshUnreadCount();
  }, [user?.id, user?.role, refreshUnreadCount]);

  useEffect(() => {
    if (!user) return;
    const id = setInterval(() => {
      void refreshUnreadCount();
    }, 45000);
    return () => clearInterval(id);
  }, [user, refreshUnreadCount]);

  const handleNavigate = (pageId: string) => {
    if (!user) return;
    const allowed = user.role === 'ADMIN' ? ADMIN_PAGES : STUDENT_PAGES;
    if (allowed.has(pageId)) {
      setActivePage(pageId);
    } else {
      setActivePage('dashboard');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F8DF] flex flex-col items-center justify-center p-6 text-center">
        <LimeRunnerBar forceActive />
        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-white border border-[#D5E4B6] flex items-center justify-center mb-4">
          <img
            src="/assets/aistudio/Desain_tanpa_judul_4212b3ec.png"
            alt="AZRIL CLAS"
            className="w-full h-full object-contain scale-[1.35]"
          />
        </div>
        <p className="text-base font-bold text-[#20251D]">AZRIL CLAS</p>
        <p className="text-xs text-[#536F1A] mt-1">Memeriksa sesi dan memuat ruang akademik...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  const renderAdminPage = () => {
    switch (activePage) {
      case 'prodi-classes':
        return <AdminProdiClassPage />;
      case 'students':
        return <AdminStudentsPage />;
      case 'schedules':
        return <AdminSchedulesPage />;
      case 'attendance':
        return <AdminAttendancePage />;
      case 'assignments':
        return <AdminAssignmentsPage />;
      case 'submissions':
        return <AdminSubmissionsGradingPage />;
      case 'xp-ranking':
        return <AdminXpRankingPage />;
      case 'reports-export':
        return <AdminReportsExportPage />;
      case 'system':
        return <AdminSystemPage onUnreadChange={() => void refreshUnreadCount()} />;
      case 'dashboard':
      default:
        return <AdminDashboardPage onNavigate={handleNavigate} />;
    }
  };

  const renderStudentPage = () => {
    switch (activePage) {
      case 'schedules':
        return <StudentSchedulesPage onNavigate={handleNavigate} />;
      case 'attendance':
        return <StudentAttendancePage />;
      case 'assignments':
        return <StudentAssignmentsPage />;
      case 'grades':
        return <StudentGradesPage />;
      case 'xp':
        return <StudentXpPage />;
      case 'ranking':
        return <StudentRankingPage />;
      case 'profile':
        return <StudentProfilePage />;
      case 'notifications':
        return <StudentNotificationsPage onUnreadChange={() => void refreshUnreadCount()} />;
      case 'settings':
        return <StudentSettingsPage />;
      case 'dashboard':
      default:
        return <StudentDashboardPage onNavigate={handleNavigate} />;
    }
  };

  return (
    <AppShell
      activePage={activePage}
      onNavigate={handleNavigate}
      unreadNotifications={unreadNotifications}
    >
      <PageTransition pageKey={`${user.role}-${activePage}`}>
        {user.role === 'ADMIN' ? renderAdminPage() : renderStudentPage()}
      </PageTransition>
    </AppShell>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <LimeRunnerBar />
      <AuthenticatedWorkspace />
      <ToastContainer />
      <OfflineIndicator />
    </AuthProvider>
  );
}
