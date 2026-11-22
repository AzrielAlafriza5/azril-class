import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import { db } from '../db/database.ts';
import { formatWibDateTime } from '../../shared/time.ts';
import type { AttendanceStatus, StudentBadge } from '../../shared/types.ts';

export interface ParsedExcelRow {
  sheetName: string;
  rowNumber: number;
  nim: string;
  fullName: string;
  username: string;
  password: string;
  cohortYear: number;
  semester: number;
  badge: StudentBadge;
  skipBlack: boolean;
  isDuplicateInFile: boolean;
  existsInDb: boolean;
  newWeeksCount: number;
  existingWeeksCount: number;
  willSkipExisting: boolean;
  validationError: string | null;
  historicalWeeks: Partial<Record<number, AttendanceStatus>>;
}

export interface ParsedWorkbookPreview {
  sheets: {
    sheetName: string;
    suggestedClassId: string | null;
    suggestedClassName: string | null;
    suggestedProdiId: string | null;
    totalRows: number;
    validRows: number;
    newStudentRows: number;
    existingWithNewWeeksRows: number;
    skippedExistingRows: number;
    afkRows: number;
    skippedBlackRows: number;
    duplicateRows: number;
    invalidRows: number;
    detectedWeeks: number[];
  }[];
  rows: ParsedExcelRow[];
  detectedWeeks: number[];
  ignoredSheets: { sheetName: string; reason: string }[];
}

function classifyFillColor(fill: ExcelJS.Fill | undefined): 'RED' | 'BLACK' | 'OTHER' {
  if (!fill || fill.type !== 'pattern' || fill.pattern === 'none') return 'OTHER';
  const fg = fill.fgColor ?? fill.bgColor;
  if (!fg || !fg.argb) return 'OTHER';
  const argb = fg.argb.toUpperCase();
  if (argb.length < 6) return 'OTHER';
  const hex = argb.length === 8 ? argb.slice(2) : argb;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return 'OTHER';

  // Black block -> skipped
  if (r <= 45 && g <= 45 && b <= 45) {
    return 'BLACK';
  }
  // Red fill -> AFK
  if (r >= 170 && g <= 105 && b <= 105) {
    return 'RED';
  }
  return 'OTHER';
}

function normalizeAttendanceValue(raw: unknown): AttendanceStatus | null {
  const s = String(raw ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'H' || s === 'HADIR' || s === '1' || s === 'V' || s === 'OK' || s === '✓') return 'Hadir';
  if (s === 'I' || s === 'IZIN') return 'Izin';
  if (s === 'S' || s === 'SAKIT') return 'Sakit';
  if (s === 'A' || s === 'ALFA' || s === 'ALPHA' || s === '0') return 'Alfa';
  return null;
}

function cellToString(val: ExcelJS.CellValue): string {
  if (val === null || val === undefined) return '';
  if (val instanceof Date) return val.toISOString();
  if (typeof val === 'object') {
    if ('richText' in val && Array.isArray(val.richText)) {
      return val.richText.map((r) => r.text).join('').trim();
    }
    if ('text' in val && val.text !== undefined) return String(val.text).trim();
    if ('result' in val && val.result !== undefined) return String(val.result).trim();
    if ('error' in val) return '';
  }
  return String(val).trim();
}

function matchHeaderKey(rawHeader: string): string | null {
  const text = rawHeader
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[\s_.:/()-]+/g, ' ')
    .trim();
  if (!text) return null;
  if (
    text === 'nim' ||
    text === 'npm' ||
    text === 'nrp' ||
    text.includes('nim') ||
    text.includes('npm') ||
    text.includes('no induk') ||
    text.includes('nomor induk') ||
    text === 'student id' ||
    text === 'id mahasiswa'
  ) {
    return 'nim';
  }
  if (
    text === 'nama' ||
    text === 'name' ||
    text.includes('nama') ||
    text === 'mahasiswa' ||
    text === 'full name'
  ) {
    return 'name';
  }
  if (text.includes('username') || text === 'user' || text === 'akun') return 'username';
  if (text.includes('password') || text === 'sandi' || text === 'pwd') return 'password';
  if (text.includes('angkatan') || text.includes('cohort') || text === 'tahun masuk') return 'cohort';
  if (text.includes('semester') || text === 'smt' || text === 'smst') return 'semester';

  // Match unlimited attendance weeks: M1..M200, Minggu 1.., W1.., Week 1.., Pertemuan 1.., Pert 1.., P1.., Sesi 1.., Ke-1..
  const compact = text.replace(/\s+/g, '');
  const weekMatch = compact.match(/^(?:m|minggu|w|week|pertemuan|pert|p|sesi|ke)(\d+)$/);
  if (weekMatch) {
    const num = Number(weekMatch[1]);
    if (Number.isInteger(num) && num >= 1 && num <= 200) {
      return `w${num}`;
    }
  }
  return null;
}

export async function parseStudentImportWorkbook(
  buffer: Buffer,
  originalName: string = 'upload.xlsx'
): Promise<ParsedWorkbookPreview> {
  if (!buffer || buffer.length === 0) {
    throw new Error('File yang diunggah kosong.');
  }

  // Detect legacy .xls (OLE2 Compound File magic bytes D0 CF 11 E0)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    throw new Error(
      'Format Excel lama (.xls) belum didukung langsung. Silakan buka di Excel/Google Sheets lalu Save As sebagai .xlsx terlebih dahulu.'
    );
  }

  const workbook = new ExcelJS.Workbook();
  const isCsv = originalName.toLowerCase().endsWith('.csv');
  if (isCsv) {
    const csvText = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const sampleLines = csvText.split(/\r?\n/).slice(0, 5).join('\n');
    const commaCount = (sampleLines.match(/,/g) ?? []).length;
    const semiCount = (sampleLines.match(/;/g) ?? []).length;
    const delimiter = semiCount > commaCount ? ';' : ',';
    await workbook.csv.read(Readable.from([csvText]), {
      parserOptions: { delimiter },
    });
  } else {
    try {
      await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new Error(
        'File tidak dapat dibaca sebagai workbook Excel (.xlsx). Pastikan format file adalah .xlsx yang valid atau .csv.'
      );
    }
  }

  const classes = db.prepare(`SELECT id, name, study_program_id FROM classes`).all() as {
    id: string;
    name: string;
    study_program_id: string;
  }[];
  const prodis = db.prepare(`SELECT id, code, name FROM study_programs`).all() as {
    id: string;
    code: string;
    name: string;
  }[];
  const existingNims = new Set(
    (db.prepare(`SELECT nim FROM students`).all() as { nim: string }[]).map((r) => r.nim.toUpperCase())
  );
  const existingWeeksByNim = new Map<string, Set<number>>();
  const existingHistRows = db
    .prepare(
      `SELECT upper(s.nim) AS nim_key, ha.week_number
       FROM historical_attendance ha
       JOIN students s ON s.id = ha.student_id`
    )
    .all() as { nim_key: string; week_number: number }[];
  for (const hr of existingHistRows) {
    if (!existingWeeksByNim.has(hr.nim_key)) {
      existingWeeksByNim.set(hr.nim_key, new Set());
    }
    existingWeeksByNim.get(hr.nim_key)!.add(Number(hr.week_number));
  }

  const seenNims = new Set<string>();

  const sheets: ParsedWorkbookPreview['sheets'] = [];
  const rows: ParsedExcelRow[] = [];
  const allDetectedWeeks = new Set<number>();
  const ignoredSheets: ParsedWorkbookPreview['ignoredSheets'] = [];

  for (const ws of workbook.worksheets) {
    const wsLower = ws.name.toLowerCase();
    if (wsLower.includes('panduan') || wsLower.includes('instruction')) {
      continue;
    }

    // Find header row in first 25 rows (many academic sheets have kop/title rows above headers)
    let headerRowIdx = 1;
    const colMap: Record<string, number> = {};
    const maxScan = Math.min(25, ws.rowCount || 0);
    for (let r = 1; r <= maxScan; r++) {
      const row = ws.getRow(r);
      const found: Record<string, number> = {};
      row.eachCell((cell, colNumber) => {
        const key = matchHeaderKey(cellToString(cell.value));
        if (key && !found[key]) {
          found[key] = colNumber;
        }
      });
      if (found.nim && found.name) {
        headerRowIdx = r;
        Object.assign(colMap, found);
        break;
      }
    }

    if (!colMap.nim || !colMap.name) {
      ignoredSheets.push({
        sheetName: ws.name,
        reason: 'Tidak ditemukan header kolom NIM/NPM dan Nama pada 25 baris pertama.',
      });
      continue;
    }

    const weekCols: Array<{ weekNumber: number; colNumber: number }> = [];
    for (const [k, cIdx] of Object.entries(colMap)) {
      if (k.startsWith('w')) {
        const num = Number(k.slice(1));
        if (Number.isInteger(num) && num >= 1) {
          weekCols.push({ weekNumber: num, colNumber: cIdx });
          allDetectedWeeks.add(num);
        }
      }
    }
    weekCols.sort((a, b) => a.weekNumber - b.weekNumber);

    const matchedClass = classes.find(
      (c) => c.name.toLowerCase() === ws.name.trim().toLowerCase() || wsLower.includes(c.name.toLowerCase())
    );
    const matchedProdi =
      prodis.find((p) => wsLower.includes(p.code.toLowerCase()) || wsLower.includes(p.name.toLowerCase())) ??
      prodis[0];

    let totalRows = 0;
    let validRows = 0;
    let newStudentRows = 0;
    let existingWithNewWeeksRows = 0;
    let skippedExistingRows = 0;
    let afkRows = 0;
    let skippedBlackRows = 0;
    let duplicateRows = 0;
    let invalidRows = 0;

    for (let r = headerRowIdx + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const nimRaw = cellToString(row.getCell(colMap.nim).value);
      const nameRaw = cellToString(row.getCell(colMap.name).value);
      if (!nimRaw && !nameRaw) continue;

      totalRows += 1;

      // Check fill colors across key columns (NIM, Name, or columns 1..3)
      let colorFlag: 'RED' | 'BLACK' | 'OTHER' = 'OTHER';
      const checkCols = Array.from(new Set([colMap.nim, colMap.name, 1, 2, 3]));
      for (const cIdx of checkCols) {
        const cellFill = classifyFillColor(row.getCell(cIdx).fill);
        if (cellFill === 'BLACK') {
          colorFlag = 'BLACK';
          break;
        }
        if (cellFill === 'RED') {
          colorFlag = 'RED';
        }
      }

      const skipBlack = colorFlag === 'BLACK';
      const badge: StudentBadge = colorFlag === 'RED' ? 'AFK' : 'Netral';

      const nimClean = nimRaw.replace(/\s+/g, '');
      const usernameRaw = colMap.username ? cellToString(row.getCell(colMap.username).value) : '';
      const passwordRaw = colMap.password ? cellToString(row.getCell(colMap.password).value) : '';
      const cohortRaw = colMap.cohort ? Number(cellToString(row.getCell(colMap.cohort).value)) : 2026;
      const semText = colMap.semester ? cellToString(row.getCell(colMap.semester).value) : '';
      const semMatch = semText.match(/\d+/);
      const semRaw = semMatch ? Number(semMatch[0]) : 1;

      const historicalWeeks: Partial<Record<number, AttendanceStatus>> = {};
      for (const wc of weekCols) {
        const parsedStatus = normalizeAttendanceValue(cellToString(row.getCell(wc.colNumber).value));
        if (parsedStatus) {
          historicalWeeks[wc.weekNumber] = parsedStatus;
        }
      }

      let validationError: string | null = null;
      if (!skipBlack) {
        if (!nimClean || nimClean.length < 4 || !/^[A-Za-z0-9._-]+$/.test(nimClean)) {
          validationError = 'NIM tidak valid (minimal 4 karakter alfanumerik)';
        } else if (!nameRaw || nameRaw.length < 2) {
          validationError = 'Nama lengkap wajib diisi';
        }
      }

      const nimKey = nimClean.toUpperCase();
      const isDuplicateInFile = !skipBlack && nimClean !== '' && seenNims.has(nimKey);
      if (nimClean && !skipBlack) {
        seenNims.add(nimKey);
      }
      const existsInDb = !skipBlack && nimClean !== '' && existingNims.has(nimKey);

      const recordedWeeksInDb = existingWeeksByNim.get(nimKey);
      let newWeeksCount = 0;
      let existingWeeksCount = 0;
      for (const weekStr of Object.keys(historicalWeeks)) {
        const wNum = Number(weekStr);
        if (existsInDb && recordedWeeksInDb?.has(wNum)) {
          existingWeeksCount += 1;
        } else {
          newWeeksCount += 1;
        }
      }
      const willSkipExisting = !skipBlack && !validationError && !isDuplicateInFile && existsInDb && newWeeksCount === 0;

      if (skipBlack) skippedBlackRows += 1;
      else if (validationError) invalidRows += 1;
      else if (isDuplicateInFile) duplicateRows += 1;
      else if (willSkipExisting) {
        skippedExistingRows += 1;
      } else {
        validRows += 1;
        if (existsInDb) existingWithNewWeeksRows += 1;
        else newStudentRows += 1;
        if (badge === 'AFK') afkRows += 1;
      }

      rows.push({
        sheetName: ws.name,
        rowNumber: r,
        nim: nimClean,
        fullName: nameRaw,
        username: usernameRaw || nimClean.toLowerCase(),
        password: passwordRaw || nimClean,
        cohortYear: Number.isFinite(cohortRaw) && cohortRaw > 2000 ? cohortRaw : 2026,
        semester: Number.isFinite(semRaw) && semRaw >= 1 && semRaw <= 14 ? semRaw : 1,
        badge,
        skipBlack,
        isDuplicateInFile,
        existsInDb,
        newWeeksCount,
        existingWeeksCount,
        willSkipExisting,
        validationError,
        historicalWeeks,
      });
    }

    sheets.push({
      sheetName: ws.name,
      suggestedClassId: matchedClass?.id ?? null,
      suggestedClassName: matchedClass?.name ?? null,
      suggestedProdiId: matchedClass?.study_program_id ?? matchedProdi?.id ?? null,
      totalRows,
      validRows,
      newStudentRows,
      existingWithNewWeeksRows,
      skippedExistingRows,
      afkRows,
      skippedBlackRows,
      duplicateRows,
      invalidRows,
      detectedWeeks: weekCols.map((w) => w.weekNumber),
    });
  }

  return {
    sheets,
    rows,
    detectedWeeks: Array.from(allDetectedWeeks).sort((a, b) => a - b),
    ignoredSheets,
  };
}

export async function buildStudentTemplateWorkbook(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const guide = wb.addWorksheet('Panduan Import');
  guide.columns = [
    { header: 'Aturan Import Excel AZRIL CLAS', key: 'rule', width: 42 },
    { header: 'Penjelasan', key: 'desc', width: 78 },
  ];
  guide.addRows([
    { rule: 'Multi-Sheet', desc: 'Setiap sheet mewakili satu Kelas (contoh: HES-1A, PJKR-1A).' },
    { rule: 'Warna Merah (AFK)', desc: 'Baris dengan fill merah otomatis ditandai badge AFK.' },
    { rule: 'Blok Hitam (Dilewati)', desc: 'Baris dengan fill hitam akan dilewati saat import.' },
    { rule: 'Warna Lain', desc: 'Warna selain merah/hitam tidak digunakan sebagai indikator AFK.' },
    {
      rule: 'Kolom Minggu Tanpa Batas',
      desc: 'Tambahkan kolom Minggu 1, Minggu 2, ..., Minggu 9, Minggu 10, dst (atau M1, M9, W10, Pertemuan 12) sesuai kebutuhan. Isi dengan H, I, S, atau A.',
    },
    {
      rule: 'Import Bertahap (Data Lama Tidak Ditimpa)',
      desc: 'Saat mengimpor ulang di minggu berikutnya, mahasiswa dan minggu absensi yang sudah tersimpan otomatis dilewati. Hanya mahasiswa baru dan minggu absensi baru yang diinput.',
    },
    {
      rule: 'Akun Mahasiswa',
      desc: 'Jika Username/Password dikosongkan, otomatis menggunakan NIM (segera ubah melalui Manajemen Akun jika perlu).',
    },
  ]);

  const template = wb.addWorksheet('Contoh Kelas');
  template.columns = [
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Lengkap', key: 'nama', width: 28 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Password Awal', key: 'password', width: 18 },
    { header: 'Angkatan', key: 'angkatan', width: 12 },
    { header: 'Semester', key: 'semester', width: 12 },
    { header: 'Minggu 1', key: 'm1', width: 11 },
    { header: 'Minggu 2', key: 'm2', width: 11 },
    { header: 'Minggu 3', key: 'm3', width: 11 },
    { header: 'Minggu 4', key: 'm4', width: 11 },
    { header: 'Minggu 5', key: 'm5', width: 11 },
    { header: 'Minggu 6', key: 'm6', width: 11 },
    { header: 'Minggu 7', key: 'm7', width: 11 },
    { header: 'Minggu 8', key: 'm8', width: 11 },
    { header: 'Minggu 9', key: 'm9', width: 11 },
    { header: 'Minggu 10', key: 'm10', width: 11 },
  ];
  template.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export interface ExportFilterParams {
  prodiId?: string;
  classId?: string;
  studentId?: string;
  fromDate?: string;
  toDate?: string;
}

export async function buildFullReportWorkbook(filters: ExportFilterParams): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'AZRIL CLAS';
  wb.created = new Date();

  const whereClauses: string[] = ['1=1'];
  const params: string[] = [];
  if (filters.prodiId) {
    whereClauses.push('s.study_program_id = ?');
    params.push(filters.prodiId);
  }
  if (filters.classId) {
    whereClauses.push('s.class_id = ?');
    params.push(filters.classId);
  }
  if (filters.studentId) {
    whereClauses.push('s.id = ?');
    params.push(filters.studentId);
  }
  const studentWhere = whereClauses.join(' AND ');

  const students = db
    .prepare(
      `SELECT s.*, u.username, u.email, u.is_active, sp.code AS prodi_code, sp.name AS prodi_name, c.name AS class_name
       FROM students s
       JOIN user_profiles u ON u.id = s.user_id
       JOIN study_programs sp ON sp.id = s.study_program_id
       JOIN classes c ON c.id = s.class_id
       WHERE ${studentWhere}
       ORDER BY s.total_xp DESC, s.full_name ASC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const settings = db.prepare(`SELECT * FROM academic_settings WHERE id = 1`).get() as Record<string, unknown>;

  // 1. Sheet Ringkasan
  const sRingkasan = wb.addWorksheet('Ringkasan');
  sRingkasan.columns = [
    { header: 'Metrik Akademik', key: 'metric', width: 34 },
    { header: 'Nilai', key: 'value', width: 30 },
  ];
  sRingkasan.getRow(1).font = { bold: true };
  const totalAssignments = (db.prepare(`SELECT COUNT(*) AS c FROM assignments WHERE is_active = 1`).get() as { c: number }).c;
  const totalSessions = (db.prepare(`SELECT COUNT(*) AS c FROM attendance_sessions`).get() as { c: number }).c;
  sRingkasan.addRows([
    { metric: 'Institusi', value: String(settings.institution_name) },
    { metric: 'Tahun Akademik & Semester', value: `${settings.active_academic_year} (${settings.active_semester})` },
    { metric: 'Waktu Ekspor (WIB)', value: formatWibDateTime(new Date().toISOString()) },
    { metric: 'Total Mahasiswa Terfilter', value: students.length },
    { metric: 'Mahasiswa Aktif (Non-AFK)', value: students.filter((s) => s.badge !== 'AFK').length },
    { metric: 'Mahasiswa AFK', value: students.filter((s) => s.badge === 'AFK').length },
    { metric: 'Total Tugas Aktif', value: totalAssignments },
    { metric: 'Total Sesi Absensi', value: totalSessions },
  ]);

  // 2. Sheet Mahasiswa
  const sMahasiswa = wb.addWorksheet('Mahasiswa');
  sMahasiswa.columns = [
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Lengkap', key: 'full_name', width: 28 },
    { header: 'Username', key: 'username', width: 18 },
    { header: 'Prodi', key: 'prodi', width: 14 },
    { header: 'Kelas', key: 'kelas', width: 16 },
    { header: 'Angkatan', key: 'cohort', width: 10 },
    { header: 'Semester', key: 'semester', width: 10 },
    { header: 'Badge', key: 'badge', width: 12 },
    { header: 'Status Akun', key: 'status', width: 14 },
    { header: 'Total XP', key: 'xp', width: 12 },
    { header: 'Streak', key: 'streak', width: 10 },
  ];
  sMahasiswa.getRow(1).font = { bold: true };
  for (const st of students) {
    sMahasiswa.addRow({
      nim: st.nim,
      full_name: st.full_name,
      username: st.username,
      prodi: st.prodi_code,
      kelas: st.class_name,
      cohort: st.cohort_year,
      semester: st.semester,
      badge: st.badge,
      status: Number(st.is_active) === 1 ? 'Aktif' : 'Nonaktif',
      xp: st.total_xp,
      streak: st.current_streak,
    });
  }

  // 3. Sheet Absensi
  const sAbsensi = wb.addWorksheet('Absensi');
  sAbsensi.columns = [
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Mahasiswa', key: 'name', width: 26 },
    { header: 'Kelas', key: 'kelas', width: 14 },
    { header: 'Sesi / Minggu', key: 'session', width: 28 },
    { header: 'Mode', key: 'mode', width: 12 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Metode', key: 'method', width: 16 },
    { header: 'XP', key: 'xp', width: 10 },
    { header: 'Waktu Catat (WIB)', key: 'time', width: 22 },
  ];
  sAbsensi.getRow(1).font = { bold: true };
  const attRows = db
    .prepare(
      `SELECT ar.*, s.nim, s.full_name, c.name AS class_name, ses.title AS session_title, ses.mode
       FROM attendance_records ar
       JOIN students s ON s.id = ar.student_id
       JOIN classes c ON c.id = s.class_id
       JOIN attendance_sessions ses ON ses.id = ar.session_id
       WHERE ${studentWhere}
       ORDER BY ar.recorded_at_utc DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;
  for (const r of attRows) {
    sAbsensi.addRow({
      nim: r.nim,
      name: r.full_name,
      kelas: r.class_name,
      session: r.session_title,
      mode: r.mode,
      status: r.status,
      method: r.method,
      xp: r.xp_awarded,
      time: formatWibDateTime(String(r.recorded_at_utc)),
    });
  }

  // 4. Sheet Pengumpulan Tugas
  const sTugas = wb.addWorksheet('Pengumpulan Tugas');
  sTugas.columns = [
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Mahasiswa', key: 'name', width: 26 },
    { header: 'Kelas', key: 'kelas', width: 14 },
    { header: 'Judul Tugas', key: 'title', width: 30 },
    { header: 'Waktu Kumpul (WIB)', key: 'time', width: 22 },
    { header: 'Terlambat', key: 'late', width: 12 },
    { header: 'Revisi Ke', key: 'rev', width: 10 },
    { header: 'Verifikasi', key: 'verified', width: 14 },
    { header: 'Nilai', key: 'score', width: 10 },
  ];
  sTugas.getRow(1).font = { bold: true };
  const subRows = db
    .prepare(
      `SELECT sub.*, s.nim, s.full_name, c.name AS class_name, a.title AS assignment_title, g.score
       FROM assignment_submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN classes c ON c.id = s.class_id
       JOIN assignments a ON a.id = sub.assignment_id
       LEFT JOIN grades g ON g.submission_id = sub.id
       WHERE ${studentWhere}
       ORDER BY sub.submitted_at_utc DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;
  for (const sub of subRows) {
    sTugas.addRow({
      nim: sub.nim,
      name: sub.full_name,
      kelas: sub.class_name,
      title: sub.assignment_title,
      time: formatWibDateTime(String(sub.submitted_at_utc)),
      late: Number(sub.is_late) === 1 ? 'Ya' : 'Tidak',
      rev: sub.revision_count,
      verified: Number(sub.is_verified) === 1 ? 'Terverifikasi' : 'Belum',
      score: sub.score !== null && sub.score !== undefined ? sub.score : '-',
    });
  }

  // 5. Sheet XP & Ranking
  const sRank = wb.addWorksheet('XP & Ranking');
  sRank.columns = [
    { header: 'Peringkat', key: 'rank', width: 12 },
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Lengkap', key: 'name', width: 28 },
    { header: 'Prodi', key: 'prodi', width: 12 },
    { header: 'Kelas', key: 'kelas', width: 14 },
    { header: 'Total XP', key: 'xp', width: 12 },
    { header: 'Streak Saat Ini', key: 'streak', width: 14 },
  ];
  sRank.getRow(1).font = { bold: true };
  const activeRanked = students.filter((s) => s.badge !== 'AFK');
  activeRanked.forEach((st, idx) => {
    sRank.addRow({
      rank: idx + 1,
      nim: st.nim,
      name: st.full_name,
      prodi: st.prodi_code,
      kelas: st.class_name,
      xp: st.total_xp,
      streak: st.current_streak,
    });
  });

  // 6. Sheet Riwayat XP
  const sXpHist = wb.addWorksheet('Riwayat XP');
  sXpHist.columns = [
    { header: 'Waktu (WIB)', key: 'time', width: 22 },
    { header: 'NIM', key: 'nim', width: 16 },
    { header: 'Nama Mahasiswa', key: 'name', width: 26 },
    { header: 'Sumber', key: 'source', width: 20 },
    { header: 'Jumlah XP', key: 'amount', width: 12 },
    { header: 'Keterangan', key: 'desc', width: 40 },
  ];
  sXpHist.getRow(1).font = { bold: true };
  const xpRows = db
    .prepare(
      `SELECT xt.*, s.nim, s.full_name
       FROM xp_transactions xt
       JOIN students s ON s.id = xt.student_id
       WHERE ${studentWhere}
       ORDER BY xt.created_at_utc DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;
  for (const x of xpRows) {
    sXpHist.addRow({
      time: formatWibDateTime(String(x.created_at_utc)),
      nim: x.nim,
      name: x.full_name,
      source: x.source_type,
      amount: x.amount,
      desc: x.description,
    });
  }

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

export function toCsvString(headers: string[], rows: Array<Array<unknown>>): string {
  const escape = (val: unknown) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}
