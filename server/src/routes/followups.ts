import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb, withTransaction } from '../db/database.js';
import { authenticate, getClientIp, requireRoles } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';

const router = Router();

// Catat Teguran Manual oleh PIC — TIDAK mengirim email (FR-FUP-01, FR-FUP-02, BR-02, AC-21)
router.post('/inspections/:id/teguran-manual', authenticate, requireRoles('PIC'), (req, res) => {
  const { dikirimPada, saluran, catatan } = req.body || {};
  if (!dikirimPada || !catatan || typeof catatan !== 'string' || !catatan.trim()) {
    res.status(400).json({ error: 'Waktu pengiriman teguran manual dan catatan wajib diisi.' });
    return;
  }

  const db = getDb();
  const insp = db
    .prepare("SELECT * FROM inspeksi WHERE id = ? AND status = 'Final'")
    .get(String(req.params.id)) as Record<string, unknown> | undefined;

  if (!insp) {
    res.status(404).json({ error: 'Inspeksi final tidak ditemukan.' });
    return;
  }
  if (insp.hasil !== 'Ada Temuan') {
    res.status(400).json({ error: 'Teguran manual hanya dapat dicatat untuk inspeksi yang memiliki temuan.' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO teguran_manual (id, inspeksi_id, dikirim_pada, saluran, catatan, dicatat_oleh, dicatat_pada)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(id, String(req.params.id), dikirimPada, saluran?.trim() || 'Email Manual', catatan.trim(), req.user!.id, now);

    // Transisi status tindak lanjut: Menunggu Tindak Lanjut PIC -> Dalam Proses (PRD 10.2.c)
    if (insp.status_tindak_lanjut === 'Menunggu Tindak Lanjut PIC') {
      db.prepare("UPDATE inspeksi SET status_tindak_lanjut = 'Dalam Proses', diubah_pada = ? WHERE id = ?").run(
        now,
        String(req.params.id)
      );
    }

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'inspeksi',
      idEntitas: String(req.params.id),
      aksi: 'CATAT_TEGURAN_MANUAL',
      nilaiSesudah: { teguranId: id, dikirimPada, saluran: saluran || 'Email Manual', catatan: catatan.trim() },
      alamatIp: getClientIp(req),
    });
  });

  res.status(201).json({
    id,
    pesan: 'Teguran manual berhasil dicatat. Aplikasi tidak mengirim email otomatis.',
  });
});

// Tambah Addendum (Catatan Koreksi) oleh PIC pada Inspeksi Final (FR-INS-17, BR-14)
router.post('/inspections/:id/addendum', authenticate, requireRoles('PIC'), (req, res) => {
  const { catatan } = req.body || {};
  if (!catatan || typeof catatan !== 'string' || !catatan.trim()) {
    res.status(400).json({ error: 'Catatan koreksi (addendum) wajib diisi.' });
    return;
  }

  const db = getDb();
  const insp = db
    .prepare("SELECT id, status FROM inspeksi WHERE id = ? AND status = 'Final'")
    .get(String(req.params.id)) as Record<string, unknown> | undefined;
  if (!insp) {
    res.status(404).json({ error: 'Inspeksi final tidak ditemukan.' });
    return;
  }

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO addendum_inspeksi (id, inspeksi_id, catatan, dibuat_oleh, dibuat_pada)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, String(req.params.id), catatan.trim(), req.user!.id, now);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'inspeksi',
    idEntitas: String(req.params.id),
    aksi: 'TAMBAH_ADDENDUM',
    nilaiSesudah: { addendumId: id, catatan: catatan.trim() },
    alamatIp: getClientIp(req),
  });

  res.status(201).json({ id, dibuatPada: now, pesan: 'Catatan koreksi (addendum) berhasil ditambahkan.' });
});

// Ubah Status Tindak Lanjut oleh PIC sesuai PRD 10.2.c (FR-FUP-10)
router.patch('/inspections/:id/status-tindak-lanjut', authenticate, requireRoles('PIC'), (req, res) => {
  const { statusBaru, catatan } = req.body || {};
  const db = getDb();
  const insp = db
    .prepare("SELECT * FROM inspeksi WHERE id = ? AND status = 'Final'")
    .get(String(req.params.id)) as Record<string, unknown> | undefined;

  if (!insp) {
    res.status(404).json({ error: 'Inspeksi final tidak ditemukan.' });
    return;
  }

  const current = String(insp.status_tindak_lanjut);
  const allowedTransitions: Record<string, string[]> = {
    'Menunggu Tindak Lanjut PIC': ['Dalam Proses'],
    'Dalam Proses': ['Menunggu Inspeksi Ulang'],
    'Menunggu Inspeksi Ulang': ['Dalam Proses'],
  };

  if (!allowedTransitions[current]?.includes(statusBaru)) {
    res.status(400).json({
      error: `Transisi status tindak lanjut dari "${current}" ke "${statusBaru}" tidak diizinkan. Status "Selesai" hanya dicapai melalui inspeksi ulang final dan pemulihan akses.`,
    });
    return;
  }

  if (!catatan || typeof catatan !== 'string' || !catatan.trim()) {
    res.status(400).json({ error: 'Catatan wajib diisi saat mengubah status tindak lanjut.' });
    return;
  }

  const now = new Date().toISOString();
  withTransaction(db, () => {
    db.prepare('UPDATE inspeksi SET status_tindak_lanjut = ?, diubah_pada = ? WHERE id = ?').run(
      statusBaru,
      now,
      String(req.params.id)
    );
    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'inspeksi',
      idEntitas: String(req.params.id),
      aksi: 'UBAH_STATUS_TINDAK_LANJUT',
      nilaiSebelum: { statusTindakLanjut: current },
      nilaiSesudah: { statusTindakLanjut: statusBaru, catatan: catatan.trim() },
      alamatIp: getClientIp(req),
    });
  });

  res.json({ ok: true, statusTindakLanjut: statusBaru });
});

// Daftar Penangguhan Akses Kendaraan
router.get('/suspensions', authenticate, requireRoles('PIC', 'Admin'), (req, res) => {
  const db = getDb();
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : '';
  const where = statusFilter ? 'WHERE pa.status = ?' : '';
  const params = statusFilter ? [statusFilter] : [];

  const rows = db
    .prepare(
      `SELECT pa.*, k.plat_tampil, k.merek, k.tipe, kar.nama AS karyawan_nama, kar.departemen,
              p1.nama AS dicatat_oleh_nama, p2.nama AS dipulihkan_oleh_nama
       FROM penangguhan_akses pa
       JOIN kendaraan k ON k.id = pa.kendaraan_id
       JOIN karyawan kar ON kar.id = k.karyawan_id
       JOIN pengguna p1 ON p1.id = pa.dicatat_oleh
       LEFT JOIN pengguna p2 ON p2.id = pa.dipulihkan_oleh
       ${where}
       ORDER BY pa.dicatat_pada DESC`
    )
    .all(...params);

  res.json({ items: rows });
});

// Catat Penangguhan Akses Kendaraan oleh PIC (FR-FUP-03, FR-FUP-04, BR-09, BR-10, BR-11, BR-17, AC-22)
router.post('/suspensions', authenticate, requireRoles('PIC'), (req, res) => {
  const { kendaraanId, alasan, berlakuEfektifPada, temuanIds } = req.body || {};

  if (!kendaraanId || !alasan || !String(alasan).trim() || !berlakuEfektifPada) {
    res.status(400).json({ error: 'Kendaraan, alasan penangguhan, dan waktu efektif wajib diisi.' });
    return;
  }
  if (!Array.isArray(temuanIds) || temuanIds.length === 0) {
    res.status(400).json({ error: 'Minimal satu temuan penyebab yang masih terbuka wajib dipilih.' });
    return;
  }

  const db = getDb();
  const vehicle = db.prepare('SELECT * FROM kendaraan WHERE id = ?').get(kendaraanId) as
    | Record<string, unknown>
    | undefined;
  if (!vehicle) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan.' });
    return;
  }

  // BR-11: Satu kendaraan hanya boleh memiliki satu penangguhan aktif
  const active = db
    .prepare("SELECT id FROM penangguhan_akses WHERE kendaraan_id = ? AND status = 'Aktif'")
    .get(kendaraanId);
  if (active) {
    res.status(409).json({
      error: 'Kendaraan ini sudah memiliki penangguhan akses yang aktif.',
    });
    return;
  }

  // Validasi semua temuan penyebab milik kendaraan ini, masih Terbuka, dan BUKAN Mode Demo (BR-17)
  const placeholders = temuanIds.map(() => '?').join(',');
  const findings = db
    .prepare(
      `SELECT t.id, t.status, t.inspeksi_id, i.kendaraan_id, i.is_demo
       FROM temuan t
       JOIN inspeksi i ON i.id = t.inspeksi_id
       WHERE t.id IN (${placeholders})`
    )
    .all(...temuanIds) as Array<Record<string, unknown>>;

  if (findings.length !== temuanIds.length) {
    res.status(400).json({ error: 'Sebagian temuan penyebab tidak ditemukan.' });
    return;
  }
  for (const f of findings) {
    if (f.kendaraan_id !== kendaraanId) {
      res.status(400).json({ error: 'Semua temuan penyebab harus berasal dari kendaraan yang sama.' });
      return;
    }
    if (Number(f.is_demo) === 1) {
      res.status(400).json({ error: 'Inspeksi Mode Demo tidak dapat memicu penangguhan akses kendaraan (BR-17).' });
      return;
    }
    if (f.status !== 'Terbuka') {
      res.status(400).json({ error: 'Temuan penyebab penangguhan harus berstatus Terbuka.' });
      return;
    }
  }

  const suspensionId = uuidv4();
  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `INSERT INTO penangguhan_akses (id, kendaraan_id, status, alasan, berlaku_efektif_pada, dicatat_oleh, dicatat_pada)
       VALUES (?, ?, 'Aktif', ?, ?, ?, ?)`
    ).run(suspensionId, kendaraanId, String(alasan).trim(), berlakuEfektifPada, req.user!.id, now);

    const linkStmt = db.prepare('INSERT INTO penangguhan_temuan (penangguhan_id, temuan_id) VALUES (?, ?)');
    const inspIds = new Set<string>();
    for (const f of findings) {
      linkStmt.run(suspensionId, f.id as string);
      inspIds.add(String(f.inspeksi_id));
    }

    // Perbarui status akses KENDARAAN saja (bukan karyawan / akun kerja, BR-10)
    db.prepare("UPDATE kendaraan SET status_akses = 'Ditangguhkan Sementara', diubah_pada = ? WHERE id = ?").run(
      now,
      kendaraanId
    );

    // Transisi status tindak lanjut inspeksi terkait menjadi Dalam Proses bila masih Menunggu
    for (const iid of inspIds) {
      db.prepare(
        `UPDATE inspeksi SET status_tindak_lanjut = 'Dalam Proses', diubah_pada = ?
         WHERE id = ? AND status_tindak_lanjut = 'Menunggu Tindak Lanjut PIC'`
      ).run(now, iid);
    }

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'penangguhan_akses',
      idEntitas: suspensionId,
      aksi: 'CATAT_PENANGGUHAN_AKSES',
      nilaiSebelum: { statusAksesKendaraan: vehicle.status_akses },
      nilaiSesudah: {
        kendaraanId,
        plat: vehicle.plat_tampil,
        statusAksesKendaraan: 'Ditangguhkan Sementara',
        alasan: String(alasan).trim(),
        berlakuEfektifPada,
        temuanIds,
      },
      alamatIp: getClientIp(req),
    });
  });

  res.status(201).json({
    id: suspensionId,
    statusAkses: 'Ditangguhkan Sementara',
    pesan: 'Penangguhan akses kendaraan tercatat di sistem (tidak memblokir gerbang fisik secara otomatis).',
  });
});

// Catat Pemulihan Akses Kendaraan oleh PIC (FR-FUP-08, BR-12, AL-13, AC-24, AC-25)
router.post('/suspensions/:id/restore', authenticate, requireRoles('PIC'), (req, res) => {
  const { pemulihanEfektifPada, catatan } = req.body || {};
  if (!pemulihanEfektifPada || !catatan || !String(catatan).trim()) {
    res.status(400).json({ error: 'Waktu efektif pemulihan dan catatan pemulihan wajib diisi.' });
    return;
  }

  const db = getDb();
  const susp = db
    .prepare("SELECT * FROM penangguhan_akses WHERE id = ? AND status = 'Aktif'")
    .get(String(req.params.id)) as Record<string, unknown> | undefined;

  if (!susp) {
    res.status(404).json({ error: 'Penangguhan aktif tidak ditemukan.' });
    return;
  }

  // BR-12 / AC-24: Periksa SELURUH temuan penyebab harus sudah Terverifikasi Selesai lewat inspeksi ulang final
  const causeFindings = db
    .prepare(
      `SELECT t.id, t.status, t.inspeksi_id, ii.nama_snapshot, i.kode_inspeksi
       FROM penangguhan_temuan pt
       JOIN temuan t ON t.id = pt.temuan_id
       JOIN inspeksi_item ii ON ii.id = t.inspeksi_item_id
       JOIN inspeksi i ON i.id = t.inspeksi_id
       WHERE pt.penangguhan_id = ?`
    )
    .all(String(req.params.id)) as Array<Record<string, unknown>>;

  const unverified = causeFindings.filter((f) => f.status !== 'Terverifikasi Selesai');
  if (unverified.length > 0) {
    res.status(400).json({
      error: 'Pemulihan akses ditolak: masih ada temuan penyebab yang belum terverifikasi selesai melalui inspeksi ulang final.',
      unverifiedFindings: unverified.map((u) => ({
        id: u.id,
        item: u.nama_snapshot,
        kodeInspeksi: u.kode_inspeksi,
        status: u.status,
      })),
    });
    return;
  }

  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `UPDATE penangguhan_akses
       SET status = 'Dipulihkan', pemulihan_efektif_pada = ?, pemulihan_catatan = ?, dipulihkan_oleh = ?
       WHERE id = ?`
    ).run(pemulihanEfektifPada, String(catatan).trim(), req.user!.id, String(req.params.id));

    db.prepare("UPDATE kendaraan SET status_akses = 'Aktif', diubah_pada = ? WHERE id = ?").run(
      now,
      susp.kendaraan_id as string
    );

    // Perbarui status tindak lanjut inspeksi terkait menjadi Selesai bila tidak ada temuan terbuka lain (PRD 10.2.c)
    const inspIds = new Set(causeFindings.map((f) => String(f.inspeksi_id)));
    for (const iid of inspIds) {
      const openLeft = (
        db.prepare("SELECT COUNT(*) as cnt FROM temuan WHERE inspeksi_id = ? AND status = 'Terbuka'").get(iid) as {
          cnt: number;
        }
      ).cnt;
      if (openLeft === 0) {
        db.prepare("UPDATE inspeksi SET status_tindak_lanjut = 'Selesai', diubah_pada = ? WHERE id = ?").run(now, iid);
      }
    }

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'penangguhan_akses',
      idEntitas: String(req.params.id),
      aksi: 'CATAT_PEMULIHAN_AKSES',
      nilaiSebelum: { status: 'Aktif', statusAksesKendaraan: 'Ditangguhkan Sementara' },
      nilaiSesudah: {
        status: 'Dipulihkan',
        statusAksesKendaraan: 'Aktif',
        pemulihanEfektifPada,
        catatan: String(catatan).trim(),
      },
      alamatIp: getClientIp(req),
    });
  });

  res.json({
    ok: true,
    statusAkses: 'Aktif',
    pesan: 'Pemulihan akses kendaraan berhasil dicatat di sistem.',
  });
});

export default router;
