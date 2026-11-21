import ExcelJS from 'exceljs';
import { config } from '../config.js';
import { getDb } from '../db/database.js';
import { sanitizeExcelCell } from '../utils/plate.js';

export interface ExportFilter {
  q?: string;
  tanggalMulai?: string;
  tanggalSelesai?: string;
  departemen?: string;
  hasil?: string;
  statusAkses?: string;
  statusTindakLanjut?: string;
  includeDemo?: boolean;
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  rowCount: number;
}

export function buildInspectionFilterQuery(filter: ExportFilter) {
  const conditions: string[] = ["i.status = 'Final'"];
  const params: (string | number)[] = [];

  if (!filter.includeDemo) {
    conditions.push('i.is_demo = 0');
  }

  if (filter.q && filter.q.trim()) {
    const term = `%${filter.q.trim().toLowerCase()}%`;
    const termCompact = `%${filter.q.trim().toLowerCase().replace(/\s+/g, '')}%`;
    conditions.push(
      `(LOWER(i.plat_tampil_snapshot) LIKE ? OR LOWER(REPLACE(i.plat_tampil_snapshot, ' ', '')) LIKE ? OR LOWER(i.nama_karyawan_snapshot) LIKE ? OR LOWER(i.nik_snapshot) LIKE ? OR LOWER(i.kode_inspeksi) LIKE ?)`
    );
    params.push(term, termCompact, term, term, term);
  }

  if (filter.tanggalMulai) {
    conditions.push('i.difinalkan_pada >= ?');
    params.push(`${filter.tanggalMulai}T00:00:00.000Z`);
  }
  if (filter.tanggalSelesai) {
    conditions.push('i.difinalkan_pada <= ?');
    params.push(`${filter.tanggalSelesai}T23:59:59.999Z`);
  }
  if (filter.departemen) {
    conditions.push('i.departemen_snapshot = ?');
    params.push(filter.departemen);
  }
  if (filter.hasil) {
    conditions.push('i.hasil = ?');
    params.push(filter.hasil);
  }
  if (filter.statusAkses) {
    conditions.push('k.status_akses = ?');
    params.push(filter.statusAkses);
  }
  if (filter.statusTindakLanjut) {
    conditions.push('i.status_tindak_lanjut = ?');
    params.push(filter.statusTindakLanjut);
  }

  return {
    whereSql: conditions.join(' AND '),
    params,
  };
}

/**
 * Membuat berkas Excel (.xlsx) asli sesuai PRD Bagian 13:
 * - Lembar 1: "Rekap Inspeksi" (21 kolom)
 * - Lembar 2: "Detail Pemeriksaan" (11 kolom)
 * - Freeze header, autofilter, tanggal Excel (WIB), plat & NIK teks, anti formula injection.
 */
export async function generateInspectionExcel(filter: ExportFilter): Promise<ExportResult> {
  const db = getDb();
  const { whereSql, params } = buildInspectionFilterQuery(filter);

  const inspections = db
    .prepare(
      `SELECT
         i.*,
         p.nama AS petugas_nama,
         ia.kode_inspeksi AS kode_inspeksi_asal,
         k.status_akses AS status_akses_saat_ini,
         (SELECT COUNT(*) FROM teguran_manual tm WHERE tm.inspeksi_id = i.id) AS jumlah_teguran,
         (SELECT MAX(tm.dikirim_pada) FROM teguran_manual tm WHERE tm.inspeksi_id = i.id) AS teguran_terakhir,
         (SELECT pa.berlaku_efektif_pada FROM penangguhan_akses pa WHERE pa.kendaraan_id = i.kendaraan_id AND pa.status = 'Aktif' LIMIT 1) AS waktu_efektif_penangguhan
       FROM inspeksi i
       JOIN pengguna p ON p.id = i.petugas_id
       JOIN kendaraan k ON k.id = i.kendaraan_id
       LEFT JOIN inspeksi ia ON ia.id = i.inspeksi_asal_id
       WHERE ${whereSql}
       ORDER BY i.difinalkan_pada DESC`
    )
    .all(...params) as Array<Record<string, unknown>>;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Sistem Inspeksi Kendaraan';
  workbook.created = new Date();

  // ========== LEMBAR 1: Rekap Inspeksi ==========
  const wsRekap = workbook.addWorksheet('Rekap Inspeksi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  wsRekap.columns = [
    { header: 'ID Inspeksi', key: 'kode_inspeksi', width: 22 },
    { header: 'Waktu Inspeksi', key: 'waktu_inspeksi', width: 22 },
    { header: 'Jenis Inspeksi', key: 'jenis', width: 14 },
    { header: 'ID Inspeksi Asal', key: 'kode_asal', width: 22 },
    { header: 'Plat Nomor', key: 'plat', width: 16 },
    { header: 'Merek/Tipe', key: 'merek_tipe', width: 22 },
    { header: 'Tahun', key: 'tahun', width: 10 },
    { header: 'Warna', key: 'warna', width: 14 },
    { header: 'Nama Karyawan', key: 'nama_karyawan', width: 24 },
    { header: 'NIK', key: 'nik', width: 18 },
    { header: 'Departemen', key: 'departemen', width: 18 },
    { header: 'Petugas', key: 'petugas', width: 22 },
    { header: 'Hasil Inspeksi', key: 'hasil', width: 20 },
    { header: 'Jumlah Temuan', key: 'jumlah_temuan', width: 15 },
    { header: 'Ringkasan Temuan', key: 'ringkasan_temuan', width: 34 },
    { header: 'Status Tindak Lanjut', key: 'status_tindak_lanjut', width: 26 },
    { header: 'Status Teguran Manual', key: 'status_teguran', width: 22 },
    { header: 'Waktu Teguran Manual Terakhir', key: 'waktu_teguran', width: 26 },
    { header: 'Status Akses Kendaraan', key: 'status_akses', width: 24 },
    { header: 'Waktu Efektif Penangguhan', key: 'waktu_penangguhan', width: 24 },
    { header: 'Tautan Bukti', key: 'tautan_bukti', width: 42 },
  ];

  styleHeaderRow(wsRekap);

  // ========== LEMBAR 2: Detail Pemeriksaan ==========
  const wsDetail = workbook.addWorksheet('Detail Pemeriksaan', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  wsDetail.columns = [
    { header: 'ID Inspeksi', key: 'kode_inspeksi', width: 22 },
    { header: 'Plat Nomor', key: 'plat', width: 16 },
    { header: 'Kelompok', key: 'kelompok', width: 18 },
    { header: 'Item Pemeriksaan', key: 'item', width: 28 },
    { header: 'Status Item', key: 'status_item', width: 18 },
    { header: 'Jenis Temuan', key: 'jenis_temuan', width: 16 },
    { header: 'Catatan', key: 'catatan', width: 34 },
    { header: 'Alasan Tidak Berlaku', key: 'alasan_tb', width: 28 },
    { header: 'Status Temuan', key: 'status_temuan', width: 22 },
    { header: 'Jumlah Foto Bukti', key: 'jumlah_foto', width: 18 },
    { header: 'Tautan Bukti', key: 'tautan_bukti', width: 42 },
  ];

  styleHeaderRow(wsDetail);

  const stmtItems = db.prepare(
    `SELECT
       ii.*,
       t.status AS status_temuan,
       (SELECT COUNT(*) FROM bukti_foto bf WHERE bf.inspeksi_item_id = ii.id) AS jumlah_foto
     FROM inspeksi_item ii
     LEFT JOIN temuan t ON t.inspeksi_item_id = ii.id
     WHERE ii.inspeksi_id = ?
     ORDER BY ii.urutan_snapshot ASC`
  );

  for (const insp of inspections) {
    const items = stmtItems.all(insp.id as string) as Array<Record<string, unknown>>;
    const findings = items.filter((it) => it.status === 'Tidak Sesuai');
    const summaryFindings = findings.map((f) => String(f.nama_snapshot)).join(', ');
    const detailLink = `${config.appBaseUrl}/inspeksi/${insp.id}`;
    const jumlahTeguran = Number(insp.jumlah_teguran || 0);

    const rekapRow = wsRekap.addRow({
      kode_inspeksi: sanitizeExcelCell(insp.kode_inspeksi),
      waktu_inspeksi: insp.difinalkan_pada ? toWibExcelDate(String(insp.difinalkan_pada)) : '',
      jenis: sanitizeExcelCell(insp.jenis),
      kode_asal: sanitizeExcelCell(insp.kode_inspeksi_asal || ''),
      plat: sanitizeExcelCell(insp.plat_tampil_snapshot),
      merek_tipe: sanitizeExcelCell(insp.merek_tipe_snapshot),
      tahun: Number(insp.tahun_snapshot),
      warna: sanitizeExcelCell(insp.warna_snapshot),
      nama_karyawan: sanitizeExcelCell(insp.nama_karyawan_snapshot),
      nik: sanitizeExcelCell(insp.nik_snapshot),
      departemen: sanitizeExcelCell(insp.departemen_snapshot),
      petugas: sanitizeExcelCell(insp.petugas_nama),
      hasil: sanitizeExcelCell(insp.hasil || ''),
      jumlah_temuan: findings.length,
      ringkasan_temuan: sanitizeExcelCell(summaryFindings),
      status_tindak_lanjut: sanitizeExcelCell(insp.status_tindak_lanjut),
      status_teguran: jumlahTeguran > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
      waktu_teguran: insp.teguran_terakhir ? toWibExcelDate(String(insp.teguran_terakhir)) : '',
      status_akses: sanitizeExcelCell(insp.status_akses_saat_ini),
      waktu_penangguhan: insp.waktu_efektif_penangguhan
        ? toWibExcelDate(String(insp.waktu_efektif_penangguhan))
        : '',
      tautan_bukti: detailLink,
    });

    // Pastikan Plat & NIK bertipe teks (PRD 13.1, AC-19)
    rekapRow.getCell('plat').numFmt = '@';
    rekapRow.getCell('nik').numFmt = '@';
    if (insp.difinalkan_pada) rekapRow.getCell('waktu_inspeksi').numFmt = 'dd-mm-yyyy hh:mm';
    if (insp.teguran_terakhir) rekapRow.getCell('waktu_teguran').numFmt = 'dd-mm-yyyy hh:mm';
    if (insp.waktu_efektif_penangguhan) rekapRow.getCell('waktu_penangguhan').numFmt = 'dd-mm-yyyy hh:mm';

    for (const item of items) {
      const isFinding = item.status === 'Tidak Sesuai';
      const detailRow = wsDetail.addRow({
        kode_inspeksi: sanitizeExcelCell(insp.kode_inspeksi),
        plat: sanitizeExcelCell(insp.plat_tampil_snapshot),
        kelompok: sanitizeExcelCell(item.kelompok_snapshot),
        item: sanitizeExcelCell(item.nama_snapshot),
        status_item: sanitizeExcelCell(item.status),
        jenis_temuan: isFinding ? sanitizeExcelCell(item.jenis_temuan_snapshot) : '',
        catatan: sanitizeExcelCell(item.catatan || ''),
        alasan_tb: sanitizeExcelCell(item.alasan_tidak_berlaku || ''),
        status_temuan: isFinding ? sanitizeExcelCell(item.status_temuan || 'Terbuka') : '',
        jumlah_foto: Number(item.jumlah_foto || 0),
        tautan_bukti: Number(item.jumlah_foto || 0) > 0 ? detailLink : '',
      });
      detailRow.getCell('plat').numFmt = '@';
    }
  }

  wsRekap.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, wsRekap.rowCount), column: 21 },
  };
  wsDetail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, wsDetail.rowCount), column: 11 },
  };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const now = new Date();
  const wibParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});

  const filename = `Rekap_Inspeksi_Kendaraan_${wibParts.year}${wibParts.month}${wibParts.day}_${wibParts.hour}${wibParts.minute}.xlsx`;

  return {
    buffer: Buffer.from(arrayBuffer),
    filename,
    rowCount: inspections.length,
  };
}

function styleHeaderRow(ws: ExcelJS.Worksheet) {
  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0F2A47' },
  };
  header.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  header.height = 28;
}

/**
 * Konversi ISO timestamp ke Date yang merepresentasikan jam lokal WIB untuk Excel.
 */
function toWibExcelDate(iso: string): Date {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date();
  // Shift +7 jam untuk tampilan WIB konsisten di Excel
  return new Date(d.getTime() + 7 * 60 * 60 * 1000);
}
