import { v4 as uuidv4 } from 'uuid';
import { getDb } from '../db/database.js';

export interface AuditInput {
  pelakuId?: string | null;
  pelakuNama: string;
  entitas: string;
  idEntitas: string;
  aksi: string;
  nilaiSebelum?: unknown;
  nilaiSesudah?: unknown;
  alamatIp?: string | null;
}

/**
 * Mencatat entri audit ke tabel append-only audit_log (FR-AUD-01, NFR-14).
 */
export function recordAudit(input: AuditInput): string {
  const db = getDb();
  const id = uuidv4();
  const waktu = new Date().toISOString();
  db.prepare(
    `INSERT INTO audit_log (id, waktu, pelaku_id, pelaku_nama, entitas, id_entitas, aksi, nilai_sebelum, nilai_sesudah, alamat_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    waktu,
    input.pelakuId ?? null,
    input.pelakuNama,
    input.entitas,
    input.idEntitas,
    input.aksi,
    input.nilaiSebelum !== undefined ? JSON.stringify(input.nilaiSebelum) : null,
    input.nilaiSesudah !== undefined ? JSON.stringify(input.nilaiSesudah) : null,
    input.alamatIp ?? null
  );
  return id;
}
