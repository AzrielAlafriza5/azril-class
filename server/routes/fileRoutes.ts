import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { requireAdmin, requireAuth, type AuthenticatedRequest } from '../auth.ts';
import { db, UPLOADS_DIR } from '../db/database.ts';
import { buildStudentTemplateWorkbook } from '../services/excelService.ts';

export const fileRouter = Router();

const ALLOWED_BUCKETS = new Set([
  'assignment-attachments',
  'assignment-submissions',
  'other-academic-files',
]);

fileRouter.get('/template-excel', requireAdmin, async (_req, res) => {
  const buf = await buildStudentTemplateWorkbook();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="AZRIL_CLAS_Template_Import_Mahasiswa.xlsx"');
  res.send(buf);
});

fileRouter.get('/download/:bucket/:filename', requireAuth, (req: AuthenticatedRequest, res) => {
  const { bucket, filename } = req.params;
  if (!ALLOWED_BUCKETS.has(bucket)) {
    res.status(400).json({ error: 'Bucket tidak valid.' });
    return;
  }

  const safeName = path.basename(filename);
  const bucketDir = path.resolve(UPLOADS_DIR, bucket);
  const resolved = path.resolve(bucketDir, safeName);
  if (!resolved.startsWith(bucketDir + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'File tidak ditemukan.' });
    return;
  }

  const storageRelPath = `${bucket}/${safeName}`;

  if (req.authUser?.role === 'MAHASISWA') {
    if (bucket === 'assignment-submissions') {
      const sub = db
        .prepare(`SELECT student_id FROM assignment_submissions WHERE storage_path = ?`)
        .get(storageRelPath) as { student_id: string } | undefined;
      const rev = db
        .prepare(
          `SELECT s.student_id FROM submission_revisions sr
           JOIN assignment_submissions s ON s.id = sr.submission_id
           WHERE sr.storage_path = ?`
        )
        .get(storageRelPath) as { student_id: string } | undefined;
      const ownerId = sub?.student_id ?? rev?.student_id;
      if (ownerId !== req.authUser.studentId) {
        res.status(403).json({ error: 'Anda tidak memiliki akses ke file pengumpulan mahasiswa lain.' });
        return;
      }
    } else if (bucket === 'assignment-attachments') {
      const attach = db
        .prepare(
          `SELECT 1 FROM assignment_attachments aa
           JOIN assignment_targets t ON t.assignment_id = aa.assignment_id
           WHERE aa.storage_path = ?
             AND ((t.target_type = 'CLASS' AND t.target_id = ?) OR (t.target_type = 'PRODI' AND t.target_id = ?))
           LIMIT 1`
        )
        .get(storageRelPath, req.authUser.classId ?? '', req.authUser.studyProgramId ?? '');
      if (!attach) {
        res.status(403).json({ error: 'Lampiran tugas ini bukan untuk kelas/prodi Anda.' });
        return;
      }
    }
  }

  res.download(resolved);
});
