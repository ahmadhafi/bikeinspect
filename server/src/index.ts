import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { config, isDemoOcrMode } from './config.js';
import { getDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import followupRoutes from './routes/followups.js';
import inspectionRoutes from './routes/inspections.js';
import reportRoutes from './routes/reports.js';
import scanRoutes from './routes/scan.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
    })
  );
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  const appRouter = Router();

  // Perlindungan CSRF dasar untuk permintaan mutasi (NFR-07)
  appRouter.use('/api', (req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const xrw = req.headers['x-requested-with'];
      const contentType = req.headers['content-type'] || '';
      if (!xrw && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
        res.status(403).json({ error: 'Header keamanan tidak lengkap.' });
        return;
      }
    }
    next();
  });

  appRouter.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      app: 'Sistem Inspeksi Kendaraan',
      basePath: config.basePath || '/',
      ocrMode: isDemoOcrMode() ? 'Demo' : 'Produksi',
    });
  });

  appRouter.use('/api/auth', authRoutes);
  appRouter.use('/api/scan', scanRoutes);
  appRouter.use('/api', inspectionRoutes);
  appRouter.use('/api', followupRoutes);
  appRouter.use('/api/reports', reportRoutes);
  appRouter.use('/api', adminRoutes);

  // Layani build statis frontend bila tersedia (mode produksi / cPanel)
  const clientDist = path.resolve(__dirname, '../../client/dist');
  if (fs.existsSync(clientDist)) {
    appRouter.use(express.static(clientDist));
    appRouter.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) {
        next();
        return;
      }
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  // Mount pada basePath (mis. /bikeinspect) DAN '/' agar kompatibel dengan Passenger/cPanel
  if (config.basePath) {
    app.use(config.basePath, appRouter);
  }
  app.use('/', appRouter);

  return app;
}

export function startServer() {
  getDb();
  seedDatabase(false);
  const app = createApp();
  return app.listen(config.port, '0.0.0.0', () => {
    console.log(
      `[SIK Server] Berjalan di port ${config.port} (basePath: ${config.basePath || '/'}, OCR: ${
        isDemoOcrMode() ? 'Mode Demo' : 'Produksi'
      })`
    );
  });
}

if (process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js')) {
  startServer();
}
