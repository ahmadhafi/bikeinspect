import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { config, isDemoOcrMode } from '../config.js';
import { getDb } from '../db/database.js';
import {
  SESSION_COOKIE_NAME,
  authenticate,
  getClientIp,
  hashToken,
} from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak percobaan masuk. Coba lagi beberapa menit lagi.' },
});

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    res.status(400).json({ error: 'Nama pengguna dan kata sandi wajib diisi.' });
    return;
  }

  const db = getDb();
  const user = db
    .prepare('SELECT id, username, password_hash, nama, peran, aktif FROM pengguna WHERE LOWER(username) = LOWER(?)')
    .get(username.trim()) as
    | {
        id: string;
        username: string;
        password_hash: string;
        nama: string;
        peran: 'Petugas' | 'PIC' | 'Admin';
        aktif: number;
      }
    | undefined;

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    res.status(401).json({ error: 'Nama pengguna atau kata sandi tidak sesuai.' });
    return;
  }

  if (!user.aktif) {
    res.status(403).json({ error: 'Akun ini sedang nonaktif. Hubungi Admin.' });
    return;
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000); // maks 12 jam absolut, 30 mnt tidak aktif
  const sessionId = uuidv4();

  db.prepare(
    `INSERT INTO sesi (id, pengguna_id, token_hash, kadaluarsa_pada, terakhir_aktif_pada, alamat_ip, dibuat_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(sessionId, user.id, tokenHash, expiresAt.toISOString(), now.toISOString(), getClientIp(req), now.toISOString());

  recordAudit({
    pelakuId: user.id,
    pelakuNama: user.nama,
    entitas: 'pengguna',
    idEntitas: user.id,
    aksi: 'MASUK_SISTEM',
    nilaiSesudah: { username: user.username, peran: user.peran },
    alamatIp: getClientIp(req),
  });

  res.cookie(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      nama: user.nama,
      peran: user.peran,
    },
    ocrMode: isDemoOcrMode() ? 'Demo' : 'Produksi',
  });
});

router.post('/logout', authenticate, (req, res) => {
  const db = getDb();
  if (req.sessionId) {
    db.prepare('DELETE FROM sesi WHERE id = ?').run(req.sessionId);
  }
  if (req.user) {
    recordAudit({
      pelakuId: req.user.id,
      pelakuNama: req.user.nama,
      entitas: 'pengguna',
      idEntitas: req.user.id,
      aksi: 'KELUAR_SISTEM',
      alamatIp: getClientIp(req),
    });
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', authenticate, (req, res) => {
  res.json({
    user: {
      id: req.user!.id,
      username: req.user!.username,
      nama: req.user!.nama,
      peran: req.user!.peran,
    },
    ocrMode: isDemoOcrMode() ? 'Demo' : 'Produksi',
    disableAuth: config.disableAuth,
  });
});

router.post('/change-password', authenticate, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || typeof newPassword !== 'string') {
    res.status(400).json({ error: 'Kata sandi saat ini dan kata sandi baru wajib diisi.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter.' });
    return;
  }

  const db = getDb();
  const row = db
    .prepare('SELECT password_hash FROM pengguna WHERE id = ?')
    .get(req.user!.id) as { password_hash: string } | undefined;

  if (!row || !bcrypt.compareSync(currentPassword, row.password_hash)) {
    res.status(400).json({ error: 'Kata sandi saat ini tidak sesuai.' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE pengguna SET password_hash = ?, diubah_pada = ? WHERE id = ?').run(
    newHash,
    new Date().toISOString(),
    req.user!.id
  );

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'pengguna',
    idEntitas: req.user!.id,
    aksi: 'GANTI_KATA_SANDI',
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true, pesan: 'Kata sandi berhasil diperbarui.' });
});

export default router;
