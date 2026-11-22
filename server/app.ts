import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { initDatabase } from './db/database.ts';
import { syncEnvBootstrapAdminIfNeeded } from './auth.ts';
import { authRouter } from './routes/authRoutes.ts';
import { adminRouter } from './routes/adminRoutes.ts';
import { studentRouter } from './routes/studentRoutes.ts';
import { fileRouter } from './routes/fileRoutes.ts';

let cachedApp: express.Express | null = null;

export function createApiApp(): express.Express {
  if (cachedApp) return cachedApp;

  initDatabase();
  syncEnvBootstrapAdminIfNeeded();

  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/student', studentRouter);
  app.use('/api/files', fileRouter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', app: 'AZRIL CLAS', timestamp: new Date().toISOString() });
  });

  app.use('/api', (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const message = err instanceof Error ? err.message : 'Terjadi kesalahan pada server.';
    res.status(500).json({ error: message });
  });

  cachedApp = app;
  return app;
}
