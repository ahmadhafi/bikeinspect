import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { getDb, withTransaction } from '../db/database.js';
import {
  authenticate,
  buildEvidenceSignedUrl,
  getClientIp,
  requireRoles,
  verifySignedEvidenceParams,
} from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { buildInspectionFilterQuery } from '../services/excel.js';
import { generateInspectionCode, maskNikForRole } from '../utils/plate.js';

const router = Router();

const ALLOWED_PHOTO_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uploadEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_PHOTO_MIMES.has(file.mimetype)) {
      cb(new Error('Format foto tidak didukung. Gunakan JPEG, PNG, atau WebP (maksimal 8 MB).'));
      return;
    }
    cb(null, true);
  },
});

/**
 * Membuang segmen EXIF (APP1 / GPS) dari buffer JPEG sebelum disimpan (NFR-10).
 */
function stripJpegExif(buf: Buffer): Buffer {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const chunks: Buffer[] = [buf.subarray(0, 2)];
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xff) {
      chunks.push(buf.subarray(offset));
      break;
    }
    const marker = buf[offset + 1];
    // Start of Scan (SOS) atau End of Image (EOI): salin sisanya utuh
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(buf.subarray(offset));
      break;
    }
    if (offset + 4 > buf.length) {
      chunks.push(buf.subarray(offset));
      break;
    }
    const segLen = buf.readUInt16BE(offset + 2);
    const nextOffset = offset + 2 + segLen;
    // Buang APP1 (EXIF/XMP) dan APP13 (IPTC)
    if (marker !== 0xe1 && marker !== 0xed) {
      chunks.push(buf.subarray(offset, nextOffset));
    }
    offset = nextOffset;
  }
  return Buffer.concat(chunks);
}

// Ringkasan Beranda (hari ini, temuan terbuka, akses ditangguhkan, draf aktif)
router.get('/dashboard/summary', authenticate, (req, res) => {
  const db = getDb();
  const role = req.user!.peran;
  const userId = req.user!.id;

  const todayWib = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const todayStart = `${todayWib}T00:00:00.000Z`;

  const scopeClause = role === 'Petugas' ? 'AND i.petugas_id = ?' : '';
  const scopeParams = role === 'Petugas' ? [userId] : [];

  const todayCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM inspeksi i WHERE i.status = 'Final' AND i.is_demo = 0 AND i.difinalkan_pada >= ? ${scopeClause}`
      )
      .get(todayStart, ...scopeParams) as { cnt: number }
  ).cnt;

  const openFindingsCount = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt FROM temuan t
         JOIN inspeksi i ON i.id = t.inspeksi_id
         WHERE t.status = 'Terbuka' AND i.status = 'Final' AND i.is_demo = 0 ${scopeClause}`
      )
      .get(...scopeParams) as { cnt: number }
  ).cnt;

  const suspendedCount = (
    db.prepare(`SELECT COUNT(*) as cnt FROM penangguhan_akses WHERE status = 'Aktif'`).get() as { cnt: number }
  ).cnt;

  const activeDrafts = db
    .prepare(
      `SELECT id, kode_inspeksi, plat_tampil_snapshot, merek_tipe_snapshot, nama_karyawan_snapshot, jenis, dibuat_pada, diubah_pada
       FROM inspeksi
       WHERE status = 'Draf' AND petugas_id = ?
       ORDER BY diubah_pada DESC LIMIT 5`
    )
    .all(userId);

  const recentInspections = db
    .prepare(
      `SELECT i.id, i.kode_inspeksi, i.plat_tampil_snapshot, i.merek_tipe_snapshot,
              i.nama_karyawan_snapshot, i.departemen_snapshot, i.hasil, i.status_tindak_lanjut,
              i.difinalkan_pada, i.jenis, i.is_demo, k.status_akses
       FROM inspeksi i
       JOIN kendaraan k ON k.id = i.kendaraan_id
       WHERE i.status = 'Final' ${scopeClause}
       ORDER BY i.difinalkan_pada DESC LIMIT 5`
    )
    .all(...scopeParams);

  res.json({
    inspeksiHariIni: todayCount,
    temuanBelumSelesai: openFindingsCount,
    aksesDitangguhkan: suspendedCount,
    drafAktif: activeDrafts,
    inspeksiTerbaru: recentInspections,
  });
});

// Membuat Draf Inspeksi (Awal: khusus Petugas; Ulang: Petugas atau PIC)
router.post('/inspections', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const { kendaraanId, jenis = 'Awal', inspeksiAsalId, isDemo = false, ocrId } = req.body || {};

  if (jenis === 'Awal' && req.user!.peran !== 'Petugas') {
    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'inspeksi',
      idEntitas: 'create',
      aksi: 'AKSES_DITOLAK_403',
      nilaiSesudah: { peran: req.user!.peran, jenis },
      alamatIp: getClientIp(req),
    });
    res.status(403).json({ error: 'Hanya Petugas yang dapat membuat inspeksi awal baru.' });
    return;
  }

  const db = getDb();

  let targetKendaraanId = kendaraanId as string | undefined;
  let openFindingsFromOrigin: Array<{
    temuan_id: string;
    parameter_id: string;
    nama_snapshot: string;
    kelompok_snapshot: string;
    deskripsi_snapshot: string;
    jenis_temuan_snapshot: string;
    boleh_tidak_berlaku_snapshot: number;
    wajib_foto_snapshot: number;
    acuan_jenis_snapshot: string;
    acuan_teks_snapshot: string;
    urutan_snapshot: number;
    parameter_versi: number;
  }> = [];

  if (jenis === 'Ulang') {
    if (!inspeksiAsalId) {
      res.status(400).json({ error: 'Inspeksi ulang harus menautkan ID inspeksi asal.' });
      return;
    }
    const origin = db
      .prepare("SELECT * FROM inspeksi WHERE id = ? AND status = 'Final'")
      .get(inspeksiAsalId) as Record<string, unknown> | undefined;
    if (!origin) {
      res.status(404).json({ error: 'Inspeksi asal tidak ditemukan atau belum final.' });
      return;
    }
    targetKendaraanId = String(origin.kendaraan_id);
    openFindingsFromOrigin = db
      .prepare(
        `SELECT t.id AS temuan_id, ii.parameter_id, ii.nama_snapshot, ii.kelompok_snapshot,
                ii.deskripsi_snapshot, ii.jenis_temuan_snapshot, ii.boleh_tidak_berlaku_snapshot,
                ii.wajib_foto_snapshot, ii.acuan_jenis_snapshot, ii.acuan_teks_snapshot,
                ii.urutan_snapshot, ii.parameter_versi
         FROM temuan t
         JOIN inspeksi_item ii ON ii.id = t.inspeksi_item_id
         WHERE t.inspeksi_id = ? AND t.status = 'Terbuka'
         ORDER BY ii.urutan_snapshot ASC`
      )
      .all(inspeksiAsalId) as typeof openFindingsFromOrigin;

    if (openFindingsFromOrigin.length === 0) {
      res.status(400).json({ error: 'Tidak ada temuan terbuka pada inspeksi asal untuk diinspeksi ulang.' });
      return;
    }
  }

  if (!targetKendaraanId) {
    res.status(400).json({ error: 'Kendaraan wajib dipilih.' });
    return;
  }

  const vehicle = db
    .prepare(
      `SELECT k.*, kar.nama AS karyawan_nama, kar.nik AS karyawan_nik, kar.departemen AS karyawan_departemen
       FROM kendaraan k
       JOIN karyawan kar ON kar.id = k.karyawan_id
       WHERE k.id = ? AND k.aktif = 1`
    )
    .get(targetKendaraanId) as Record<string, unknown> | undefined;

  if (!vehicle) {
    res.status(404).json({ error: 'Kendaraan tidak ditemukan atau nonaktif.' });
    return;
  }

  // FR-INS-19: Cegah dua draf aktif oleh Petugas yang sama untuk kendaraan yang sama
  const existingDraft = db
    .prepare(
      `SELECT id, kode_inspeksi FROM inspeksi
       WHERE kendaraan_id = ? AND petugas_id = ? AND status = 'Draf' AND jenis = ?`
    )
    .get(targetKendaraanId, req.user!.id, jenis) as { id: string; kode_inspeksi: string } | undefined;

  if (existingDraft) {
    res.status(200).json({
      id: existingDraft.id,
      kodeInspeksi: existingDraft.kode_inspeksi,
      reusedDraft: true,
      pesan: 'Melanjutkan draf inspeksi aktif yang sudah ada untuk kendaraan ini.',
    });
    return;
  }

  const created = withTransaction(db, () => {
    const id = uuidv4();
    const kode = generateInspectionCode(db);
    const now = new Date().toISOString();

    db.prepare(
      `INSERT INTO inspeksi (
        id, kode_inspeksi, kendaraan_id, karyawan_id_snapshot, nama_karyawan_snapshot, nik_snapshot, departemen_snapshot,
        plat_tampil_snapshot, merek_tipe_snapshot, tahun_snapshot, warna_snapshot, petugas_id,
        jenis, inspeksi_asal_id, status, hasil, status_tindak_lanjut, is_demo, dibuat_pada, diubah_pada
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draf', NULL, 'Tidak Perlu', ?, ?, ?)`
    ).run(
      id,
      kode,
      vehicle.id as string,
      vehicle.karyawan_id as string,
      vehicle.karyawan_nama as string,
      vehicle.karyawan_nik as string,
      vehicle.karyawan_departemen as string,
      vehicle.plat_tampil as string,
      `${vehicle.merek} ${vehicle.tipe}`,
      vehicle.tahun as number,
      vehicle.warna as string,
      req.user!.id,
      jenis,
      inspeksiAsalId || null,
      isDemo ? 1 : 0,
      now,
      now
    );

    const insertItem = db.prepare(
      `INSERT INTO inspeksi_item (
        id, inspeksi_id, parameter_id, parameter_versi, kelompok_snapshot, nama_snapshot, deskripsi_snapshot,
        wajib_snapshot, jenis_temuan_snapshot, boleh_tidak_berlaku_snapshot, wajib_foto_snapshot,
        acuan_jenis_snapshot, acuan_teks_snapshot, urutan_snapshot, status, temuan_asal_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Belum Diperiksa', ?)`
    );

    if (jenis === 'Ulang') {
      // Pada inspeksi ulang, item temuan terbuka menjadi wajib verifikasi (FR-FUP-06)
      for (const f of openFindingsFromOrigin) {
        insertItem.run(
          uuidv4(),
          id,
          f.parameter_id,
          f.parameter_versi,
          f.kelompok_snapshot,
          f.nama_snapshot,
          f.deskripsi_snapshot,
          1, // wajib verifikasi
          f.jenis_temuan_snapshot,
          f.boleh_tidak_berlaku_snapshot,
          f.wajib_foto_snapshot,
          f.acuan_jenis_snapshot,
          f.acuan_teks_snapshot,
          f.urutan_snapshot,
          f.temuan_id
        );
      }
    } else {
      // Snapshot parameter aktif saat inspeksi dibuat (FR-INS-02, AC-29)
      const activeParams = db
        .prepare('SELECT * FROM parameter_pemeriksaan WHERE aktif = 1 ORDER BY urutan ASC')
        .all() as Array<Record<string, unknown>>;

      for (const p of activeParams) {
        insertItem.run(
          uuidv4(),
          id,
          p.id as string,
          p.versi as number,
          p.kelompok as string,
          p.nama as string,
          p.deskripsi as string,
          p.wajib as number,
          p.jenis_temuan as string,
          p.boleh_tidak_berlaku as number,
          p.wajib_foto as number,
          p.acuan_jenis as string,
          p.acuan_teks as string,
          p.urutan as number,
          null
        );
      }
    }

    if (ocrId && typeof ocrId === 'string') {
      db.prepare('UPDATE ocr_percobaan SET inspeksi_id = ? WHERE id = ? AND pengguna_id = ?').run(
        id,
        ocrId,
        req.user!.id
      );
    }

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'inspeksi',
      idEntitas: id,
      aksi: jenis === 'Ulang' ? 'BUAT_DRAF_INSPEKSI_ULANG' : 'BUAT_DRAF_INSPEKSI',
      nilaiSesudah: { kodeInspeksi: kode, plat: vehicle.plat_tampil, jenis, isDemo: Boolean(isDemo) },
      alamatIp: getClientIp(req),
    });

    return { id, kodeInspeksi: kode };
  });

  res.status(201).json(created);
});

// Daftar / Riwayat Inspeksi (FR-HIS-01, FR-HIS-02, FR-HIS-05)
router.get('/inspections', authenticate, (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
  const offset = (page - 1) * pageSize;

  const filter = {
    q: typeof req.query.q === 'string' ? req.query.q : undefined,
    tanggalMulai: typeof req.query.tanggalMulai === 'string' ? req.query.tanggalMulai : undefined,
    tanggalSelesai: typeof req.query.tanggalSelesai === 'string' ? req.query.tanggalSelesai : undefined,
    departemen: typeof req.query.departemen === 'string' ? req.query.departemen : undefined,
    hasil: typeof req.query.hasil === 'string' ? req.query.hasil : undefined,
    statusAkses: typeof req.query.statusAkses === 'string' ? req.query.statusAkses : undefined,
    statusTindakLanjut: typeof req.query.statusTindakLanjut === 'string' ? req.query.statusTindakLanjut : undefined,
    includeDemo: req.query.includeDemo === 'true',
  };

  const { whereSql, params } = buildInspectionFilterQuery(filter);
  const extraConds = [whereSql];
  const allParams: (string | number)[] = [...params];

  if (req.query.status === 'Draf') {
    extraConds[0] = extraConds[0].replace("i.status = 'Final'", "i.status = 'Draf'");
  } else if (req.query.status === 'all') {
    extraConds[0] = extraConds[0].replace("i.status = 'Final'", "i.status IN ('Final', 'Draf')");
  }

  // Petugas hanya melihat inspeksi buatannya sendiri (FR-HIS-05, A-02)
  if (req.user!.peran === 'Petugas') {
    extraConds.push('i.petugas_id = ?');
    allParams.push(req.user!.id);
  }

  const finalWhere = extraConds.join(' AND ');

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM inspeksi i
         JOIN kendaraan k ON k.id = i.kendaraan_id
         WHERE ${finalWhere}`
      )
      .get(...allParams) as { cnt: number }
  ).cnt;

  const rows = db
    .prepare(
      `SELECT
         i.id, i.kode_inspeksi, i.kendaraan_id, i.plat_tampil_snapshot, i.merek_tipe_snapshot,
         i.tahun_snapshot, i.warna_snapshot, i.nama_karyawan_snapshot, i.nik_snapshot,
         i.departemen_snapshot, i.jenis, i.inspeksi_asal_id, i.status, i.hasil,
         i.status_tindak_lanjut, i.is_demo, i.dibuat_pada, i.difinalkan_pada,
         p.nama AS petugas_nama,
         k.status_akses,
         (SELECT COUNT(*) FROM inspeksi_item ii WHERE ii.inspeksi_id = i.id AND ii.status = 'Tidak Sesuai') AS jumlah_temuan,
         (SELECT COUNT(*) FROM teguran_manual tm WHERE tm.inspeksi_id = i.id) AS jumlah_teguran,
         (SELECT MAX(tm.dikirim_pada) FROM teguran_manual tm WHERE tm.inspeksi_id = i.id) AS teguran_terakhir
       FROM inspeksi i
       JOIN pengguna p ON p.id = i.petugas_id
       JOIN kendaraan k ON k.id = i.kendaraan_id
       WHERE ${finalWhere}
       ORDER BY COALESCE(i.difinalkan_pada, i.diubah_pada) DESC
       LIMIT ? OFFSET ?`
    )
    .all(...allParams, pageSize, offset) as Array<Record<string, unknown>>;

  const items = rows.map((r) => ({
    ...r,
    nik_snapshot: maskNikForRole(String(r.nik_snapshot), req.user!.peran),
    status_teguran_manual: Number(r.jumlah_teguran || 0) > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
  }));

  res.json({
    items,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
});

// Detail Inspeksi (P-04, P-05, P-07, P-08)
router.get('/inspections/:id', authenticate, (req, res) => {
  const db = getDb();
  const insp = db
    .prepare(
      `SELECT
         i.*,
         p.nama AS petugas_nama,
         k.status_akses AS status_akses_kendaraan,
         ia.kode_inspeksi AS kode_inspeksi_asal
       FROM inspeksi i
       JOIN pengguna p ON p.id = i.petugas_id
       JOIN kendaraan k ON k.id = i.kendaraan_id
       LEFT JOIN inspeksi ia ON ia.id = i.inspeksi_asal_id
       WHERE i.id = ?`
    )
    .get(String(req.params.id)) as Record<string, unknown> | undefined;

  if (!insp) {
    res.status(404).json({ error: 'Data inspeksi tidak ditemukan.' });
    return;
  }

  // Petugas hanya boleh membuka inspeksi buatannya sendiri (FR-HIS-05)
  if (req.user!.peran === 'Petugas' && insp.petugas_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda hanya dapat melihat inspeksi yang Anda buat sendiri.' });
    return;
  }

  const rawItems = db
    .prepare(
      `SELECT ii.*, t.id AS temuan_id, t.status AS temuan_status, t.diverifikasi_pada
       FROM inspeksi_item ii
       LEFT JOIN temuan t ON t.inspeksi_item_id = ii.id
       WHERE ii.inspeksi_id = ?
       ORDER BY ii.urutan_snapshot ASC`
    )
    .all(String(req.params.id)) as Array<Record<string, unknown>>;

  const stmtPhotos = db.prepare(
    'SELECT id, nama_asli, jenis, ukuran, tipe_mime, diambil_pada FROM bukti_foto WHERE inspeksi_item_id = ? ORDER BY diambil_pada ASC'
  );

  const items = rawItems.map((it) => {
    const photos = (stmtPhotos.all(it.id as string) as Array<Record<string, unknown>>).map((ph) => ({
      ...ph,
      signedUrl: buildEvidenceSignedUrl(String(ph.id), req.user!.id),
    }));
    return { ...it, fotos: photos } as Record<string, unknown>;
  });

  const teguranList = db
    .prepare(
      `SELECT tm.*, p.nama AS dicatat_oleh_nama
       FROM teguran_manual tm
       JOIN pengguna p ON p.id = tm.dicatat_oleh
       WHERE tm.inspeksi_id = ?
       ORDER BY tm.dikirim_pada DESC`
    )
    .all(String(req.params.id));

  const addendums = db
    .prepare(
      `SELECT a.*, p.nama AS dibuat_oleh_nama
       FROM addendum_inspeksi a
       JOIN pengguna p ON p.id = a.dibuat_oleh
       WHERE a.inspeksi_id = ?
       ORDER BY a.dibuat_pada DESC`
    )
    .all(String(req.params.id));

  const penangguhanAktif = db
    .prepare(
      `SELECT pa.*, p.nama AS dicatat_oleh_nama
       FROM penangguhan_akses pa
       JOIN pengguna p ON p.id = pa.dicatat_oleh
       WHERE pa.kendaraan_id = ? AND pa.status = 'Aktif'
       LIMIT 1`
    )
    .get(insp.kendaraan_id as string) as Record<string, unknown> | undefined;

  let penangguhanTemuan: Array<Record<string, unknown>> = [];
  if (penangguhanAktif) {
    penangguhanTemuan = db
      .prepare(
        `SELECT t.id, t.status, ii.nama_snapshot, i.kode_inspeksi, i.id AS inspeksi_id
         FROM penangguhan_temuan pt
         JOIN temuan t ON t.id = pt.temuan_id
         JOIN inspeksi_item ii ON ii.id = t.inspeksi_item_id
         JOIN inspeksi i ON i.id = t.inspeksi_id
         WHERE pt.penangguhan_id = ?`
      )
      .all(penangguhanAktif.id as string) as Array<Record<string, unknown>>;
  }

  const reinspections = db
    .prepare(
      `SELECT id, kode_inspeksi, status, hasil, difinalkan_pada, dibuat_pada
       FROM inspeksi
       WHERE inspeksi_asal_id = ?
       ORDER BY dibuat_pada DESC`
    )
    .all(String(req.params.id));

  const auditHistory = db
    .prepare(
      `SELECT id, waktu, pelaku_nama, entitas, aksi, nilai_sesudah
       FROM audit_log
       WHERE (entitas = 'inspeksi' AND id_entitas = ?)
          OR (entitas = 'penangguhan_akses' AND id_entitas = ?)
       ORDER BY waktu DESC LIMIT 30`
    )
    .all(String(req.params.id), penangguhanAktif ? String(penangguhanAktif.id) : '');

  const counts = {
    total: items.length,
    sesuai: items.filter((i) => i.status === 'Sesuai').length,
    tidakSesuai: items.filter((i) => i.status === 'Tidak Sesuai').length,
    tidakBerlaku: items.filter((i) => i.status === 'Tidak Berlaku').length,
    belumDiperiksa: items.filter((i) => i.status === 'Belum Diperiksa').length,
  };

  res.json({
    ...insp,
    nik_snapshot: maskNikForRole(String(insp.nik_snapshot), req.user!.peran),
    items,
    counts,
    teguranManual: {
      status: teguranList.length > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
      jumlah: teguranList.length,
      riwayat: teguranList,
    },
    addendums,
    penangguhanAktif: penangguhanAktif
      ? {
          ...penangguhanAktif,
          temuanPenyebab: penangguhanTemuan,
        }
      : null,
    inspeksiUlang: reinspections,
    auditHistory,
  });
});

// Simpan Draf (tanpa validasi item wajib, FR-INS-13)
router.put('/inspections/:id/draft', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const db = getDb();
  const insp = db.prepare('SELECT * FROM inspeksi WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;

  if (!insp) {
    res.status(404).json({ error: 'Inspeksi tidak ditemukan.' });
    return;
  }
  if (insp.petugas_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak berhak menyunting draf milik pengguna lain.' });
    return;
  }
  if (insp.status !== 'Draf') {
    res.status(400).json({ error: 'Inspeksi yang sudah final tidak dapat disunting (gunakan addendum PIC atau inspeksi ulang).' });
    return;
  }

  const { items = [], masaBerlakuSim, masaBerlakuStnkPajak, catatanUmum } = req.body || {};
  const now = new Date().toISOString();

  withTransaction(db, () => {
    db.prepare(
      `UPDATE inspeksi
       SET masa_berlaku_sim = ?, masa_berlaku_stnk_pajak = ?, catatan_umum = ?, diubah_pada = ?
       WHERE id = ?`
    ).run(masaBerlakuSim || null, masaBerlakuStnkPajak || null, catatanUmum || null, now, String(req.params.id));

    const updateItem = db.prepare(
      `UPDATE inspeksi_item SET status = ?, catatan = ?, alasan_tidak_berlaku = ?
       WHERE id = ? AND inspeksi_id = ?`
    );

    const validStatuses = new Set(['Belum Diperiksa', 'Sesuai', 'Tidak Sesuai', 'Tidak Berlaku']);
    for (const it of Array.isArray(items) ? items : []) {
      if (!it || typeof it.id !== 'string' || !validStatuses.has(it.status)) continue;
      updateItem.run(
        it.status,
        typeof it.catatan === 'string' ? it.catatan.trim() : null,
        typeof it.alasan_tidak_berlaku === 'string' ? it.alasan_tidak_berlaku.trim() : null,
        it.id,
        String(req.params.id)
      );
    }
  });

  res.json({ ok: true, savedAt: now, pesan: 'Draf tersimpan di server.' });
});

// Buang Draf (PRD 10.2.a)
router.post('/inspections/:id/discard', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const db = getDb();
  const insp = db.prepare('SELECT * FROM inspeksi WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;
  if (!insp) {
    res.status(404).json({ error: 'Inspeksi tidak ditemukan.' });
    return;
  }
  if (insp.petugas_id !== req.user!.id) {
    res.status(403).json({ error: 'Tidak berhak membuang draf milik pengguna lain.' });
    return;
  }
  if (insp.status !== 'Draf') {
    res.status(400).json({ error: 'Hanya draf yang dapat dibuang.' });
    return;
  }

  db.prepare("UPDATE inspeksi SET status = 'Dibuang', diubah_pada = ? WHERE id = ?").run(
    new Date().toISOString(),
    String(req.params.id)
  );

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'inspeksi',
    idEntitas: String(req.params.id),
    aksi: 'BUANG_DRAF_INSPEKSI',
    nilaiSebelum: { status: 'Draf' },
    nilaiSesudah: { status: 'Dibuang' },
    alamatIp: getClientIp(req),
  });

  res.json({ ok: true });
});

// Unggah Foto Bukti Privat (FR-INS-09, NFR-10, NFR-12, maks 5 foto per item)
router.post(
  '/inspections/:id/items/:itemId/photos',
  authenticate,
  requireRoles('Petugas', 'PIC'),
  (req, res, next) => {
    uploadEvidence.single('photo')(req, res, (err) => {
      if (err) {
        res.status(400).json({ error: err.message || 'Berkas foto tidak valid atau terlalu besar.' });
        return;
      }
      next();
    });
  },
  (req, res) => {
    const db = getDb();
    const insp = db.prepare('SELECT * FROM inspeksi WHERE id = ?').get(String(req.params.id)) as
      | Record<string, unknown>
      | undefined;

    if (!insp) {
      res.status(404).json({ error: 'Inspeksi tidak ditemukan.' });
      return;
    }
    if (insp.petugas_id !== req.user!.id) {
      res.status(403).json({ error: 'Anda tidak berhak mengunggah foto pada inspeksi ini.' });
      return;
    }
    if (insp.status !== 'Draf') {
      res.status(400).json({ error: 'Tidak dapat menambah foto setelah inspeksi difinalkan.' });
      return;
    }

    const item = db
      .prepare('SELECT * FROM inspeksi_item WHERE id = ? AND inspeksi_id = ?')
      .get(String(req.params.itemId), String(req.params.id)) as Record<string, unknown> | undefined;
    if (!item) {
      res.status(404).json({ error: 'Item pemeriksaan tidak ditemukan.' });
      return;
    }

    const existingCount = (
      db.prepare('SELECT COUNT(*) as cnt FROM bukti_foto WHERE inspeksi_item_id = ?').get(String(req.params.itemId)) as {
        cnt: number;
      }
    ).cnt;
    if (existingCount >= 5) {
      res.status(400).json({ error: 'Maksimal 5 foto bukti per item pemeriksaan.' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Berkas foto wajib dilampirkan.' });
      return;
    }

    fs.mkdirSync(config.uploadDir, { recursive: true });
    const cleanedBuf = file.mimetype === 'image/jpeg' ? stripJpegExif(file.buffer) : file.buffer;
    const ext = file.mimetype === 'image/png' ? '.png' : file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const storageKey = `${uuidv4()}${ext}`;
    const fullPath = path.join(config.uploadDir, storageKey);
    fs.writeFileSync(fullPath, cleanedBuf);

    const checksum = crypto.createHash('sha256').update(cleanedBuf).digest('hex');
    const photoId = uuidv4();
    const now = new Date().toISOString();
    const jenis = item.jenis_temuan_snapshot === 'Administrasi' ? 'Dokumen' : 'Fisik';

    db.prepare(
      `INSERT INTO bukti_foto (id, inspeksi_item_id, kunci_penyimpanan, nama_asli, jenis, ukuran, tipe_mime, checksum, diambil_pada, diunggah_oleh)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      photoId,
      String(req.params.itemId),
      storageKey,
      file.originalname || `bukti_${Date.now()}${ext}`,
      jenis,
      cleanedBuf.length,
      file.mimetype,
      checksum,
      now,
      req.user!.id
    );

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'bukti_foto',
      idEntitas: photoId,
      aksi: 'UNGGAH_FOTO_BUKTI',
      nilaiSesudah: { inspeksiId: String(req.params.id), itemId: String(req.params.itemId), ukuran: cleanedBuf.length, jenis },
      alamatIp: getClientIp(req),
    });

    res.status(201).json({
      id: photoId,
      nama_asli: file.originalname || `bukti_${Date.now()}${ext}`,
      jenis,
      ukuran: cleanedBuf.length,
      tipe_mime: file.mimetype,
      diambil_pada: now,
      signedUrl: buildEvidenceSignedUrl(photoId, req.user!.id),
    });
  }
);

router.delete(
  '/inspections/:id/items/:itemId/photos/:photoId',
  authenticate,
  requireRoles('Petugas', 'PIC'),
  (req, res) => {
    const db = getDb();
    const insp = db.prepare('SELECT * FROM inspeksi WHERE id = ?').get(String(req.params.id)) as
      | Record<string, unknown>
      | undefined;
    if (!insp || insp.status !== 'Draf' || insp.petugas_id !== req.user!.id) {
      res.status(403).json({ error: 'Tidak dapat menghapus foto bukti pada inspeksi ini.' });
      return;
    }

    const photo = db
      .prepare('SELECT * FROM bukti_foto WHERE id = ? AND inspeksi_item_id = ?')
      .get(String(req.params.photoId), String(req.params.itemId)) as Record<string, unknown> | undefined;
    if (!photo) {
      res.status(404).json({ error: 'Foto bukti tidak ditemukan.' });
      return;
    }

    db.prepare('DELETE FROM bukti_foto WHERE id = ?').run(String(req.params.photoId));
    const fullPath = path.join(config.uploadDir, String(photo.kunci_penyimpanan));
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'bukti_foto',
      idEntitas: String(req.params.photoId),
      aksi: 'HAPUS_FOTO_BUKTI',
      alamatIp: getClientIp(req),
    });

    res.json({ ok: true });
  }
);

// Finalisasi Inspeksi (Idempoten + Validasi BR-04 s.d. BR-07, FR-INS-15, FR-INS-16, FR-SAV-06)
router.post('/inspections/:id/finalize', authenticate, requireRoles('Petugas', 'PIC'), (req, res) => {
  const db = getDb();
  const idempotencyKey =
    (req.headers['x-idempotency-key'] as string) ||
    (typeof req.body?.idempotencyKey === 'string' ? req.body.idempotencyKey : '');

  if (!idempotencyKey) {
    res.status(400).json({ error: 'Kunci idempotensi wajib disertakan untuk mencegah penyimpanan ganda.' });
    return;
  }

  // Cek idempotensi terlebih dahulu (AC-12, FR-INS-16)
  const existingByKey = db
    .prepare("SELECT id, kode_inspeksi, status, hasil, difinalkan_pada FROM inspeksi WHERE kunci_idempotensi = ?")
    .get(idempotencyKey) as Record<string, unknown> | undefined;

  if (existingByKey) {
    res.json({
      id: existingByKey.id,
      kodeInspeksi: existingByKey.kode_inspeksi,
      status: existingByKey.status,
      hasil: existingByKey.hasil,
      difinalkanPada: existingByKey.difinalkan_pada,
      idempotentReplay: true,
    });
    return;
  }

  const insp = db.prepare('SELECT * FROM inspeksi WHERE id = ?').get(String(req.params.id)) as
    | Record<string, unknown>
    | undefined;

  if (!insp) {
    res.status(404).json({ error: 'Inspeksi tidak ditemukan.' });
    return;
  }
  if (insp.petugas_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak berhak memfinalisasi inspeksi milik pengguna lain.' });
    return;
  }
  if (insp.status === 'Final') {
    res.json({
      id: insp.id,
      kodeInspeksi: insp.kode_inspeksi,
      status: insp.status,
      hasil: insp.hasil,
      difinalkanPada: insp.difinalkan_pada,
      idempotentReplay: true,
    });
    return;
  }
  if (insp.status !== 'Draf') {
    res.status(400).json({ error: 'Inspeksi yang sudah dibuang tidak dapat difinalisasi.' });
    return;
  }

  // Terapkan pembaruan item terakhir bila dikirim bersama permintaan finalisasi
  const { items: payloadItems, masaBerlakuSim, masaBerlakuStnkPajak, catatanUmum } = req.body || {};

  const result = withTransaction(db, () => {
    const now = new Date().toISOString();

    if (masaBerlakuSim !== undefined || masaBerlakuStnkPajak !== undefined || catatanUmum !== undefined) {
      db.prepare(
        `UPDATE inspeksi SET masa_berlaku_sim = ?, masa_berlaku_stnk_pajak = ?, catatan_umum = ?, diubah_pada = ? WHERE id = ?`
      ).run(
        masaBerlakuSim ?? insp.masa_berlaku_sim ?? null,
        masaBerlakuStnkPajak ?? insp.masa_berlaku_stnk_pajak ?? null,
        catatanUmum ?? insp.catatan_umum ?? null,
        now,
        String(req.params.id)
      );
    }

    if (Array.isArray(payloadItems)) {
      const validStatuses = new Set(['Belum Diperiksa', 'Sesuai', 'Tidak Sesuai', 'Tidak Berlaku']);
      const upd = db.prepare(
        'UPDATE inspeksi_item SET status = ?, catatan = ?, alasan_tidak_berlaku = ? WHERE id = ? AND inspeksi_id = ?'
      );
      for (const it of payloadItems) {
        if (!it || typeof it.id !== 'string' || !validStatuses.has(it.status)) continue;
        upd.run(
          it.status,
          typeof it.catatan === 'string' ? it.catatan.trim() : null,
          typeof it.alasan_tidak_berlaku === 'string' ? it.alasan_tidak_berlaku.trim() : null,
          it.id,
          String(req.params.id)
        );
      }
    }

    const dbItems = db
      .prepare(
        `SELECT ii.*,
                (SELECT COUNT(*) FROM bukti_foto bf WHERE bf.inspeksi_item_id = ii.id) AS jumlah_foto
         FROM inspeksi_item ii
         WHERE ii.inspeksi_id = ?
         ORDER BY ii.urutan_snapshot ASC`
      )
      .all(String(req.params.id)) as Array<Record<string, unknown>>;

    const errors: Array<{ itemId: string; nama: string; pesan: string }> = [];

    for (const it of dbItems) {
      const itemId = String(it.id);
      const nama = String(it.nama_snapshot);
      const status = String(it.status);
      const wajib = Number(it.wajib_snapshot) === 1;
      const jenisTemuan = String(it.jenis_temuan_snapshot);
      const bolehTB = Number(it.boleh_tidak_berlaku_snapshot) === 1;
      const wajibFoto = Number(it.wajib_foto_snapshot) === 1;
      const catatan = typeof it.catatan === 'string' ? it.catatan.trim() : '';
      const alasanTB = typeof it.alasan_tidak_berlaku === 'string' ? it.alasan_tidak_berlaku.trim() : '';
      const jumlahFoto = Number(it.jumlah_foto || 0);

      // BR-05: Item wajib tidak boleh Belum Diperiksa
      if (wajib && status === 'Belum Diperiksa') {
        errors.push({ itemId, nama, pesan: `Item wajib "${nama}" masih Belum Diperiksa.` });
        continue;
      }

      // BR-06: Tidak Berlaku hanya untuk parameter yang mengizinkan + wajib alasan
      if (status === 'Tidak Berlaku') {
        if (!bolehTB) {
          errors.push({ itemId, nama, pesan: `Item "${nama}" tidak mengizinkan status Tidak Berlaku.` });
        } else if (!alasanTB) {
          errors.push({ itemId, nama, pesan: `Alasan wajib diisi untuk status Tidak Berlaku pada "${nama}".` });
        }
        continue;
      }

      // BR-07: Tidak Sesuai — Fisik wajib catatan + foto; Administrasi wajib catatan
      if (status === 'Tidak Sesuai') {
        if (!catatan) {
          errors.push({ itemId, nama, pesan: `Catatan temuan wajib diisi untuk "${nama}".` });
        }
        if (jenisTemuan === 'Fisik' && wajibFoto && jumlahFoto < 1) {
          errors.push({
            itemId,
            nama,
            pesan: `Foto bukti wajib dilampirkan minimal 1 foto untuk temuan fisik "${nama}".`,
          });
        }
      }
    }

    if (errors.length > 0) {
      return { validationErrors: errors };
    }

    // BR-04: Hasil deterministik dari status item
    const findingItems = dbItems.filter((it) => it.status === 'Tidak Sesuai');
    const hasil = findingItems.length > 0 ? 'Ada Temuan' : 'Sesuai Seluruhnya';
    const statusTindakLanjut = findingItems.length > 0 ? 'Menunggu Tindak Lanjut PIC' : 'Tidak Perlu';

    db.prepare(
      `UPDATE inspeksi
       SET status = 'Final', hasil = ?, status_tindak_lanjut = ?, kunci_idempotensi = ?,
           difinalkan_pada = ?, diubah_pada = ?
       WHERE id = ?`
    ).run(hasil, statusTindakLanjut, idempotencyKey, now, now, String(req.params.id));

    // Buat entitas temuan untuk setiap item Tidak Sesuai
    for (const fi of findingItems) {
      db.prepare(
        `INSERT INTO temuan (id, inspeksi_id, inspeksi_item_id, status, dibuat_pada)
         VALUES (?, ?, ?, 'Terbuka', ?)`
      ).run(uuidv4(), String(req.params.id), fi.id as string, now);
    }

    // Jika ini Inspeksi Ulang: verifikasi temuan asal yang kini Sesuai (FR-FUP-07, AC-23)
    if (insp.jenis === 'Ulang' && insp.inspeksi_asal_id) {
      for (const it of dbItems) {
        if (it.temuan_asal_id && it.status === 'Sesuai') {
          db.prepare(
            `UPDATE temuan
             SET status = 'Terverifikasi Selesai', item_verifikasi_id = ?, diverifikasi_pada = ?
             WHERE id = ? AND status = 'Terbuka'`
          ).run(it.id as string, now, it.temuan_asal_id as string);
        }
      }

      // Perbarui status tindak lanjut inspeksi asal sesuai PRD 10.2.c
      const remainingOpen = (
        db
          .prepare("SELECT COUNT(*) as cnt FROM temuan WHERE inspeksi_id = ? AND status = 'Terbuka'")
          .get(insp.inspeksi_asal_id as string) as { cnt: number }
      ).cnt;

      const activeSuspension = db
        .prepare("SELECT id FROM penangguhan_akses WHERE kendaraan_id = ? AND status = 'Aktif'")
        .get(insp.kendaraan_id as string);

      if (remainingOpen === 0 && !activeSuspension) {
        db.prepare("UPDATE inspeksi SET status_tindak_lanjut = 'Selesai', diubah_pada = ? WHERE id = ?").run(
          now,
          insp.inspeksi_asal_id as string
        );
      } else if (findingItems.length > 0) {
        db.prepare("UPDATE inspeksi SET status_tindak_lanjut = 'Dalam Proses', diubah_pada = ? WHERE id = ?").run(
          now,
          insp.inspeksi_asal_id as string
        );
      }
    }

    // CATATAN PENTING (FR-SAV-06 / AC-16):
    // Menyimpan inspeksi baru TIDAK menghapus, mengubah, atau memulihkan penangguhan aktif yang sudah ada!

    recordAudit({
      pelakuId: req.user!.id,
      pelakuNama: req.user!.nama,
      entitas: 'inspeksi',
      idEntitas: String(req.params.id),
      aksi: 'FINALISASI_INSPEKSI',
      nilaiSebelum: { status: 'Draf' },
      nilaiSesudah: {
        status: 'Final',
        hasil,
        statusTindakLanjut,
        jumlahTemuan: findingItems.length,
        jenis: insp.jenis,
      },
      alamatIp: getClientIp(req),
    });

    return {
      id: insp.id,
      kodeInspeksi: insp.kode_inspeksi,
      status: 'Final',
      hasil,
      statusTindakLanjut,
      difinalkanPada: now,
    };
  });

  if ('validationErrors' in result && result.validationErrors) {
    res.status(422).json({
      error: result.validationErrors[0].pesan,
      validationErrors: result.validationErrors,
    });
    return;
  }

  res.json(result);
});

// Melayani Foto Bukti Privat melalui tautan bertanda tangan berumur pendek (NFR-10, AC-27)
router.get('/evidence/:photoId/file', authenticate, (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const exp = Number(req.query.exp || 0);

  if (!verifySignedEvidenceParams(String(req.params.photoId), req.user!.id, token, exp)) {
    res.status(403).json({ error: 'Tautan foto bukti tidak valid atau telah kedaluwarsa.' });
    return;
  }

  const db = getDb();
  const photo = db
    .prepare(
      `SELECT bf.*, i.petugas_id, i.id AS inspeksi_id
       FROM bukti_foto bf
       JOIN inspeksi_item ii ON ii.id = bf.inspeksi_item_id
       JOIN inspeksi i ON i.id = ii.inspeksi_id
       WHERE bf.id = ?`
    )
    .get(String(req.params.photoId)) as Record<string, unknown> | undefined;

  if (!photo) {
    res.status(404).json({ error: 'Foto bukti tidak ditemukan.' });
    return;
  }

  // Petugas hanya boleh melihat foto inspeksi buatannya sendiri (FR-HIS-04, A-02)
  if (req.user!.peran === 'Petugas' && photo.petugas_id !== req.user!.id) {
    res.status(403).json({ error: 'Anda tidak memiliki izin mengakses foto bukti ini.' });
    return;
  }

  const fullPath = path.join(config.uploadDir, String(photo.kunci_penyimpanan));
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Berkas foto bukti tidak ditemukan di penyimpanan privat.' });
    return;
  }

  // Catat akses foto ke log audit (FR-AUD-01, NFR-14)
  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'bukti_foto',
    idEntitas: String(photo.id),
    aksi: 'AKSES_FOTO_BUKTI',
    nilaiSesudah: { inspeksiId: photo.inspeksi_id, peran: req.user!.peran },
    alamatIp: getClientIp(req),
  });

  res.setHeader('Content-Type', String(photo.tipe_mime));
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(fullPath);
});

export default router;
