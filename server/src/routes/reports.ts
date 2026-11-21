import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';
import { authenticate, getClientIp, requireRoles } from '../middleware/auth.js';
import { recordAudit } from '../services/audit.js';
import { buildInspectionFilterQuery, generateInspectionExcel, type ExportFilter } from '../services/excel.js';

const router = Router();
const MAX_EXPORT_ROWS = 50000;

function parseFilter(query: Record<string, unknown>): ExportFilter {
  return {
    q: typeof query.q === 'string' ? query.q : undefined,
    tanggalMulai: typeof query.tanggalMulai === 'string' ? query.tanggalMulai : undefined,
    tanggalSelesai: typeof query.tanggalSelesai === 'string' ? query.tanggalSelesai : undefined,
    departemen: typeof query.departemen === 'string' ? query.departemen : undefined,
    hasil: typeof query.hasil === 'string' ? query.hasil : undefined,
    statusAkses: typeof query.statusAkses === 'string' ? query.statusAkses : undefined,
    statusTindakLanjut: typeof query.statusTindakLanjut === 'string' ? query.statusTindakLanjut : undefined,
    includeDemo: query.includeDemo === 'true',
  };
}

// Pratinjau Laporan & Daftar Departemen (PIC & Admin)
router.get('/preview', authenticate, requireRoles('PIC', 'Admin'), (req, res) => {
  const db = getDb();
  const filter = parseFilter(req.query as Record<string, unknown>);
  const { whereSql, params } = buildInspectionFilterQuery(filter);

  const stats = db
    .prepare(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN i.hasil = 'Sesuai Seluruhnya' THEN 1 ELSE 0 END) AS sesuai,
         SUM(CASE WHEN i.hasil = 'Ada Temuan' THEN 1 ELSE 0 END) AS ada_temuan,
         SUM(CASE WHEN k.status_akses = 'Ditangguhkan Sementara' THEN 1 ELSE 0 END) AS ditangguhkan
       FROM inspeksi i
       JOIN kendaraan k ON k.id = i.kendaraan_id
       WHERE ${whereSql}`
    )
    .get(...params) as { total: number; sesuai: number; ada_temuan: number; ditangguhkan: number };

  const departments = (
    db.prepare('SELECT DISTINCT departemen FROM karyawan ORDER BY departemen ASC').all() as { departemen: string }[]
  ).map((d) => d.departemen);

  res.json({
    totalBaris: Number(stats.total || 0),
    sesuaiSeluruhnya: Number(stats.sesuai || 0),
    adaTemuan: Number(stats.ada_temuan || 0),
    aksesDitangguhkan: Number(stats.ditangguhkan || 0),
    departments,
  });
});

// Ekspor Excel (.xlsx) asli — KHUSUS PIC (PRD 3.2, FR-EXP-01 s.d. 05, AC-18, AC-19, AC-20)
router.get('/export', authenticate, requireRoles('PIC'), async (req, res) => {
  const db = getDb();
  const filter = parseFilter(req.query as Record<string, unknown>);
  const { whereSql, params } = buildInspectionFilterQuery(filter);

  const count = (
    db
      .prepare(
        `SELECT COUNT(*) as cnt
         FROM inspeksi i
         JOIN kendaraan k ON k.id = i.kendaraan_id
         WHERE ${whereSql}`
      )
      .get(...params) as { cnt: number }
  ).cnt;

  if (count === 0) {
    res.status(400).json({ error: 'Tidak ada data untuk diekspor sesuai filter aktif.' });
    return;
  }
  if (count > MAX_EXPORT_ROWS) {
    res.status(400).json({
      error: `Jumlah data (${count}) melebihi batas ekspor ${MAX_EXPORT_ROWS.toLocaleString('id-ID')} baris. Silakan persempit filter tanggal atau departemen.`,
    });
    return;
  }

  const { buffer, filename, rowCount } = await generateInspectionExcel(filter);

  const exportId = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO ekspor_log (id, pengguna_id, waktu, filter_json, jumlah_baris)
     VALUES (?, ?, ?, ?, ?)`
  ).run(exportId, req.user!.id, now, JSON.stringify(filter), rowCount);

  recordAudit({
    pelakuId: req.user!.id,
    pelakuNama: req.user!.nama,
    entitas: 'ekspor_log',
    idEntitas: exportId,
    aksi: 'EKSPOR_EXCEL',
    nilaiSesudah: { filename, rowCount, filter },
    alamatIp: getClientIp(req),
  });

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

// Riwayat Ekspor (PIC)
router.get('/export-logs', authenticate, requireRoles('PIC'), (_req, res) => {
  const db = getDb();
  const logs = db
    .prepare(
      `SELECT el.*, p.nama AS pengguna_nama
       FROM ekspor_log el
       JOIN pengguna p ON p.id = el.pengguna_id
       ORDER BY el.waktu DESC LIMIT 30`
    )
    .all();
  res.json({ items: logs });
});

export default router;
