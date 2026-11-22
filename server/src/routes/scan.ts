import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authenticate, getClientIp, requireRoles } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { runPlateOcr } from '../services/ocr.js';
import { maskNikForRole, normalizeAndValidatePlate } from '../utils/plate.js';

const router = Router();

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.has(file.mimetype)) {
      cb(new Error('Berkas tidak didukung. Gunakan foto JPEG, PNG, atau WebP maksimal 8 MB.'));
      return;
    }
    cb(null, true);
  },
});

// Pembatasan laju OCR: maksimal 30 permintaan per pengguna per menit (PRD 12.2)
const ocrRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.user?.id || req.ip || 'anon',
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Batas permintaan OCR (30/menit) tercapai. Tunggu sebentar atau gunakan Input Manual.' },
});

router.post(
  '/ocr',
  authenticate,
  requireRoles('Petugas', 'PIC'),
  ocrRateLimiter,
  (req, res, next) => {
    uploadMemory.single('photo')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: 'Berkas tidak didukung atau terlalu besar (maksimal 8 MB, format JPEG/PNG/WebP).' });
        return;
      }
      next();
    });
  },
  async (req, res) => {
    const file = req.file;
    const demoScenario = typeof req.body?.demoScenario === 'string' ? req.body.demoScenario : undefined;

    if (!file && !demoScenario) {
      res.status(400).json({ error: 'Foto plat nomor wajib diunggah untuk pemindaian OCR.' });
      return;
    }

    const result = await runPlateOcr({
      buffer: file ? file.buffer : Buffer.alloc(0),
      mimeType: file ? file.mimetype : 'image/jpeg',
      originalName: file ? file.originalname : 'demo.jpg',
      demoScenario,
    });

    // Foto scan tidak disimpan setelah OCR selesai (PRD 12.2 / FR-IDN-13)
    const ocrId = uuidv4();
    const db = getDb();
    db.prepare(
      `INSERT INTO ocr_percobaan (id, pengguna_id, mode, plat_mentah, keyakinan, status, dibuat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      ocrId,
      req.user!.id,
      result.mode,
      result.platMentah,
      result.keyakinan,
      result.status,
      new Date().toISOString()
    );

    res.json({
      ocrId,
      ...result,
    });
  }
);

router.post('/confirm-plate', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const { plate, ocrId } = req.body || {};
  const norm = normalizeAndValidatePlate(typeof plate === 'string' ? plate : '');

  if (!norm.valid) {
    res.status(400).json({
      error: norm.error || 'Format plat tidak valid. Periksa huruf dan angka.',
      formatValid: false,
    });
    return;
  }

  const db = getDb();
  if (ocrId && typeof ocrId === 'string') {
    db.prepare('UPDATE ocr_percobaan SET plat_terkonfirmasi = ? WHERE id = ? AND pengguna_id = ?').run(
      norm.platTampil,
      ocrId,
      req.user!.id
    );
  }

  const matches = db
    .prepare(
      `SELECT
         k.id, k.plat_normal, k.plat_tampil, k.merek, k.tipe, k.tahun, k.warna, k.status_akses,
         kar.id AS karyawan_id, kar.nama AS karyawan_nama, kar.nik AS karyawan_nik, kar.departemen AS karyawan_departemen,
         pa.id AS penangguhan_id, pa.alasan AS penangguhan_alasan, pa.berlaku_efektif_pada AS penangguhan_efektif
       FROM kendaraan k
       JOIN karyawan kar ON kar.id = k.karyawan_id
       LEFT JOIN penangguhan_akses pa ON pa.kendaraan_id = k.id AND pa.status = 'Aktif'
       WHERE UPPER(REPLACE(k.plat_normal, ' ', '')) = ? AND k.aktif = 1`
    )
    .all(norm.platNormal) as Array<Record<string, unknown>>;

  const formatted = matches.map((m) => ({
    id: m.id,
    platNormal: m.plat_normal,
    platTampil: m.plat_tampil,
    merek: m.merek,
    tipe: m.tipe,
    tahun: m.tahun,
    warna: m.warna,
    statusAkses: m.status_akses,
    karyawan: {
      id: m.karyawan_id,
      nama: m.karyawan_nama,
      nik: maskNikForRole(String(m.karyawan_nik), req.user!.peran),
      departemen: m.karyawan_departemen,
    },
    penangguhanAktif: m.penangguhan_id
      ? {
          id: m.penangguhan_id,
          alasan: m.penangguhan_alasan,
          berlakuEfektifPada: m.penangguhan_efektif,
        }
      : null,
  }));

  if (formatted.length === 0) {
    res.json({
      matchStatus: 'unregistered',
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      vehicles: [],
      pesan: 'Kendaraan Belum Terdaftar di database internal. Petugas tidak dapat membuat inspeksi untuk kendaraan yang belum terdaftar.',
    });
    return;
  }

  if (formatted.length > 1) {
    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'kendaraan',
      idEntitas: norm.platNormal,
      aksi: 'KECOCOKAN_PLAT_GANDA',
      nilaiSesudah: { plat: norm.platTampil, jumlah: formatted.length },
      alamatIp: getClientIp(req),
    });
    res.json({
      matchStatus: 'multiple',
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      vehicles: formatted,
      pesan: 'Ditemukan lebih dari satu kendaraan aktif dengan plat yang sama. Pilih kendaraan sesuai pemilik dan fisik.',
    });
    return;
  }

  res.json({
    matchStatus: 'matched',
    platNormal: norm.platNormal,
    platTampil: norm.platTampil,
    vehicles: formatted,
    vehicle: formatted[0],
  });
});

router.post('/report-unregistered', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const { plate, catatan } = req.body || {};
  const norm = normalizeAndValidatePlate(typeof plate === 'string' ? plate : '');
  if (!norm.valid) {
    res.status(400).json({ error: norm.error || 'Format plat tidak valid.' });
    return;
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO permintaan_pendaftaran_kendaraan (id, plat_normal, plat_tampil, catatan, pelapor_id, status, dibuat_pada)
     VALUES (?, ?, ?, ?, ?, 'Menunggu', ?)`
  ).run(id, norm.platNormal, norm.platTampil, typeof catatan === 'string' ? catatan.trim() : '', req.user!.id, now);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'permintaan_pendaftaran_kendaraan',
    idEntitas: id,
    aksi: 'LAPOR_KENDARAAN_BELUM_TERDAFTAR',
    nilaiSesudah: { plat: norm.platTampil, catatan },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({
    id,
    platTampil: norm.platTampil,
    pesan: 'Laporan kendaraan belum terdaftar berhasil dikirim ke Admin.',
  });
});

// Pendaftaran cepat kendaraan & pemilik langsung saat inspeksi
router.post('/quick-register', authenticate, requireRoles('Petugas', 'PIC', 'Admin'), (req, res) => {
  const { plate, namaKaryawan, nik, departemen, merek, tipe, tahun, warna } = req.body || {};
  const norm = normalizeAndValidatePlate(typeof plate === 'string' ? plate : '');
  if (!norm.valid) {
    res.status(400).json({ error: norm.error || 'Format plat tidak valid.' });
    return;
  }
  if (!namaKaryawan || !String(namaKaryawan).trim() || !merek || !tipe || !warna) {
    res.status(400).json({ error: 'Nama pemilik, merek, tipe, dan warna kendaraan wajib diisi.' });
    return;
  }

  const db = getDb();
  const now = new Date().toISOString();
  const cleanNik = String(nik || '').trim() || `NIK-${Date.now().toString().slice(-6)}`;
  const cleanDept = String(departemen || '').trim() || '-';

  let emp = db.prepare('SELECT * FROM karyawan WHERE LOWER(nik) = LOWER(?)').get(cleanNik) as
    | { id: string; nik: string; nama: string; departemen: string }
    | undefined;

  if (!emp) {
    const empId = uuidv4();
    db.prepare(
      `INSERT INTO karyawan (id, nik, nama, departemen, aktif, dibuat_pada, diubah_pada)
       VALUES (?, ?, ?, ?, 1, ?, ?)`
    ).run(empId, cleanNik, String(namaKaryawan).trim(), cleanDept, now, now);
    emp = { id: empId, nik: cleanNik, nama: String(namaKaryawan).trim(), departemen: cleanDept };
  }

  const vehId = uuidv4();
  const vehYear = Number(tahun) || new Date().getFullYear();
  db.prepare(
    `INSERT INTO kendaraan (id, plat_normal, plat_tampil, merek, tipe, tahun, warna, karyawan_id, status_akses, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Aktif', 1, ?, ?)`
  ).run(vehId, norm.platNormal, norm.platTampil, String(merek).trim(), String(tipe).trim(), vehYear, String(warna).trim(), emp.id, now, now);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'kendaraan',
    idEntitas: vehId,
    aksi: 'DAFTAR_CEPAT_SAAT_INSPEKSI',
    nilaiSesudah: { plat: norm.platTampil, pemilik: emp.nama, merek, tipe, tahun: vehYear, warna },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({
    vehicle: {
      id: vehId,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      merek: String(merek).trim(),
      tipe: String(tipe).trim(),
      tahun: vehYear,
      warna: String(warna).trim(),
      statusAkses: 'Aktif',
      karyawan: emp,
      penangguhanAktif: null,
    },
  });
});

export default router;
