import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authenticate, getClientIp, requireRoles } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { normalizeAndValidatePlate } from '../utils/plate.js';

const router = Router();

// ==================== P-10: ADMIN PENGGUNA ====================
router.get('/admin/users', authenticate, requireRoles('Admin'), (_req, res) => {
  const db = getDb();
  const items = db
    .prepare('SELECT id, username, nama, peran, aktif, dibuat_pada, diubah_pada FROM pengguna ORDER BY dibuat_pada DESC')
    .all();
  res.json({ items });
});

router.post('/admin/users', authenticate, requireRoles('Admin'), (req, res) => {
  const { username, password, nama, peran } = req.body || {};
  if (!username || !password || !nama || !['Petugas', 'PIC', 'Admin'].includes(peran)) {
    res.status(400).json({ error: 'Username, kata sandi, nama lengkap, dan peran yang valid wajib diisi.' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ error: 'Kata sandi minimal 8 karakter.' });
    return;
  }

  const db = getDb();
  const exists = db.prepare('SELECT id FROM pengguna WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (exists) {
    res.status(409).json({ error: 'Username sudah digunakan.' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO pengguna (id, username, password_hash, nama, peran, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  ).run(id, username.trim(), bcrypt.hashSync(password, 10), nama.trim(), peran, now, now);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'pengguna',
    idEntitas: id,
    aksi: 'TAMBAH_PENGGUNA',
    nilaiSesudah: { username: username.trim(), nama: nama.trim(), peran },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({ id, username: username.trim(), nama: nama.trim(), peran, aktif: 1 });
});

router.put('/admin/users/:id', authenticate, requireRoles('Admin'), (req, res) => {
  const { nama, peran, aktif, newPassword } = req.body || {};
  const db = getDb();
  const before = db
    .prepare('SELECT id, username, nama, peran, aktif FROM pengguna WHERE id = ?')
    .get(String(req.params.id)) as Record<string, unknown> | undefined;
  if (!before) {
    res.status(404).json({ error: 'Pengguna tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  const nextNama = typeof nama === 'string' && nama.trim() ? nama.trim() : String(before.nama);
  const nextPeran = ['Petugas', 'PIC', 'Admin'].includes(peran) ? peran : String(before.peran);
  const nextAktif = typeof aktif === 'boolean' ? (aktif ? 1 : 0) : Number(before.aktif);

  db.prepare('UPDATE pengguna SET nama = ?, peran = ?, aktif = ?, diubah_pada = ? WHERE id = ?').run(
    nextNama,
    nextPeran,
    nextAktif,
    now,
    String(req.params.id)
  );

  if (typeof newPassword === 'string' && newPassword.trim().length > 0) {
    if (newPassword.trim().length < 8) {
      res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter.' });
      return;
    }
    db.prepare('UPDATE pengguna SET password_hash = ? WHERE id = ?').run(
      bcrypt.hashSync(newPassword.trim(), 10),
      String(req.params.id)
    );
  }

  if (nextAktif === 0) {
    db.prepare('DELETE FROM sesi WHERE pengguna_id = ?').run(String(req.params.id));
  }

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'pengguna',
    idEntitas: String(req.params.id),
    aksi: 'UBAH_PENGGUNA',
    nilaiSebelum: before,
    nilaiSesudah: { nama: nextNama, peran: nextPeran, aktif: nextAktif, resetSandi: Boolean(newPassword) },
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true });
});

// ==================== P-11: ADMIN KARYAWAN & KENDARAAN ====================
router.get('/admin/employees', authenticate, requireRoles('Admin', 'PIC'), (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM karyawan ORDER BY nama ASC').all();
  res.json({ items });
});

router.post('/admin/employees', authenticate, requireRoles('Admin'), (req, res) => {
  const { nik, nama, departemen } = req.body || {};
  if (!nik || !nama || !departemen) {
    res.status(400).json({ error: 'NIK, nama karyawan, dan departemen wajib diisi.' });
    return;
  }
  const db = getDb();
  const exists = db.prepare('SELECT id FROM karyawan WHERE LOWER(nik) = LOWER(?)').get(String(nik).trim());
  if (exists) {
    res.status(409).json({ error: 'NIK sudah terdaftar.' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO karyawan (id, nik, nama, departemen, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  ).run(id, String(nik).trim(), String(nama).trim(), String(departemen).trim(), now, now);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'karyawan',
    idEntitas: id,
    aksi: 'TAMBAH_KARYAWAN',
    nilaiSesudah: { nik: String(nik).trim(), nama: String(nama).trim(), departemen: String(departemen).trim() },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({ id });
});

router.put('/admin/employees/:id', authenticate, requireRoles('Admin'), (req, res) => {
  const { nik, nama, departemen, aktif } = req.body || {};
  const db = getDb();
  const before = db.prepare('SELECT * FROM karyawan WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;
  if (!before) {
    res.status(404).json({ error: 'Karyawan tidak ditemukan.' });
    return;
  }

  const now = new Date().toISOString();
  const nextNik = typeof nik === 'string' && nik.trim() ? nik.trim() : String(before.nik);
  const nextNama = typeof nama === 'string' && nama.trim() ? nama.trim() : String(before.nama);
  const nextDept = typeof departemen === 'string' && departemen.trim() ? departemen.trim() : String(before.departemen);
  const nextAktif = typeof aktif === 'boolean' ? (aktif ? 1 : 0) : Number(before.aktif);

  db.prepare('UPDATE karyawan SET nik = ?, nama = ?, departemen = ?, aktif = ?, diubah_pada = ? WHERE id = ?').run(
    nextNik,
    nextNama,
    nextDept,
    nextAktif,
    now,
    String(req.params.id)
  );

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'karyawan',
    idEntitas: String(req.params.id),
    aksi: 'UBAH_KARYAWAN',
    nilaiSebelum: before,
    nilaiSesudah: { nik: nextNik, nama: nextNama, departemen: nextDept, aktif: nextAktif },
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true });
});

router.get('/admin/vehicles', authenticate, requireRoles('Admin', 'PIC'), (_req, res) => {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT k.*, kar.nama AS karyawan_nama, kar.nik AS karyawan_nik, kar.departemen AS karyawan_departemen
       FROM kendaraan k
       JOIN karyawan kar ON kar.id = k.karyawan_id
       ORDER BY k.dibuat_pada DESC`
    )
    .all();
  res.json({ items });
});

router.post('/admin/vehicles', authenticate, requireRoles('Admin'), (req, res) => {
  const { plat, merek, tipe, tahun, warna, karyawanId } = req.body || {};
  const norm = normalizeAndValidatePlate(typeof plat === 'string' ? plat : '');
  if (!norm.valid) {
    res.status(400).json({ error: norm.error || 'Format plat tidak valid.' });
    return;
  }
  if (!merek || !tipe || !tahun || !warna || !karyawanId) {
    res.status(400).json({ error: 'Semua kolom kendaraan dan pemilik wajib diisi.' });
    return;
  }

  const db = getDb();
  const emp = db.prepare('SELECT id FROM karyawan WHERE id = ?').get(karyawanId);
  if (!emp) {
    res.status(404).json({ error: 'Karyawan pemilik tidak ditemukan.' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO kendaraan (id, plat_normal, plat_tampil, merek, tipe, tahun, warna, karyawan_id, status_akses, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Aktif', 1, ?, ?)`
  ).run(id, norm.platNormal, norm.platTampil, merek.trim(), tipe.trim(), Number(tahun), warna.trim(), karyawanId, now, now);

  // Tandai permintaan pendaftaran kendaraan yg cocok sebagai Diproses
  db.prepare(
    `UPDATE permintaan_pendaftaran_kendaraan SET status = 'Diproses', diproses_pada = ?, diproses_oleh = ?
     WHERE plat_normal = ? AND status = 'Menunggu'`
  ).run(now, req.user!.id, norm.platNormal);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'kendaraan',
    idEntitas: id,
    aksi: 'TAMBAH_KENDARAAN',
    nilaiSesudah: { plat: norm.platTampil, merek, tipe, tahun, warna, karyawanId },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({ id, platTampil: norm.platTampil });
});

router.put('/admin/vehicles/:id', authenticate, requireRoles('Admin'), (req, res) => {
  const { plat, merek, tipe, tahun, warna, karyawanId, aktif } = req.body || {};
  const db = getDb();
  const before = db.prepare('SELECT * FROM kendaraan WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;
  if (!before) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
    return;
  }

  let platNormal = String(before.plat_normal);
  let platTampil = String(before.plat_tampil);
  if (typeof plat === 'string' && plat.trim()) {
    const norm = normalizeAndValidatePlate(plat);
    if (!norm.valid) {
      res.status(400).json({ error: norm.error || 'Format plat tidak valid.' });
      return;
    }
    platNormal = norm.platNormal;
    platTampil = norm.platTampil;
  }

  const now = new Date().toISOString();
  const nextMerek = merek?.trim() || String(before.merek);
  const nextTipe = tipe?.trim() || String(before.tipe);
  const nextTahun = tahun ? Number(tahun) : Number(before.tahun);
  const nextWarna = warna?.trim() || String(before.warna);
  const nextKaryawan = karyawanId || String(before.karyawan_id);
  const nextAktif = typeof aktif === 'boolean' ? (aktif ? 1 : 0) : Number(before.aktif);

  db.prepare(
    `UPDATE kendaraan
     SET plat_normal = ?, plat_tampil = ?, merek = ?, tipe = ?, tahun = ?, warna = ?, karyawan_id = ?, aktif = ?, diubah_pada = ?
     WHERE id = ?`
  ).run(platNormal, platTampil, nextMerek, nextTipe, nextTahun, nextWarna, nextKaryawan, nextAktif, now, String(req.params.id));

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'kendaraan',
    idEntitas: String(req.params.id),
    aksi: 'UBAH_KENDARAAN',
    nilaiSebelum: before,
    nilaiSesudah: { platTampil, merek: nextMerek, tipe: nextTipe, tahun: nextTahun, warna: nextWarna, aktif: nextAktif },
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true });
});

router.get('/admin/vehicle-requests', authenticate, requireRoles('Admin'), (_req, res) => {
  const db = getDb();
  const items = db
    .prepare(
      `SELECT r.*, p.nama AS pelapor_nama
       FROM permintaan_pendaftaran_kendaraan r
       JOIN pengguna p ON p.id = r.pelapor_id
       ORDER BY r.dibuat_pada DESC`
    )
    .all();
  res.json({ items });
});

// ==================== P-12: ADMIN PARAMETER PEMERIKSAAN ====================
router.get('/admin/parameters', authenticate, requireRoles('Admin', 'PIC', 'Petugas'), (_req, res) => {
  const db = getDb();
  const items = db.prepare('SELECT * FROM parameter_pemeriksaan ORDER BY urutan ASC, nama ASC').all();
  res.json({ items });
});

router.post('/admin/parameters', authenticate, requireRoles('Admin'), (req, res) => {
  const {
    kelompok,
    nama,
    deskripsi = '',
    wajib = true,
    jenisTemuan = 'Fisik',
    bolehTidakBerlaku = false,
    wajibFoto,
    acuanJenis = 'Tidak Ada',
    acuanTeks = '',
    urutan = 99,
  } = req.body || {};

  if (!['Administrasi', 'Kelengkapan', 'Kondisi Teknis', 'Pengendara'].includes(kelompok)) {
    res.status(400).json({ error: 'Kelompok parameter tidak valid.' });
    return;
  }
  if (!nama || !String(nama).trim()) {
    res.status(400).json({ error: 'Nama parameter wajib diisi.' });
    return;
  }

  const db = getDb();
  const id = uuidv4();
  const now = new Date().toISOString();
  const finalWajibFoto = typeof wajibFoto === 'boolean' ? (wajibFoto ? 1 : 0) : jenisTemuan === 'Fisik' ? 1 : 0;

  db.prepare(
    `INSERT INTO parameter_pemeriksaan
      (id, kelompok, nama, deskripsi, wajib, jenis_temuan, boleh_tidak_berlaku, wajib_foto, acuan_jenis, acuan_teks, urutan, versi, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
  ).run(
    id,
    kelompok,
    String(nama).trim(),
    String(deskripsi).trim(),
    wajib ? 1 : 0,
    jenisTemuan,
    bolehTidakBerlaku ? 1 : 0,
    finalWajibFoto,
    acuanJenis,
    String(acuanTeks).trim(),
    Number(urutan),
    now,
    now
  );

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'parameter_pemeriksaan',
    idEntitas: id,
    aksi: 'TAMBAH_PARAMETER',
    nilaiSesudah: { kelompok, nama, wajib, jenisTemuan, bolehTidakBerlaku, acuanJenis, acuanTeks },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({ id });
});

router.put('/admin/parameters/:id', authenticate, requireRoles('Admin'), (req, res) => {
  const db = getDb();
  const before = db.prepare('SELECT * FROM parameter_pemeriksaan WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;
  if (!before) {
    res.status(404).json({ error: 'Parameter pemeriksaan tidak ditemukan.' });
    return;
  }

  const body = req.body || {};
  const next = {
    kelompok: String(body.kelompok || before.kelompok),
    nama: String(body.nama?.trim() || before.nama),
    deskripsi: body.deskripsi !== undefined ? String(body.deskripsi).trim() : String(before.deskripsi),
    wajib: body.wajib !== undefined ? (body.wajib ? 1 : 0) : Number(before.wajib),
    jenis_temuan: String(body.jenisTemuan || before.jenis_temuan),
    boleh_tidak_berlaku: body.bolehTidakBerlaku !== undefined ? (body.bolehTidakBerlaku ? 1 : 0) : Number(before.boleh_tidak_berlaku),
    wajib_foto: body.wajibFoto !== undefined ? (body.wajibFoto ? 1 : 0) : Number(before.wajib_foto),
    acuan_jenis: String(body.acuanJenis || before.acuan_jenis),
    acuan_teks: body.acuanTeks !== undefined ? String(body.acuanTeks).trim() : String(before.acuan_teks),
    urutan: body.urutan !== undefined ? Number(body.urutan) : Number(before.urutan),
    aktif: body.aktif !== undefined ? (body.aktif ? 1 : 0) : Number(before.aktif),
    versi: Number(before.versi) + 1,
  };

  // Perubahan menaikkan versi; inspeksi lama tetap memakai snapshot (FR-ADM-04, AC-29)
  db.prepare(
    `UPDATE parameter_pemeriksaan
     SET kelompok = ?, nama = ?, deskripsi = ?, wajib = ?, jenis_temuan = ?,
         boleh_tidak_berlaku = ?, wajib_foto = ?, acuan_jenis = ?, acuan_teks = ?,
         urutan = ?, versi = ?, aktif = ?, diubah_pada = ?
     WHERE id = ?`
  ).run(
    next.kelompok,
    next.nama,
    next.deskripsi,
    next.wajib,
    next.jenis_temuan,
    next.boleh_tidak_berlaku,
    next.wajib_foto,
    next.acuan_jenis,
    next.acuan_teks,
    next.urutan,
    next.versi,
    next.aktif,
    new Date().toISOString(),
    String(req.params.id)
  );

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'parameter_pemeriksaan',
    idEntitas: String(req.params.id),
    aksi: 'UBAH_PARAMETER',
    nilaiSebelum: before,
    nilaiSesudah: next,
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true, versi: next.versi });
});

// ==================== P-13: LOG AUDIT (APPEND-ONLY) ====================
router.get('/audit-logs', authenticate, requireRoles('Admin', 'PIC'), (req, res) => {
  const db = getDb();
  const conds: string[] = ['1=1'];
  const params: (string | number)[] = [];

  if (req.user!.peran === 'PIC') {
    conds.push("entitas IN ('inspeksi', 'penangguhan_akses', 'kendaraan', 'bukti_foto', 'ekspor_log')");
  }
  if (typeof req.query.entitas === 'string' && req.query.entitas) {
    conds.push('entitas = ?');
    params.push(req.query.entitas);
  }
  if (typeof req.query.pelaku === 'string' && req.query.pelaku.trim()) {
    conds.push('LOWER(pelaku_nama) LIKE ?');
    params.push(`%${req.query.pelaku.trim().toLowerCase()}%`);
  }
  if (typeof req.query.tanggalMulai === 'string' && req.query.tanggalMulai) {
    conds.push('waktu >= ?');
    params.push(`${req.query.tanggalMulai}T00:00:00.000Z`);
  }
  if (typeof req.query.tanggalSelesai === 'string' && req.query.tanggalSelesai) {
    conds.push('waktu <= ?');
    params.push(`${req.query.tanggalSelesai}T23:59:59.999Z`);
  }

  const limit = Math.min(200, Math.max(10, Number(req.query.limit || 100)));
  const items = db
    .prepare(`SELECT * FROM audit_log WHERE ${conds.join(' AND ')} ORDER BY waktu DESC LIMIT ?`)
    .all(...params, limit);

  res.json({ items });
});

export default router;
