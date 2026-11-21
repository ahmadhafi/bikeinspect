import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
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

/**
 * Mengambil atau membuat pengguna untuk mode cepat tanpa login berdasarkan Nama Pemeriksa.
 */
function resolveQuickInspector(rawName: string | undefined): AuthUser {
  const db = getDb();
  const cleanName = (rawName || '').trim().slice(0, 80) || 'Petugas Lapangan';
  const slug = cleanName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '') || 'petugas_lapangan';
  const username = `insp_${slug}`;

  const existing = db
    .prepare('SELECT id, username, nama, peran, aktif FROM pengguna WHERE username = ?')
    .get(username) as AuthUser | undefined;

  if (existing) {
    if (existing.nama !== cleanName) {
      db.prepare('UPDATE pengguna SET nama = ?, diubah_pada = ? WHERE id = ?').run(
        cleanName,
        new Date().toISOString(),
        existing.id
      );
      existing.nama = cleanName;
    }
    return existing;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  const hash = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 6);
  db.prepare(
    `INSERT INTO pengguna (id, username, password_hash, nama, peran, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, 'PIC', 1, ?, ?)`
  ).run(id, username, hash, cleanName, now, now);

  return { id, username, nama: cleanName, peran: 'PIC', aktif: 1 };
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (config.disableAuth) {
    const headerName =
      typeof req.headers['x-inspector-name'] === 'string'
        ? decodeURIComponent(req.headers['x-inspector-name'])
        : undefined;
    req.user = resolveQuickInspector(headerName);
    next();
    return;
  }

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
    if (config.disableAuth) {
      next();
      return;
    }
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
  const scope = config.disableAuth ? 'open' : userId;
  const payload = `${evidenceId}:${scope}:${exp}`;
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
  const scope = config.disableAuth ? 'open' : userId;
  const payload = `${evidenceId}:${scope}:${exp}`;
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
