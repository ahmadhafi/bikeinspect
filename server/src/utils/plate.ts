/**
 * Normalisasi dan validasi format plat nomor kendaraan Indonesia sesuai PRD Bagian 12.2:
 * Pola umum: 1-2 huruf kode wilayah + 1-4 angka + 0-3 huruf.
 * Contoh valid: "B 1234 KSP". Contoh tidak valid: "B 1234 K3P".
 */
const PLATE_REGEX = /^([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{0,3})$/;

export interface NormalizedPlate {
  valid: boolean;
  platNormal: string;
  platTampil: string;
  error?: string;
}

export function normalizeAndValidatePlate(raw: string): NormalizedPlate {
  const cleaned = (raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) {
    return {
      valid: false,
      platNormal: '',
      platTampil: '',
      error: 'Nomor plat tidak boleh kosong.',
    };
  }

  const compact = cleaned.replace(/\s+/g, '');
  const match = compact.match(PLATE_REGEX);
  if (!match) {
    return {
      valid: false,
      platNormal: compact,
      platTampil: cleaned,
      error: 'Format plat tidak valid. Periksa huruf dan angka (contoh: B 1234 KSP).',
    };
  }

  const [, area, digits, suffix] = match;
  const platNormal = `${area}${digits}${suffix}`;
  const platTampil = suffix ? `${area} ${digits} ${suffix}` : `${area} ${digits}`;

  return {
    valid: true,
    platNormal,
    platTampil,
  };
}

/**
 * Penyamaran NIK untuk peran Petugas (NFR-09): hanya menampilkan 3 digit terakhir.
 */
export function maskNikForRole(nik: string, role: string): string {
  if (role === 'PIC' || role === 'Admin') return nik;
  if (!nik || nik.length <= 3) return '***';
  return `${'*'.repeat(Math.max(3, nik.length - 3))}${nik.slice(-3)}`;
}

/**
 * Netralisasi formula injection untuk ekspor Excel (PRD Bagian 13.1).
 */
export function sanitizeExcelCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

/**
 * Format tanggal/waktu ke zona waktu WIB (Asia/Jakarta).
 */
export function formatWibDateTime(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d) + ' WIB';
}

import type { DatabaseSync } from 'node:sqlite';

export function generateInspectionCode(db: DatabaseSync): string {
  const now = new Date();
  const wibDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .replace(/-/g, '');

  const prefix = `INS-${wibDate}-`;
  const row = db
    .prepare('SELECT COUNT(*) as cnt FROM inspeksi WHERE kode_inspeksi LIKE ?')
    .get(`${prefix}%`) as { cnt: number };
  const seq = String((row?.cnt || 0) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}
