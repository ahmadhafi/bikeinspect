import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import { recordAudit } from '../services/audit.js';

export type UserRole = 'Petugas' | 'PIC' | 'Admin';

export interface AuthUser {
  id: string;
  username: string;
  nama: string;
  peran: UserRole;
  aktif: number;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
    }
  }
}

export const SESSION_COOKIE_NAME = 'sik_session';

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'Sesi tidak valid atau telah berakhir. Silakan masuk kembali.' });
    return;
  }

  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db
    .prepare(
      `SELECT s.id as session_id, s.kadaluarsa_pada, s.terakhir_aktif_pada,
              p.id, p.username, p.nama, p.peran, p.aktif
       FROM sesi s
       JOIN pengguna p ON p.id = s.pengguna_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash) as
    | {
        session_id: string;
        kadaluarsa_pada: string;
        terakhir_aktif_pada: string;
        id: string;
        username: string;
        nama: string;
        peran: UserRole;
        aktif: number;
      }
    | undefined;

  if (!row) {
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(401).json({ error: 'Sesi tidak ditemukan. Silakan masuk kembali.' });
    return;
  }

  const now = Date.now();
  const lastActive = new Date(row.terakhir_aktif_pada).getTime();
  const expiresAt = new Date(row.kadaluarsa_pada).getTime();
  const inactivityLimitMs = config.sessionTimeoutMinutes * 60 * 1000;

  if (now > expiresAt || now - lastActive > inactivityLimitMs) {
    db.prepare('DELETE FROM sesi WHERE id = ?').run(row.session_id);
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(401).json({ error: 'Sesi berakhir karena tidak aktif. Draf lokal Anda tetap tersimpan; silakan masuk kembali.' });
    return;
  }

  if (!row.aktif) {
    db.prepare('DELETE FROM sesi WHERE id = ?').run(row.session_id);
    res.clearCookie(SESSION_COOKIE_NAME);
    res.status(403).json({ error: 'Akun Anda telah dinonaktifkan.' });
    return;
  }

  // Perbarui waktu aktivitas terakhir (sliding timeout 30 menit)
  db.prepare('UPDATE sesi SET terakhir_aktif_pada = ? WHERE id = ?').run(
    new Date().toISOString(),
    row.session_id
  );

  req.user = {
    id: row.id,
    username: row.username,
    nama: row.nama,
    peran: row.peran,
    aktif: row.aktif,
  };
  req.sessionId = row.session_id;
  next();
}

export function requireRoles(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: 'Autentikasi diperlukan.' });
      return;
    }
    if (!allowed.includes(req.user.peran)) {
      recordAudit({
        pelakuId: req.user.id,
        pelakuNama: req.user.nama,
        entitas: 'akses',
        idEntitas: req.originalUrl,
        aksi: 'AKSES_DITOLAK_403',
        nilaiSesudah: { peran: req.user.peran, metode: req.method, path: req.originalUrl, diizinkan: allowed },
        alamatIp: getClientIp(req),
      });
      res.status(403).json({ error: 'Anda tidak memiliki hak akses untuk tindakan ini.' });
      return;
    }
    next();
  };
}

/**
 * Tautan bertanda tangan berumur pendek untuk foto bukti privat (NFR-10, AC-27).
 */
export function createSignedEvidenceParams(evidenceId: string, userId: string): { token: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + config.signedUrlTtlSeconds;
  const payload = `${evidenceId}:${userId}:${exp}`;
  const token = crypto.createHmac('sha256', config.signedUrlSecret).update(payload).digest('hex');
  return { token, exp };
}

export function verifySignedEvidenceParams(
  evidenceId: string,
  userId: string,
  token: string,
  exp: number
): boolean {
  if (!token || !exp || Number.isNaN(exp)) return false;
  if (Math.floor(Date.now() / 1000) > exp) return false;
  const payload = `${evidenceId}:${userId}:${exp}`;
  const expected = crypto.createHmac('sha256', config.signedUrlSecret).update(payload).digest('hex');
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function buildEvidenceSignedUrl(evidenceId: string, userId: string): string {
  const { token, exp } = createSignedEvidenceParams(evidenceId, userId);
  return `${config.basePath}/api/evidence/${evidenceId}/file?token=${token}&exp=${exp}`;
}
