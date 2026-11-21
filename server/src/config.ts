import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '../..');

// Muat file .env secara otomatis bila ada (Node.js 22+ built-in)
const envFilePath = path.resolve(rootDir, '.env');
if (fs.existsSync(envFilePath) && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile(envFilePath);
  } catch {
    // abaikan bila sudah dimuat oleh cPanel environment variables
  }
}

function normalizeBasePath(raw: string | undefined): string {
  if (!raw || raw === '/') return '';
  return '/' + raw.replace(/^\/+|\/+$/g, '');
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  // Mode cepat tanpa login: cukup isi Nama Pemeriksa di bagian atas aplikasi
  disableAuth: process.env.DISABLE_AUTH !== 'false',
  basePath: normalizeBasePath(process.env.APP_BASE_PATH || process.env.PASSENGER_BASE_URI),
  appBaseUrl: (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  sessionSecret: process.env.SESSION_SECRET || 'dev-sik-session-secret-ganti-di-produksi-32chars',
  signedUrlSecret: process.env.SIGNED_URL_SECRET || 'dev-sik-signed-url-secret-ganti-di-produksi-32chars',
  sessionTimeoutMinutes: Number(process.env.SESSION_TIMEOUT_MINUTES || 30),
  signedUrlTtlSeconds: Number(process.env.SIGNED_URL_TTL_SECONDS || 300),
  dbPath: process.env.DB_PATH
    ? path.resolve(rootDir, process.env.DB_PATH)
    : path.resolve(rootDir, 'data/inspeksi.db'),
  uploadDir: process.env.UPLOAD_DIR
    ? path.resolve(rootDir, process.env.UPLOAD_DIR)
    : path.resolve(rootDir, 'data/uploads'),
  migrationsDir: path.resolve(__dirname, '../migrations'),
  ocr: {
    provider: (process.env.OCR_PROVIDER || 'demo').toLowerCase() as 'demo' | 'http',
    apiUrl: process.env.OCR_API_URL || '',
    apiKey: process.env.OCR_API_KEY || '',
    timeoutMs: Number(process.env.OCR_TIMEOUT_MS || 8000),
    confidenceThreshold: Number(process.env.OCR_CONFIDENCE_THRESHOLD || 0.85),
  },
};

export const isDemoOcrMode = () =>
  config.ocr.provider !== 'http' || !config.ocr.apiUrl || !config.ocr.apiKey;
