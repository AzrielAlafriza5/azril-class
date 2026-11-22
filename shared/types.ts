export type UserRole = 'ADMIN' | 'MAHASISWA';
export type StudentBadge = 'Netral' | 'AFK' | 'Lulus';
export type ClassMode = 'Daring' | 'Luring';
export type AttendanceStatus = 'Hadir' | 'Izin' | 'Sakit' | 'Alfa';
export type AttendanceMethod = 'SELF_ONLINE' | 'QR_SCAN' | 'ADMIN_MANUAL' | 'HISTORICAL_IMPORT';
export type SessionStatus = 'OPEN' | 'CLOSED';
export type SubmissionMethod = 'TEXT' | 'LINK' | 'FILE' | 'ANY';
export type SubmissionStatus = 'SUBMITTED' | 'NEEDS_REVISION' | 'VERIFIED' | 'GRADED';
export type XpSourceType =
  | 'DAILY_LOGIN'
  | 'STREAK_BONUS'
  | 'ATTENDANCE'
  | 'HISTORICAL_ATTENDANCE'
  | 'ASSIGNMENT'
  | 'ACTIVITY'
  | 'CORRECTION';

export interface AuthUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  studentId?: string;
  nim?: string;
  studyProgramId?: string;
  studyProgramCode?: string;
  studyProgramName?: string;
  classId?: string;
  className?: string;
  cohortYear?: number;
  semester?: number;
  badge?: StudentBadge;
  totalXp?: number;
  currentStreak?: number;
  longestStreak?: number;
}

export interface AcademicSettings {
  institutionName: string;
  activeAcademicYear: string;
  activeSemester: string;
  defaultAttendanceDurationMinutes: number;
  showAiInitialScore: boolean;
  showGlobalRankingToStudents: boolean;
  updatedAt: string;
}

export interface StudyProgram {
  id: string;
  code: string;
  name: string;
  faculty: string;
  degreeLevel: string;
  classQuota: number;
  classCount?: number;
  studentCount?: number;
}

export interface AcademicClass {
  id: string;
  name: string;
  studyProgramId: string;
  studyProgramCode?: string;
  studyProgramName?: string;
  semester: number;
  academicYear: string;
  homeroomLecturer: string;
  studentCount?: number;
}

export interface StudentRecord {
  id: string;
  userId: string;
  username: string;
  email: string | null;
  isActive: boolean;
  nim: string;
  fullName: string;
  studyProgramId: string;
  studyProgramCode: string;
  studyProgramName: string;
  classId: string;
  className: string;
  cohortYear: number;
  semester: number;
  badge: StudentBadge;
  totalXp: number;
  currentStreak: number;
  longestStreak: number;
  lastLoginDateWib: string | null;
  createdAt: string;
}

export interface ScheduleItem {
  id: string;
  courseName: string;
  courseCode: string;
  lecturerName: string;
  classId: string;
  className?: string;
  studyProgramCode?: string;
  dayOfWeek: number; // 1=Senin .. 7=Minggu
  startTime: string;
  endTime: string;
  mode: ClassMode;
  meetingLink: string;
  roomName: string;
  semester: number;
  isActive: boolean;
}

export interface AttendanceSession {
  id: string;
  scheduleId: string | null;
  courseName?: string;
  classId: string;
  className?: string;
  title: string;
  mode: ClassMode;
  openAtUtc: string;
  closeAtUtc: string;
  qrToken: string;
  qrExpiresAt: string | null;
  status: SessionStatus;
  recordedCount?: number;
  totalStudents?: number;
  myRecord?: AttendanceRecord | null;
}

export interface AttendanceRecord {
  id: string;
  sessionId: string;
  sessionTitle?: string;
  studentId: string;
  studentName?: string;
  nim?: string;
  className?: string;
  status: AttendanceStatus;
  recordedAtUtc: string;
  method: AttendanceMethod;
  notes: string;
  correctionReason: string;
  correctedByAdminName?: string;
  correctedAtUtc?: string | null;
  xpAwarded: number;
}

export interface AssignmentItem {
  id: string;
  title: string;
  description: string;
  deadlineUtc: string;
  allowLate: boolean;
  lockAfterDeadline: boolean;
  allowedFormats: string;
  maxFileSizeMb: number;
  submissionMethod: SubmissionMethod;
  externalLink: string;
  isActive: boolean;
  createdAt: string;
  targets: { targetType: 'CLASS' | 'PRODI'; targetId: string; label?: string }[];
  attachments: {
    id: string;
    fileName: string;
    storagePath: string;
    mimeType: string;
    fileSizeBytes: number;
  }[];
  submissionCount?: number;
  targetStudentCount?: number;
  mySubmission?: SubmissionItem | null;
}

export interface SubmissionItem {
  id: string;
  assignmentId: string;
  assignmentTitle?: string;
  deadlineUtc?: string;
  studentId: string;
  studentName?: string;
  nim?: string;
  studyProgramCode?: string;
  className?: string;
  textAnswer: string;
  linkUrl: string;
  fileName: string;
  storagePath: string;
  mimeType: string;
  fileSizeBytes: number;
  submittedAtUtc: string;
  isLate: boolean;
  revisionCount: number;
  status: SubmissionStatus;
  isVerified: boolean;
  verifiedAtUtc: string | null;
  checklist?: { label: string; checked: boolean }[];
  grade?: {
    id: string;
    score: number;
    feedback: string;
    needsRevision: boolean;
    gradedAtUtc: string;
  } | null;
  aiAnalysis?: AiAnalysisResult | null;
}

export interface AiAnalysisResult {
  id: string;
  submissionId: string;
  status: 'COMPLETED' | 'UNAVAILABLE';
  fileStatus: string;
  completenessStatus: string;
  matchPercentage: number | null;
  summary: string;
  matchedParts: string[];
  unmatchedParts: string[];
  revisionRecommendations: string[];
  modelUsed: string;
  analyzedAtUtc: string;
}

export interface XpTransactionItem {
  id: string;
  studentId: string;
  studentName?: string;
  nim?: string;
  amount: number;
  sourceType: XpSourceType;
  sourceId: string;
  description: string;
  grantedByAdminName?: string | null;
  createdAtUtc: string;
}

export interface NotificationItem {
  id: string;
  recipientUserId: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  relatedPath: string;
  createdAtUtc: string;
}
