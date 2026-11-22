import * as XLSX from 'xlsx';
import { ApiError, getStoredInspectorName, validatePlateClient } from './api';

// ============================================================================
// Database Lokal Offline (IndexedDB + fallback localStorage) untuk Standalone
// Berjalan 100% tanpa internet & tanpa server di ponsel, tablet, dan desktop.
// ============================================================================

const IDB_NAME = 'bikeinspect_offline_db';
const IDB_STORE = 'state';
const IDB_KEY = 'main_db_v2';
const LS_FALLBACK_KEY = 'bikeinspect_offline_db_v2';

interface LocalDb {
  pengguna: Array<{ id: string; username: string; nama: string; peran: 'Petugas' | 'PIC' | 'Admin'; aktif: number; dibuat_pada: string; diubah_pada: string }>;
  karyawan: Array<{ id: string; nik: string; nama: string; departemen: string; aktif: number; dibuat_pada: string; diubah_pada: string }>;
  kendaraan: Array<{ id: string; plat_normal: string; plat_tampil: string; merek: string; tipe: string; tahun: number; warna: string; karyawan_id: string; status_akses: 'Aktif' | 'Ditangguhkan Sementara'; aktif: number; dibuat_pada: string; diubah_pada: string }>;
  permintaan_pendaftaran_kendaraan: Array<{ id: string; plat_normal: string; plat_tampil: string; catatan: string; pelapor_nama: string; status: string; dibuat_pada: string }>;
  parameter_pemeriksaan: Array<{ id: string; kelompok: string; nama: string; deskripsi: string; wajib: number; jenis_temuan: 'Fisik' | 'Administrasi'; boleh_tidak_berlaku: number; wajib_foto: number; acuan_jenis: string; acuan_teks: string; urutan: number; versi: number; aktif: number }>;
  inspeksi: Array<Record<string, unknown>>;
  inspeksi_item: Array<Record<string, unknown>>;
  bukti_foto: Array<{ id: string; inspeksi_item_id: string; nama_asli: string; jenis: 'Fisik' | 'Dokumen'; ukuran: number; tipe_mime: string; data_url: string; diambil_pada: string; diunggah_oleh: string }>;
  temuan: Array<{ id: string; inspeksi_id: string; inspeksi_item_id: string; status: 'Terbuka' | 'Terverifikasi Selesai'; item_verifikasi_id: string | null; diverifikasi_pada: string | null; dibuat_pada: string }>;
  teguran_manual: Array<{ id: string; inspeksi_id: string; dikirim_pada: string; saluran: string; catatan: string; dicatat_oleh_nama: string; dicatat_pada: string }>;
  addendum_inspeksi: Array<{ id: string; inspeksi_id: string; catatan: string; dibuat_oleh_nama: string; dibuat_pada: string }>;
  penangguhan_akses: Array<{ id: string; kendaraan_id: string; status: 'Aktif' | 'Dipulihkan'; alasan: string; berlaku_efektif_pada: string; dicatat_oleh_nama: string; dicatat_pada: string; pemulihan_efektif_pada: string | null; pemulihan_catatan: string | null; dipulihkan_oleh_nama: string | null; temuan_ids: string[] }>;
  audit_log: Array<{ id: string; waktu: string; pelaku_nama: string; entitas: string; id_entitas: string; aksi: string; nilai_sebelum: string | null; nilai_sesudah: string | null; alamat_ip: string }>;
  ekspor_log: Array<{ id: string; pengguna_nama: string; waktu: string; filter_json: string; jumlah_baris: number }>;
}

let memoryDb: LocalDb | null = null;

function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

function sanitizeCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return /^[=+\-@\t\r]/.test(str) ? `'${str}` : str;
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readDbFromStorage(): Promise<LocalDb | null> {
  const idb = await openIdb();
  if (idb) {
    const val = await new Promise<LocalDb | null>((resolve) => {
      try {
        const tx = idb.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve((req.result as LocalDb) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (val) return val;
  }
  try {
    const raw = localStorage.getItem(LS_FALLBACK_KEY);
    return raw ? (JSON.parse(raw) as LocalDb) : null;
  } catch {
    return null;
  }
}

async function saveDbToStorage(db: LocalDb): Promise<void> {
  memoryDb = db;
  const idb = await openIdb();
  if (idb) {
    await new Promise<void>((resolve) => {
      try {
        const tx = idb.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(db, IDB_KEY);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
    return;
  }
  try {
    localStorage.setItem(LS_FALLBACK_KEY, JSON.stringify(db));
  } catch {
    // ignore quota error if localStorage fallback is full
  }
}

function createSeedDb(): LocalDb {
  const now = new Date().toISOString();

  const parameter_pemeriksaan: LocalDb['parameter_pemeriksaan'] = [
    { id: 'p-1', kelompok: 'Administrasi', nama: 'SIM C Sesuai Golongan & Masa Berlaku', deskripsi: 'Pemeriksaan visual SIM C pengendara masih berlaku.', wajib: 1, jenis_temuan: 'Administrasi', boleh_tidak_berlaku: 0, wajib_foto: 0, acuan_jenis: 'Internal', acuan_teks: 'Ketentuan Keselamatan Berkendara Internal', urutan: 1, versi: 1, aktif: 1 },
    { id: 'p-2', kelompok: 'Administrasi', nama: 'STNK Kendaraan', deskripsi: 'Ketersediaan STNK kendaraan roda dua saat pemeriksaan.', wajib: 1, jenis_temuan: 'Administrasi', boleh_tidak_berlaku: 0, wajib_foto: 0, acuan_jenis: 'Internal', acuan_teks: 'Ketentuan Administrasi Kendaraan Area Kerja', urutan: 2, versi: 1, aktif: 1 },
    { id: 'p-3', kelompok: 'Administrasi', nama: 'Kesesuaian Identitas Kendaraan', deskripsi: 'Kesesuaian nomor plat, merek, tipe, dan warna dengan STNK (nama berbeda tidak otomatis temuan).', wajib: 1, jenis_temuan: 'Administrasi', boleh_tidak_berlaku: 0, wajib_foto: 0, acuan_jenis: 'Internal', acuan_teks: 'Prosedur Identifikasi Kendaraan', urutan: 3, versi: 1, aktif: 1 },
    { id: 'p-4', kelompok: 'Administrasi', nama: 'Masa Berlaku Dokumen & Pajak', deskripsi: 'Pencatatan visual masa berlaku pajak/STNK dan SIM.', wajib: 1, jenis_temuan: 'Administrasi', boleh_tidak_berlaku: 0, wajib_foto: 0, acuan_jenis: 'Internal', acuan_teks: 'Ketentuan Administrasi Kendaraan Area Kerja', urutan: 4, versi: 1, aktif: 1 },
    { id: 'p-5', kelompok: 'Administrasi', nama: 'Plat Nomor Depan & Belakang', deskripsi: 'Terpasang lengkap di depan dan belakang serta terbaca jelas.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Identifikasi Kendaraan', urutan: 5, versi: 1, aktif: 1 },
    { id: 'p-6', kelompok: 'Kelengkapan', nama: 'Lampu Utama', deskripsi: 'Lampu depan dekat dan jauh menyala normal.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 6, versi: 1, aktif: 1 },
    { id: 'p-7', kelompok: 'Kelengkapan', nama: 'Lampu Sein', deskripsi: 'Lampu sein kiri dan kanan depan-belakang berfungsi.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 7, versi: 1, aktif: 1 },
    { id: 'p-8', kelompok: 'Kelengkapan', nama: 'Lampu Rem', deskripsi: 'Lampu belakang dan lampu rem menyala saat tuas ditekan.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 8, versi: 1, aktif: 1 },
    { id: 'p-9', kelompok: 'Kelengkapan', nama: 'Klakson', deskripsi: 'Klakson berbunyi jelas dan berfungsi baik.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 9, versi: 1, aktif: 1 },
    { id: 'p-10', kelompok: 'Kelengkapan', nama: 'Dua Spion', deskripsi: 'Spion kiri dan kanan terpasang utuh dan tidak retak.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 10, versi: 1, aktif: 1 },
    { id: 'p-11', kelompok: 'Kelengkapan', nama: 'Knalpot', deskripsi: 'Knalpot standar pabrikan, tidak bising/modifikasi non-standar.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Kebijakan Kebisingan & Knalpot Standar Area Kerja', urutan: 11, versi: 1, aktif: 1 },
    { id: 'p-12', kelompok: 'Kondisi Teknis', nama: 'Kondisi Ban', deskripsi: 'Alur ban masih layak, tidak gundul atau retak parah.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelaikan Teknis Kendaraan', urutan: 12, versi: 1, aktif: 1 },
    { id: 'p-13', kelompok: 'Kondisi Teknis', nama: 'Rem Depan', deskripsi: 'Rem depan pakem dan tuas bekerja normal.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelaikan Teknis Kendaraan', urutan: 13, versi: 1, aktif: 1 },
    { id: 'p-14', kelompok: 'Kondisi Teknis', nama: 'Rem Belakang', deskripsi: 'Rem belakang pakem dan bekerja normal.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelaikan Teknis Kendaraan', urutan: 14, versi: 1, aktif: 1 },
    { id: 'p-15', kelompok: 'Kondisi Teknis', nama: 'Kebocoran Fluida', deskripsi: 'Tidak ada kebocoran oli mesin, bahan bakar, atau cairan rem.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 0, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Standar Kelaikan Teknis & Lingkungan', urutan: 15, versi: 1, aktif: 1 },
    { id: 'p-16', kelompok: 'Pengendara', nama: 'Helm SNI & Pengikat', deskripsi: 'Menggunakan helm berstandar SNI dengan tali pengikat terpasang.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 1, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Kebijakan APD Berkendara Perusahaan', urutan: 16, versi: 1, aktif: 1 },
    { id: 'p-17', kelompok: 'Pengendara', nama: 'Alas Kaki Tertutup', deskripsi: 'Menggunakan sepatu/alas kaki tertutup saat berkendara.', wajib: 1, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 1, wajib_foto: 1, acuan_jenis: 'Internal', acuan_teks: 'Kebijakan APD Berkendara Perusahaan', urutan: 17, versi: 1, aktif: 1 },
    { id: 'p-18', kelompok: 'Pengendara', nama: 'Perlengkapan Tambahan Perusahaan', deskripsi: 'Rompi reflektif atau kartu akses parkir sesuai kebijakan area (opsional).', wajib: 0, jenis_temuan: 'Fisik', boleh_tidak_berlaku: 1, wajib_foto: 0, acuan_jenis: 'Internal', acuan_teks: 'Kebijakan Area Parkir Perusahaan', urutan: 18, versi: 1, aktif: 1 },
  ];

  return {
    pengguna: [],
    karyawan: [],
    kendaraan: [],
    permintaan_pendaftaran_kendaraan: [],
    parameter_pemeriksaan,
    inspeksi: [],
    inspeksi_item: [],
    bukti_foto: [],
    temuan: [],
    teguran_manual: [],
    addendum_inspeksi: [],
    penangguhan_akses: [],
    audit_log: [
      {
        id: 'aud-init',
        waktu: now,
        pelaku_nama: 'Sistem Lokal',
        entitas: 'sistem',
        id_entitas: 'init',
        aksi: 'INISIALISASI_DATABASE_KOSONG',
        nilai_sebelum: null,
        nilai_sesudah: JSON.stringify({ parameterAktif: parameter_pemeriksaan.length }),
        alamat_ip: 'perangkat-lokal',
      },
    ],
    ekspor_log: [],
  };
}

async function getLocalDb(): Promise<LocalDb> {
  if (memoryDb) return memoryDb;
  const loaded = await readDbFromStorage();
  if (loaded) {
    memoryDb = loaded;
    return loaded;
  }
  const seeded = createSeedDb();
  await saveDbToStorage(seeded);
  return seeded;
}

function addAudit(db: LocalDb, entitas: string, idEntitas: string, aksi: string, nilaiSesudah?: unknown, nilaiSebelum?: unknown) {
  db.audit_log.unshift({
    id: uid(),
    waktu: new Date().toISOString(),
    pelaku_nama: getStoredInspectorName().trim() || 'Petugas Lapangan',
    entitas,
    id_entitas: idEntitas,
    aksi,
    nilai_sebelum: nilaiSebelum !== undefined ? JSON.stringify(nilaiSebelum) : null,
    nilai_sesudah: nilaiSesudah !== undefined ? JSON.stringify(nilaiSesudah) : null,
    alamat_ip: 'perangkat-lokal',
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

function filterInspections(db: LocalDb, params: URLSearchParams) {
  const includeDemo = params.get('includeDemo') === 'true';
  const q = (params.get('q') || '').trim().toLowerCase();
  const qCompact = q.replace(/\s+/g, '');
  const tMulai = params.get('tanggalMulai') || '';
  const tSelesai = params.get('tanggalSelesai') || '';
  const dept = params.get('departemen') || '';
  const hasil = params.get('hasil') || '';
  const statusAkses = params.get('statusAkses') || '';
  const statusTL = params.get('statusTindakLanjut') || '';

  return db.inspeksi
    .filter((i) => {
      if (i.status !== 'Final') return false;
      if (!includeDemo && Number(i.is_demo) === 1) return false;
      const veh = db.kendaraan.find((k) => k.id === i.kendaraan_id);
      const akses = veh?.status_akses || 'Aktif';
      if (q) {
        const plat = String(i.plat_tampil_snapshot || '').toLowerCase();
        const nama = String(i.nama_karyawan_snapshot || '').toLowerCase();
        const nik = String(i.nik_snapshot || '').toLowerCase();
        const kode = String(i.kode_inspeksi || '').toLowerCase();
        if (!plat.includes(q) && !plat.replace(/\s+/g, '').includes(qCompact) && !nama.includes(q) && !nik.includes(q) && !kode.includes(q)) {
          return false;
        }
      }
      const fin = String(i.difinalkan_pada || '');
      if (tMulai && fin < `${tMulai}T00:00:00.000Z`) return false;
      if (tSelesai && fin > `${tSelesai}T23:59:59.999Z`) return false;
      if (dept && i.departemen_snapshot !== dept) return false;
      if (hasil && i.hasil !== hasil) return false;
      if (statusAkses && akses !== statusAkses) return false;
      if (statusTL && i.status_tindak_lanjut !== statusTL) return false;
      return true;
    })
    .sort((a, b) => String(b.difinalkan_pada || '').localeCompare(String(a.difinalkan_pada || '')));
}

function buildInspectionDetail(db: LocalDb, id: string) {
  const insp = db.inspeksi.find((i) => i.id === id);
  if (!insp) throw new ApiError('Data inspeksi tidak ditemukan.', 404);
  const veh = db.kendaraan.find((k) => k.id === insp.kendaraan_id);
  const origin = insp.inspeksi_asal_id ? db.inspeksi.find((x) => x.id === insp.inspeksi_asal_id) : null;

  const items = db.inspeksi_item
    .filter((it) => it.inspeksi_id === id)
    .sort((a, b) => Number(a.urutan_snapshot) - Number(b.urutan_snapshot))
    .map((it) => {
      const tem = db.temuan.find((t) => t.inspeksi_item_id === it.id);
      const fotos = db.bukti_foto
        .filter((f) => f.inspeksi_item_id === it.id)
        .map((f) => ({
          id: f.id,
          nama_asli: f.nama_asli,
          jenis: f.jenis,
          ukuran: f.ukuran,
          tipe_mime: f.tipe_mime,
          diambil_pada: f.diambil_pada,
          signedUrl: f.data_url,
        }));
      return {
        ...it,
        temuan_id: tem?.id || null,
        temuan_status: tem?.status || null,
        diverifikasi_pada: tem?.diverifikasi_pada || null,
        fotos,
      } as Record<string, unknown>;
    });

  const teguran = db.teguran_manual
    .filter((t) => t.inspeksi_id === id)
    .sort((a, b) => b.dikirim_pada.localeCompare(a.dikirim_pada));

  const addendums = db.addendum_inspeksi
    .filter((a) => a.inspeksi_id === id)
    .sort((a, b) => b.dibuat_pada.localeCompare(a.dibuat_pada));

  const susp = db.penangguhan_akses.find((s) => s.kendaraan_id === insp.kendaraan_id && s.status === 'Aktif');
  const penangguhanAktif = susp
    ? {
        ...susp,
        temuanPenyebab: susp.temuan_ids
          .map((tid) => {
            const t = db.temuan.find((x) => x.id === tid);
            if (!t) return null;
            const ii = db.inspeksi_item.find((x) => x.id === t.inspeksi_item_id);
            const oi = db.inspeksi.find((x) => x.id === t.inspeksi_id);
            return {
              id: t.id,
              status: t.status,
              nama_snapshot: String(ii?.nama_snapshot || '-'),
              kode_inspeksi: String(oi?.kode_inspeksi || '-'),
              inspeksi_id: t.inspeksi_id,
            };
          })
          .filter(Boolean),
      }
    : null;

  const inspeksiUlang = db.inspeksi
    .filter((x) => x.inspeksi_asal_id === id)
    .map((x) => ({
      id: x.id,
      kode_inspeksi: x.kode_inspeksi,
      status: x.status,
      hasil: x.hasil,
      difinalkan_pada: x.difinalkan_pada,
      dibuat_pada: x.dibuat_pada,
    }));

  const auditHistory = db.audit_log
    .filter((a) => a.id_entitas === id || (susp && a.id_entitas === susp.id))
    .slice(0, 30);

  return {
    ...insp,
    status_akses_kendaraan: veh?.status_akses || 'Aktif',
    kode_inspeksi_asal: origin?.kode_inspeksi || null,
    items,
    counts: {
      total: items.length,
      sesuai: items.filter((i) => i.status === 'Sesuai').length,
      tidakSesuai: items.filter((i) => i.status === 'Tidak Sesuai').length,
      tidakBerlaku: items.filter((i) => i.status === 'Tidak Berlaku').length,
      belumDiperiksa: items.filter((i) => i.status === 'Belum Diperiksa').length,
    },
    teguranManual: {
      status: teguran.length > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
      jumlah: teguran.length,
      riwayat: teguran,
    },
    addendums,
    penangguhanAktif,
    inspeksiUlang,
    auditHistory,
  };
}

// ============================================================================
// Ekspor Excel (.xlsx) Asli 100% Offline di Browser (PRD Bagian 13)
// ============================================================================
export async function exportOfflineExcel(queryString: string): Promise<void> {
  const db = await getLocalDb();
  const params = new URLSearchParams(queryString);
  const filtered = filterInspections(db, params);
  if (filtered.length === 0) {
    throw new ApiError('Tidak ada data untuk diekspor sesuai filter aktif.', 400);
  }

  const rekapRows = filtered.map((insp) => {
    const items = db.inspeksi_item.filter((it) => it.inspeksi_id === insp.id);
    const findings = items.filter((it) => it.status === 'Tidak Sesuai');
    const veh = db.kendaraan.find((k) => k.id === insp.kendaraan_id);
    const origin = insp.inspeksi_asal_id ? db.inspeksi.find((x) => x.id === insp.inspeksi_asal_id) : null;
    const teg = db.teguran_manual.filter((t) => t.inspeksi_id === insp.id);
    const susp = db.penangguhan_akses.find((s) => s.kendaraan_id === insp.kendaraan_id && s.status === 'Aktif');
    return {
      'ID Inspeksi': sanitizeCell(insp.kode_inspeksi),
      'Waktu Inspeksi': sanitizeCell(insp.difinalkan_pada),
      'Jenis Inspeksi': sanitizeCell(insp.jenis),
      'ID Inspeksi Asal': sanitizeCell(origin?.kode_inspeksi || ''),
      'Plat Nomor': sanitizeCell(insp.plat_tampil_snapshot),
      'Merek/Tipe': sanitizeCell(insp.merek_tipe_snapshot),
      Tahun: Number(insp.tahun_snapshot),
      Warna: sanitizeCell(insp.warna_snapshot),
      'Nama Karyawan': sanitizeCell(insp.nama_karyawan_snapshot),
      NIK: sanitizeCell(insp.nik_snapshot),
      Departemen: sanitizeCell(insp.departemen_snapshot),
      Petugas: sanitizeCell(insp.petugas_nama),
      'Hasil Inspeksi': sanitizeCell(insp.hasil),
      'Jumlah Temuan': findings.length,
      'Ringkasan Temuan': sanitizeCell(findings.map((f) => String(f.nama_snapshot)).join(', ')),
      'Status Tindak Lanjut': sanitizeCell(insp.status_tindak_lanjut),
      'Status Teguran Manual': teg.length > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
      'Waktu Teguran Manual Terakhir': teg.length > 0 ? sanitizeCell(teg[0].dikirim_pada) : '',
      'Status Akses Kendaraan': sanitizeCell(veh?.status_akses || 'Aktif'),
      'Waktu Efektif Penangguhan': susp ? sanitizeCell(susp.berlaku_efektif_pada) : '',
      'Tautan Bukti': `Lokal: #/inspeksi/${insp.id}`,
    };
  });

  const detailRows: Array<Record<string, unknown>> = [];
  for (const insp of filtered) {
    const items = db.inspeksi_item
      .filter((it) => it.inspeksi_id === insp.id)
      .sort((a, b) => Number(a.urutan_snapshot) - Number(b.urutan_snapshot));
    for (const it of items) {
      const isFinding = it.status === 'Tidak Sesuai';
      const tem = db.temuan.find((t) => t.inspeksi_item_id === it.id);
      const fotoCount = db.bukti_foto.filter((f) => f.inspeksi_item_id === it.id).length;
      detailRows.push({
        'ID Inspeksi': sanitizeCell(insp.kode_inspeksi),
        'Plat Nomor': sanitizeCell(insp.plat_tampil_snapshot),
        Kelompok: sanitizeCell(it.kelompok_snapshot),
        'Item Pemeriksaan': sanitizeCell(it.nama_snapshot),
        'Status Item': sanitizeCell(it.status),
        'Jenis Temuan': isFinding ? sanitizeCell(it.jenis_temuan_snapshot) : '',
        Catatan: sanitizeCell(it.catatan || ''),
        'Alasan Tidak Berlaku': sanitizeCell(it.alasan_tidak_berlaku || ''),
        'Status Temuan': isFinding ? sanitizeCell(tem?.status || 'Terbuka') : '',
        'Jumlah Foto Bukti': fotoCount,
        'Tautan Bukti': fotoCount > 0 ? `Lokal: #/inspeksi/${insp.id}` : '',
      });
    }
  }

  const wb = XLSX.utils.book_new();
  const wsRekap = XLSX.utils.json_to_sheet(rekapRows);
  const wsDetail = XLSX.utils.json_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsRekap, 'Rekap Inspeksi');
  XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail Pemeriksaan');

  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = `Rekap_Inspeksi_Kendaraan_${stamp}.xlsx`;
  XLSX.writeFile(wb, filename);

  db.ekspor_log.unshift({
    id: uid(),
    pengguna_nama: getStoredInspectorName().trim() || 'Petugas Lapangan',
    waktu: now.toISOString(),
    filter_json: queryString,
    jumlah_baris: filtered.length,
  });
  addAudit(db, 'ekspor_log', filename, 'EKSPOR_EXCEL_LOKAL', { filename, jumlahBaris: filtered.length });
  await saveDbToStorage(db);
}

// ============================================================================
// Backup & Restore Database JSON (untuk sinkronisasi antar tablet/ponsel)
// ============================================================================
export async function exportLocalDatabaseJson(): Promise<void> {
  const db = await getLocalDb();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `backup_bikeinspect_${d}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function importLocalDatabaseJson(file: File): Promise<void> {
  const text = await file.text();
  const parsed = JSON.parse(text) as LocalDb;
  if (!parsed || !Array.isArray(parsed.kendaraan) || !Array.isArray(parsed.inspeksi)) {
    throw new Error('Format berkas backup JSON tidak valid.');
  }
  await saveDbToStorage(parsed);
}

// ============================================================================
// Router API Lokal (meniru seluruh endpoint Express di browser)
// ============================================================================
export async function handleLocalApi<T>(rawUrl: string, options: RequestInit = {}): Promise<T> {
  const db = await getLocalDb();
  const method = (options.method || 'GET').toUpperCase();
  const [pathname, qs = ''] = rawUrl.split('?');
  const params = new URLSearchParams(qs);
  const inspectorName = getStoredInspectorName().trim() || 'Petugas Lapangan';

  let body: Record<string, unknown> = {};
  if (typeof options.body === 'string' && options.body) {
    body = JSON.parse(options.body) as Record<string, unknown>;
  }

  // 1. Auth
  if (pathname === '/api/auth/me') {
    return {
      user: { id: 'local-inspector', username: 'lokal', nama: inspectorName, peran: 'PIC' },
      ocrMode: 'Demo',
      disableAuth: true,
    } as T;
  }

  // 2. Dashboard summary
  if (pathname === '/api/dashboard/summary') {
    const today = new Date().toISOString().slice(0, 10);
    const finals = db.inspeksi.filter((i) => i.status === 'Final' && Number(i.is_demo) === 0);
    const todayCount = finals.filter((i) => String(i.difinalkan_pada || '').startsWith(today)).length;
    const openFindings = db.temuan.filter((t) => t.status === 'Terbuka').length;
    const suspended = db.penangguhan_akses.filter((s) => s.status === 'Aktif').length;
    const drafts = db.inspeksi
      .filter((i) => i.status === 'Draf')
      .sort((a, b) => String(b.diubah_pada).localeCompare(String(a.diubah_pada)))
      .slice(0, 5);
    const recent = db.inspeksi
      .filter((i) => i.status === 'Final')
      .sort((a, b) => String(b.difinalkan_pada).localeCompare(String(a.difinalkan_pada)))
      .slice(0, 5)
      .map((i) => ({
        ...i,
        status_akses: db.kendaraan.find((k) => k.id === i.kendaraan_id)?.status_akses || 'Aktif',
      }));
    return {
      inspeksiHariIni: todayCount,
      temuanBelumSelesai: openFindings,
      aksesDitangguhkan: suspended,
      drafAktif: drafts,
      inspeksiTerbaru: recent,
    } as T;
  }

  // 3. Scan OCR (Mode Demo Lokal)
  if (pathname === '/api/scan/ocr' && method === 'POST') {
    const fd = options.body instanceof FormData ? options.body : null;
    const scenario = String(fd?.get('demoScenario') || '').toLowerCase();
    const photo = fd?.get('photo') as File | null;
    const hint = `${photo?.name || ''} ${scenario}`.toLowerCase();

    if (hint.includes('blur')) {
      return { ocrId: uid(), mode: 'Demo', isDemo: true, status: 'Buram', platMentah: null, platNormal: null, platTampil: null, formatValid: false, keyakinan: 0.3, keyakinanRendah: true, kandidat: [], pesan: 'Foto kurang jelas. Dekatkan kamera, stabilkan, lalu Scan Ulang.' } as T;
    }
    if (hint.includes('not_found')) {
      return { ocrId: uid(), mode: 'Demo', isDemo: true, status: 'Gagal', platMentah: null, platNormal: null, platTampil: null, formatValid: false, keyakinan: 0, keyakinanRendah: true, kandidat: [], pesan: 'Plat tidak terdeteksi pada foto. Silakan Scan Ulang atau Input Manual.' } as T;
    }
    if (hint.includes('k3p')) {
      return { ocrId: uid(), mode: 'Demo', isDemo: true, status: 'Berhasil', platMentah: 'B 1234 K3P', platNormal: 'B1234K3P', platTampil: 'B 1234 K3P', formatValid: false, keyakinan: 0.72, keyakinanRendah: true, kandidat: ['B 1234 K3P', 'B 1234 KSP'], petunjukMasaBerlaku: '08·28', pesan: 'Keyakinan rendah — periksa teliti huruf dan angka sebelum konfirmasi.' } as T;
    }
    const chosen = hint.includes('xyz') ? 'B 5678 XYZ' : 'B 1234 KSP';
    return {
      ocrId: uid(), mode: 'Demo', isDemo: true, status: 'Berhasil',
      platMentah: chosen, platNormal: chosen.replace(/\s+/g, ''), platTampil: chosen,
      formatValid: true, keyakinan: 0.94, keyakinanRendah: false, kandidat: [chosen],
      petunjukMasaBerlaku: '08·28',
      pesan: 'Usulan OCR (Mode Demo Offline) siap diperiksa. Edit bila perlu lalu tekan Konfirmasi Plat.',
    } as T;
  }

  // 4. Confirm Plate
  if (pathname === '/api/scan/confirm-plate' && method === 'POST') {
    const check = validatePlateClient(String(body.plate || ''));
    if (!check.valid) throw new ApiError(check.error || 'Format plat tidak valid.', 400);
    const platNormal = check.formatted.replace(/\s+/g, '');
    const matches = db.kendaraan
      .filter((k) => k.aktif === 1 && k.plat_normal.toUpperCase() === platNormal)
      .map((k) => {
        const emp = db.karyawan.find((e) => e.id === k.karyawan_id)!;
        const susp = db.penangguhan_akses.find((s) => s.kendaraan_id === k.id && s.status === 'Aktif');
        return {
          id: k.id, platNormal: k.plat_normal, platTampil: k.plat_tampil, merek: k.merek, tipe: k.tipe, tahun: k.tahun, warna: k.warna, statusAkses: k.status_akses,
          karyawan: { id: emp.id, nama: emp.nama, nik: emp.nik, departemen: emp.departemen },
          penangguhanAktif: susp ? { id: susp.id, alasan: susp.alasan, berlakuEfektifPada: susp.berlaku_efektif_pada } : null,
        };
      });

    if (matches.length === 0) {
      return { matchStatus: 'unregistered', platNormal, platTampil: check.formatted, vehicles: [], pesan: 'Kendaraan Belum Terdaftar di database lokal.' } as T;
    }
    if (matches.length > 1) {
      return { matchStatus: 'multiple', platNormal, platTampil: check.formatted, vehicles: matches, pesan: 'Ditemukan lebih dari satu kendaraan aktif.' } as T;
    }
    return { matchStatus: 'matched', platNormal, platTampil: check.formatted, vehicles: matches, vehicle: matches[0] } as T;
  }

  // 5. Report Unregistered
  if (pathname === '/api/scan/report-unregistered' && method === 'POST') {
    const check = validatePlateClient(String(body.plate || ''));
    if (!check.valid) throw new ApiError(check.error || 'Format plat tidak valid.', 400);
    const id = uid();
    db.permintaan_pendaftaran_kendaraan.unshift({
      id, plat_normal: check.formatted.replace(/\s+/g, ''), plat_tampil: check.formatted,
      catatan: String(body.catatan || ''), pelapor_nama: inspectorName, status: 'Menunggu', dibuat_pada: new Date().toISOString(),
    });
    addAudit(db, 'permintaan_pendaftaran_kendaraan', id, 'LAPOR_KENDARAAN_BELUM_TERDAFTAR', { plat: check.formatted });
    await saveDbToStorage(db);
    return { id, platTampil: check.formatted, pesan: 'Laporan kendaraan belum terdaftar tersimpan.' } as T;
  }

  // 5b. Pendaftaran cepat kendaraan & pemilik langsung saat inspeksi
  if (pathname === '/api/scan/quick-register' && method === 'POST') {
    const check = validatePlateClient(String(body.plate || ''));
    if (!check.valid) throw new ApiError(check.error || 'Format plat tidak valid.', 400);
    const namaKaryawan = String(body.namaKaryawan || '').trim();
    const merek = String(body.merek || '').trim();
    const tipe = String(body.tipe || '').trim();
    const warna = String(body.warna || '').trim();
    if (!namaKaryawan || !merek || !tipe || !warna) {
      throw new ApiError('Nama pemilik, merek, tipe, dan warna kendaraan wajib diisi.', 400);
    }

    const now = new Date().toISOString();
    const cleanNik = String(body.nik || '').trim() || `NIK-${Date.now().toString().slice(-6)}`;
    const cleanDept = String(body.departemen || '').trim() || '-';

    let emp = db.karyawan.find((e) => e.nik.toLowerCase() === cleanNik.toLowerCase());
    if (!emp) {
      emp = {
        id: uid(),
        nik: cleanNik,
        nama: namaKaryawan,
        departemen: cleanDept,
        aktif: 1,
        dibuat_pada: now,
        diubah_pada: now,
      };
      db.karyawan.push(emp);
    }

    const platNormal = check.formatted.replace(/\s+/g, '');
    const tahun = Number(body.tahun) || new Date().getFullYear();
    const veh = {
      id: uid(),
      plat_normal: platNormal,
      plat_tampil: check.formatted,
      merek,
      tipe,
      tahun,
      warna,
      karyawan_id: emp.id,
      status_akses: 'Aktif' as const,
      aktif: 1,
      dibuat_pada: now,
      diubah_pada: now,
    };
    db.kendaraan.unshift(veh);
    addAudit(db, 'kendaraan', veh.id, 'DAFTAR_CEPAT_SAAT_INSPEKSI', {
      plat: veh.plat_tampil,
      pemilik: emp.nama,
      merek,
      tipe,
      tahun,
      warna,
    });
    await saveDbToStorage(db);

    return {
      vehicle: {
        id: veh.id,
        platNormal: veh.plat_normal,
        platTampil: veh.plat_tampil,
        merek: veh.merek,
        tipe: veh.tipe,
        tahun: veh.tahun,
        warna: veh.warna,
        statusAkses: 'Aktif',
        karyawan: { id: emp.id, nama: emp.nama, nik: emp.nik, departemen: emp.departemen },
        penangguhanAktif: null,
      },
    } as T;
  }

  // 6. Create Inspection Draft
  if (pathname === '/api/inspections' && method === 'POST') {
    const jenis = body.jenis === 'Ulang' ? 'Ulang' : 'Awal';
    const isDemo = Boolean(body.isDemo);
    let kendaraanId = String(body.kendaraanId || '');
    let originItems: Array<{ temuanId: string; item: Record<string, unknown> }> = [];

    if (jenis === 'Ulang') {
      const origin = db.inspeksi.find((i) => i.id === body.inspeksiAsalId && i.status === 'Final');
      if (!origin) throw new ApiError('Inspeksi asal tidak ditemukan.', 404);
      kendaraanId = String(origin.kendaraan_id);
      originItems = db.temuan
        .filter((t) => t.inspeksi_id === origin.id && t.status === 'Terbuka')
        .map((t) => ({ temuanId: t.id, item: db.inspeksi_item.find((ii) => ii.id === t.inspeksi_item_id)! }))
        .filter((x) => Boolean(x.item));
      if (originItems.length === 0) throw new ApiError('Tidak ada temuan terbuka untuk diinspeksi ulang.', 400);
    }

    const veh = db.kendaraan.find((k) => k.id === kendaraanId && k.aktif === 1);
    if (!veh) throw new ApiError('Kendaraan tidak ditemukan.', 404);
    const emp = db.karyawan.find((e) => e.id === veh.karyawan_id)!;

    const existingDraft = db.inspeksi.find((i) => i.kendaraan_id === kendaraanId && i.status === 'Draf' && i.jenis === jenis);
    if (existingDraft) {
      return { id: existingDraft.id, kodeInspeksi: existingDraft.kode_inspeksi, reusedDraft: true } as T;
    }

    const now = new Date().toISOString();
    const id = uid();
    const datePart = now.slice(0, 10).replace(/-/g, '');
    const seq = String(db.inspeksi.length + 1).padStart(4, '0');
    const kode = `INS-${datePart}-${seq}`;

    db.inspeksi.push({
      id, kode_inspeksi: kode, kendaraan_id: veh.id,
      karyawan_id_snapshot: emp.id, nama_karyawan_snapshot: emp.nama, nik_snapshot: emp.nik, departemen_snapshot: emp.departemen,
      plat_tampil_snapshot: veh.plat_tampil, merek_tipe_snapshot: `${veh.merek} ${veh.tipe}`, tahun_snapshot: veh.tahun, warna_snapshot: veh.warna,
      petugas_id: 'local-inspector', petugas_nama: inspectorName, jenis, inspeksi_asal_id: jenis === 'Ulang' ? body.inspeksiAsalId : null,
      status: 'Draf', hasil: null, status_tindak_lanjut: 'Tidak Perlu', kunci_idempotensi: null, is_demo: isDemo ? 1 : 0,
      masa_berlaku_sim: null, masa_berlaku_stnk_pajak: null, catatan_umum: null,
      dibuat_pada: now, diubah_pada: now, difinalkan_pada: null,
    });

    if (jenis === 'Ulang') {
      for (const oi of originItems) {
        db.inspeksi_item.push({
          ...oi.item,
          id: uid(), inspeksi_id: id, wajib_snapshot: 1,
          status: 'Belum Diperiksa', catatan: null, alasan_tidak_berlaku: null, temuan_asal_id: oi.temuanId,
        });
      }
    } else {
      for (const p of db.parameter_pemeriksaan.filter((x) => x.aktif === 1).sort((a, b) => a.urutan - b.urutan)) {
        db.inspeksi_item.push({
          id: uid(), inspeksi_id: id, parameter_id: p.id, parameter_versi: p.versi,
          kelompok_snapshot: p.kelompok, nama_snapshot: p.nama, deskripsi_snapshot: p.deskripsi,
          wajib_snapshot: p.wajib, jenis_temuan_snapshot: p.jenis_temuan, boleh_tidak_berlaku_snapshot: p.boleh_tidak_berlaku,
          wajib_foto_snapshot: p.wajib_foto, acuan_jenis_snapshot: p.acuan_jenis, acuan_teks_snapshot: p.acuan_teks,
          urutan_snapshot: p.urutan, status: 'Belum Diperiksa', catatan: null, alasan_tidak_berlaku: null, temuan_asal_id: null,
        });
      }
    }

    addAudit(db, 'inspeksi', id, jenis === 'Ulang' ? 'BUAT_DRAF_INSPEKSI_ULANG' : 'BUAT_DRAF_INSPEKSI', { kode, plat: veh.plat_tampil });
    await saveDbToStorage(db);
    return { id, kodeInspeksi: kode } as T;
  }

  // 7. List Inspections
  if (pathname === '/api/inspections' && method === 'GET') {
    const page = Math.max(1, Number(params.get('page') || 1));
    const pageSize = Math.min(100, Math.max(1, Number(params.get('pageSize') || 15)));
    const filtered = filterInspections(db, params);
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize).map((i) => {
      const veh = db.kendaraan.find((k) => k.id === i.kendaraan_id);
      const findings = db.inspeksi_item.filter((it) => it.inspeksi_id === i.id && it.status === 'Tidak Sesuai').length;
      const teg = db.teguran_manual.filter((t) => t.inspeksi_id === i.id).length;
      return {
        ...i,
        status_akses: veh?.status_akses || 'Aktif',
        jumlah_temuan: findings,
        jumlah_teguran: teg,
        status_teguran_manual: teg > 0 ? 'Sudah Dicatat' : 'Belum Dicatat',
      };
    });
    return { items: slice, total: filtered.length, page, pageSize, totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)) } as T;
  }

  // 8. Inspection sub-routes
  const inspMatch = pathname.match(/^\/api\/inspections\/([^/]+)(?:\/(.*))?$/);
  if (inspMatch) {
    const inspId = inspMatch[1];
    const sub = inspMatch[2] || '';

    if (!sub && method === 'GET') {
      return buildInspectionDetail(db, inspId) as T;
    }

    if (sub === 'draft' && method === 'PUT') {
      const insp = db.inspeksi.find((i) => i.id === inspId);
      if (!insp || insp.status !== 'Draf') throw new ApiError('Inspeksi bukan draf.', 400);
      const now = new Date().toISOString();
      insp.masa_berlaku_sim = body.masaBerlakuSim || null;
      insp.masa_berlaku_stnk_pajak = body.masaBerlakuStnkPajak || null;
      insp.catatan_umum = body.catatanUmum || null;
      insp.petugas_nama = inspectorName;
      insp.diubah_pada = now;
      for (const it of (body.items as Array<Record<string, unknown>>) || []) {
        const target = db.inspeksi_item.find((x) => x.id === it.id && x.inspeksi_id === inspId);
        if (target) {
          target.status = it.status;
          target.catatan = typeof it.catatan === 'string' ? it.catatan.trim() : null;
          target.alasan_tidak_berlaku = typeof it.alasan_tidak_berlaku === 'string' ? it.alasan_tidak_berlaku.trim() : null;
        }
      }
      await saveDbToStorage(db);
      return { ok: true, savedAt: now } as T;
    }

    if (sub === 'discard' && method === 'POST') {
      const insp = db.inspeksi.find((i) => i.id === inspId);
      if (!insp || insp.status !== 'Draf') throw new ApiError('Hanya draf yang dapat dibuang.', 400);
      insp.status = 'Dibuang';
      insp.diubah_pada = new Date().toISOString();
      addAudit(db, 'inspeksi', inspId, 'BUANG_DRAF_INSPEKSI', { status: 'Dibuang' });
      await saveDbToStorage(db);
      return { ok: true } as T;
    }

    // Photo upload / delete
    const photoMatch = sub.match(/^items\/([^/]+)\/photos(?:\/([^/]+))?$/);
    if (photoMatch) {
      const itemId = photoMatch[1];
      const photoId = photoMatch[2];
      if (method === 'POST') {
        const fd = options.body instanceof FormData ? options.body : null;
        const file = fd?.get('photo') as File | null;
        if (!file) throw new ApiError('Foto wajib dipilih.', 400);
        const existing = db.bukti_foto.filter((f) => f.inspeksi_item_id === itemId);
        if (existing.length >= 5) throw new ApiError('Maksimal 5 foto bukti per item.', 400);
        const item = db.inspeksi_item.find((x) => x.id === itemId);
        const dataUrl = await fileToDataUrl(file);
        const newPhoto = {
          id: uid(),
          inspeksi_item_id: itemId,
          nama_asli: file.name || `bukti_${Date.now()}.jpg`,
          jenis: (item?.jenis_temuan_snapshot === 'Administrasi' ? 'Dokumen' : 'Fisik') as 'Fisik' | 'Dokumen',
          ukuran: file.size,
          tipe_mime: file.type || 'image/jpeg',
          data_url: dataUrl,
          diambil_pada: new Date().toISOString(),
          diunggah_oleh: inspectorName,
        };
        db.bukti_foto.push(newPhoto);
        addAudit(db, 'bukti_foto', newPhoto.id, 'UNGGAH_FOTO_BUKTI_LOKAL', { itemId });
        await saveDbToStorage(db);
        return {
          id: newPhoto.id, nama_asli: newPhoto.nama_asli, jenis: newPhoto.jenis,
          ukuran: newPhoto.ukuran, tipe_mime: newPhoto.tipe_mime, diambil_pada: newPhoto.diambil_pada, signedUrl: newPhoto.data_url,
        } as T;
      }
      if (method === 'DELETE' && photoId) {
        db.bukti_foto = db.bukti_foto.filter((f) => f.id !== photoId);
        await saveDbToStorage(db);
        return { ok: true } as T;
      }
    }

    if (sub === 'finalize' && method === 'POST') {
      const idempKey = String(body.idempotencyKey || '');
      const replay = db.inspeksi.find((i) => i.kunci_idempotensi && i.kunci_idempotensi === idempKey);
      if (replay) return { id: replay.id, status: replay.status, hasil: replay.hasil, idempotentReplay: true } as T;

      const insp = db.inspeksi.find((i) => i.id === inspId);
      if (!insp) throw new ApiError('Inspeksi tidak ditemukan.', 404);
      if (insp.status === 'Final') return { id: insp.id, status: 'Final', hasil: insp.hasil, idempotentReplay: true } as T;

      const now = new Date().toISOString();
      insp.masa_berlaku_sim = body.masaBerlakuSim ?? insp.masa_berlaku_sim ?? null;
      insp.masa_berlaku_stnk_pajak = body.masaBerlakuStnkPajak ?? insp.masa_berlaku_stnk_pajak ?? null;
      insp.petugas_nama = inspectorName;
      for (const it of (body.items as Array<Record<string, unknown>>) || []) {
        const target = db.inspeksi_item.find((x) => x.id === it.id && x.inspeksi_id === inspId);
        if (target) {
          target.status = it.status;
          target.catatan = typeof it.catatan === 'string' ? it.catatan.trim() : null;
          target.alasan_tidak_berlaku = typeof it.alasan_tidak_berlaku === 'string' ? it.alasan_tidak_berlaku.trim() : null;
        }
      }

      const dbItems = db.inspeksi_item.filter((x) => x.inspeksi_id === inspId).sort((a, b) => Number(a.urutan_snapshot) - Number(b.urutan_snapshot));
      const errors: Array<{ itemId: string; nama: string; pesan: string }> = [];
      for (const it of dbItems) {
        const itemId = String(it.id);
        const nama = String(it.nama_snapshot);
        const status = String(it.status);
        const fotos = db.bukti_foto.filter((f) => f.inspeksi_item_id === itemId).length;
        if (Number(it.wajib_snapshot) === 1 && status === 'Belum Diperiksa') {
          errors.push({ itemId, nama, pesan: `Item wajib "${nama}" masih Belum Diperiksa.` });
        } else if (status === 'Tidak Berlaku') {
          if (Number(it.boleh_tidak_berlaku_snapshot) !== 1) errors.push({ itemId, nama, pesan: `Item "${nama}" tidak mengizinkan Tidak Berlaku.` });
          else if (!String(it.alasan_tidak_berlaku || '').trim()) errors.push({ itemId, nama, pesan: `Alasan wajib diisi untuk Tidak Berlaku pada "${nama}".` });
        } else if (status === 'Tidak Sesuai') {
          if (!String(it.catatan || '').trim()) errors.push({ itemId, nama, pesan: `Catatan temuan wajib diisi untuk "${nama}".` });
          if (it.jenis_temuan_snapshot === 'Fisik' && Number(it.wajib_foto_snapshot) === 1 && fotos < 1) {
            errors.push({ itemId, nama, pesan: `Foto bukti wajib dilampirkan minimal 1 foto untuk temuan fisik "${nama}".` });
          }
        }
      }
      if (errors.length > 0) throw new ApiError(errors[0].pesan, 422, { validationErrors: errors });

      const findings = dbItems.filter((x) => x.status === 'Tidak Sesuai');
      const hasil = findings.length > 0 ? 'Ada Temuan' : 'Sesuai Seluruhnya';
      const statusTL = findings.length > 0 ? 'Menunggu Tindak Lanjut PIC' : 'Tidak Perlu';

      insp.status = 'Final';
      insp.hasil = hasil;
      insp.status_tindak_lanjut = statusTL;
      insp.kunci_idempotensi = idempKey || uid();
      insp.difinalkan_pada = now;
      insp.diubah_pada = now;

      for (const fi of findings) {
        db.temuan.push({ id: uid(), inspeksi_id: inspId, inspeksi_item_id: String(fi.id), status: 'Terbuka', item_verifikasi_id: null, diverifikasi_pada: null, dibuat_pada: now });
      }

      if (insp.jenis === 'Ulang' && insp.inspeksi_asal_id) {
        for (const it of dbItems) {
          if (it.temuan_asal_id && it.status === 'Sesuai') {
            const t = db.temuan.find((x) => x.id === it.temuan_asal_id);
            if (t) {
              t.status = 'Terverifikasi Selesai';
              t.item_verifikasi_id = String(it.id);
              t.diverifikasi_pada = now;
            }
          }
        }
        const origin = db.inspeksi.find((x) => x.id === insp.inspeksi_asal_id);
        if (origin) {
          const remOpen = db.temuan.filter((t) => t.inspeksi_id === origin.id && t.status === 'Terbuka').length;
          const actSusp = db.penangguhan_akses.find((s) => s.kendaraan_id === insp.kendaraan_id && s.status === 'Aktif');
          if (remOpen === 0 && !actSusp) origin.status_tindak_lanjut = 'Selesai';
          else if (findings.length > 0) origin.status_tindak_lanjut = 'Dalam Proses';
        }
      }

      addAudit(db, 'inspeksi', inspId, 'FINALISASI_INSPEKSI', { hasil, jumlahTemuan: findings.length });
      await saveDbToStorage(db);
      return { id: inspId, kodeInspeksi: insp.kode_inspeksi, status: 'Final', hasil, statusTindakLanjut: statusTL, difinalkanPada: now } as T;
    }

    if (sub === 'teguran-manual' && method === 'POST') {
      const insp = db.inspeksi.find((i) => i.id === inspId && i.status === 'Final');
      if (!insp) throw new ApiError('Inspeksi tidak ditemukan.', 404);
      const id = uid();
      const now = new Date().toISOString();
      db.teguran_manual.push({
        id, inspeksi_id: inspId, dikirim_pada: String(body.dikirimPada || now),
        saluran: String(body.saluran || 'Email Manual'), catatan: String(body.catatan || '').trim(),
        dicatat_oleh_nama: inspectorName, dicatat_pada: now,
      });
      if (insp.status_tindak_lanjut === 'Menunggu Tindak Lanjut PIC') insp.status_tindak_lanjut = 'Dalam Proses';
      addAudit(db, 'inspeksi', inspId, 'CATAT_TEGURAN_MANUAL', { catatan: body.catatan });
      await saveDbToStorage(db);
      return { id } as T;
    }

    if (sub === 'addendum' && method === 'POST') {
      const id = uid();
      db.addendum_inspeksi.push({ id, inspeksi_id: inspId, catatan: String(body.catatan || '').trim(), dibuat_oleh_nama: inspectorName, dibuat_pada: new Date().toISOString() });
      addAudit(db, 'inspeksi', inspId, 'TAMBAH_ADDENDUM', { catatan: body.catatan });
      await saveDbToStorage(db);
      return { id } as T;
    }

    if (sub === 'status-tindak-lanjut' && method === 'PATCH') {
      const insp = db.inspeksi.find((i) => i.id === inspId);
      if (!insp) throw new ApiError('Inspeksi tidak ditemukan.', 404);
      insp.status_tindak_lanjut = String(body.statusBaru);
      addAudit(db, 'inspeksi', inspId, 'UBAH_STATUS_TINDAK_LANJUT', { statusBaru: body.statusBaru, catatan: body.catatan });
      await saveDbToStorage(db);
      return { ok: true } as T;
    }
  }

  // 9. Suspensions
  if (pathname === '/api/suspensions' && method === 'POST') {
    const veh = db.kendaraan.find((k) => k.id === body.kendaraanId);
    if (!veh) throw new ApiError('Kendaraan tidak ditemukan.', 404);
    if (db.penangguhan_akses.some((s) => s.kendaraan_id === veh.id && s.status === 'Aktif')) {
      throw new ApiError('Kendaraan ini sudah memiliki penangguhan aktif.', 409);
    }
    const id = uid();
    const now = new Date().toISOString();
    db.penangguhan_akses.push({
      id, kendaraan_id: veh.id, status: 'Aktif', alasan: String(body.alasan || '').trim(),
      berlaku_efektif_pada: String(body.berlakuEfektifPada || now), dicatat_oleh_nama: inspectorName, dicatat_pada: now,
      pemulihan_efektif_pada: null, pemulihan_catatan: null, dipulihkan_oleh_nama: null,
      temuan_ids: Array.isArray(body.temuanIds) ? (body.temuanIds as string[]) : [],
    });
    veh.status_akses = 'Ditangguhkan Sementara';
    addAudit(db, 'penangguhan_akses', id, 'CATAT_PENANGGUHAN_AKSES', { plat: veh.plat_tampil, alasan: body.alasan });
    await saveDbToStorage(db);
    return { id, statusAkses: 'Ditangguhkan Sementara' } as T;
  }

  const restoreMatch = pathname.match(/^\/api\/suspensions\/([^/]+)\/restore$/);
  if (restoreMatch && method === 'POST') {
    const susp = db.penangguhan_akses.find((s) => s.id === restoreMatch[1] && s.status === 'Aktif');
    if (!susp) throw new ApiError('Penangguhan aktif tidak ditemukan.', 404);
    const unverified = susp.temuan_ids
      .map((tid) => db.temuan.find((t) => t.id === tid))
      .filter((t) => t && t.status !== 'Terverifikasi Selesai')
      .map((t) => ({
        id: t!.id,
        item: String(db.inspeksi_item.find((ii) => ii.id === t!.inspeksi_item_id)?.nama_snapshot || '-'),
        kodeInspeksi: String(db.inspeksi.find((i) => i.id === t!.inspeksi_id)?.kode_inspeksi || '-'),
      }));
    if (unverified.length > 0) {
      throw new ApiError('Pemulihan akses ditolak: masih ada temuan penyebab yang belum terverifikasi selesai.', 400, { unverifiedFindings: unverified });
    }
    susp.status = 'Dipulihkan';
    susp.pemulihan_efektif_pada = String(body.pemulihanEfektifPada || new Date().toISOString());
    susp.pemulihan_catatan = String(body.catatan || '').trim();
    susp.dipulihkan_oleh_nama = inspectorName;
    const veh = db.kendaraan.find((k) => k.id === susp.kendaraan_id);
    if (veh) veh.status_akses = 'Aktif';
    addAudit(db, 'penangguhan_akses', susp.id, 'CATAT_PEMULIHAN_AKSES', { catatan: body.catatan });
    await saveDbToStorage(db);
    return { ok: true, statusAkses: 'Aktif' } as T;
  }

  // 10. Reports
  if (pathname === '/api/reports/preview') {
    const filtered = filterInspections(db, params);
    const departments = Array.from(new Set(db.karyawan.map((e) => e.departemen))).sort();
    return {
      totalBaris: filtered.length,
      sesuaiSeluruhnya: filtered.filter((i) => i.hasil === 'Sesuai Seluruhnya').length,
      adaTemuan: filtered.filter((i) => i.hasil === 'Ada Temuan').length,
      aksesDitangguhkan: filtered.filter((i) => db.kendaraan.find((k) => k.id === i.kendaraan_id)?.status_akses === 'Ditangguhkan Sementara').length,
      departments,
    } as T;
  }
  if (pathname === '/api/reports/export-logs') {
    return { items: db.ekspor_log } as T;
  }

  // 11. Admin CRUD & Audit Log
  if (pathname === '/api/admin/users') {
    if (method === 'GET') return { items: db.pengguna } as T;
    if (method === 'POST') {
      const id = uid();
      const now = new Date().toISOString();
      db.pengguna.unshift({ id, username: String(body.username), nama: String(body.nama), peran: body.peran as 'Petugas' | 'PIC' | 'Admin', aktif: 1, dibuat_pada: now, diubah_pada: now });
      addAudit(db, 'pengguna', id, 'TAMBAH_PENGGUNA', { username: body.username });
      await saveDbToStorage(db);
      return { id } as T;
    }
  }
  const userUpd = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userUpd && method === 'PUT') {
    const u = db.pengguna.find((x) => x.id === userUpd[1]);
    if (u && typeof body.aktif === 'boolean') u.aktif = body.aktif ? 1 : 0;
    await saveDbToStorage(db);
    return { ok: true } as T;
  }

  if (pathname === '/api/admin/employees') {
    if (method === 'GET') return { items: db.karyawan } as T;
    if (method === 'POST') {
      const id = uid();
      const now = new Date().toISOString();
      db.karyawan.push({ id, nik: String(body.nik), nama: String(body.nama), departemen: String(body.departemen), aktif: 1, dibuat_pada: now, diubah_pada: now });
      addAudit(db, 'karyawan', id, 'TAMBAH_KARYAWAN', { nik: body.nik, nama: body.nama });
      await saveDbToStorage(db);
      return { id } as T;
    }
  }

  if (pathname === '/api/admin/vehicles') {
    if (method === 'GET') {
      return {
        items: db.kendaraan.map((k) => {
          const e = db.karyawan.find((x) => x.id === k.karyawan_id);
          return { ...k, karyawan_nama: e?.nama || '-', karyawan_nik: e?.nik || '-', karyawan_departemen: e?.departemen || '-' };
        }),
      } as T;
    }
    if (method === 'POST') {
      const check = validatePlateClient(String(body.plat || ''));
      if (!check.valid) throw new ApiError(check.error || 'Format plat tidak valid.', 400);
      const id = uid();
      const now = new Date().toISOString();
      const platNormal = check.formatted.replace(/\s+/g, '');
      db.kendaraan.unshift({
        id, plat_normal: platNormal, plat_tampil: check.formatted,
        merek: String(body.merek), tipe: String(body.tipe), tahun: Number(body.tahun), warna: String(body.warna),
        karyawan_id: String(body.karyawanId), status_akses: 'Aktif', aktif: 1, dibuat_pada: now, diubah_pada: now,
      });
      for (const req of db.permintaan_pendaftaran_kendaraan) {
        if (req.plat_normal === platNormal && req.status === 'Menunggu') req.status = 'Diproses';
      }
      addAudit(db, 'kendaraan', id, 'TAMBAH_KENDARAAN', { plat: check.formatted });
      await saveDbToStorage(db);
      return { id } as T;
    }
  }

  if (pathname === '/api/admin/vehicle-requests') {
    return { items: db.permintaan_pendaftaran_kendaraan } as T;
  }

  if (pathname === '/api/admin/parameters') {
    if (method === 'GET') return { items: db.parameter_pemeriksaan } as T;
    if (method === 'POST') {
      const id = uid();
      db.parameter_pemeriksaan.push({
        id, kelompok: String(body.kelompok), nama: String(body.nama), deskripsi: String(body.deskripsi || ''),
        wajib: body.wajib ? 1 : 0, jenis_temuan: (body.jenisTemuan === 'Administrasi' ? 'Administrasi' : 'Fisik'),
        boleh_tidak_berlaku: body.bolehTidakBerlaku ? 1 : 0, wajib_foto: body.wajibFoto ? 1 : 0,
        acuan_jenis: String(body.acuanJenis || 'Tidak Ada'), acuan_teks: String(body.acuanTeks || ''),
        urutan: Number(body.urutan || 99), versi: 1, aktif: 1,
      });
      addAudit(db, 'parameter_pemeriksaan', id, 'TAMBAH_PARAMETER', { nama: body.nama });
      await saveDbToStorage(db);
      return { id } as T;
    }
  }

  const paramUpd = pathname.match(/^\/api\/admin\/parameters\/([^/]+)$/);
  if (paramUpd && method === 'PUT') {
    const p = db.parameter_pemeriksaan.find((x) => x.id === paramUpd[1]);
    if (p) {
      if (typeof body.aktif === 'boolean') p.aktif = body.aktif ? 1 : 0;
      p.versi += 1;
      addAudit(db, 'parameter_pemeriksaan', p.id, 'UBAH_PARAMETER', { aktif: p.aktif, versi: p.versi });
      await saveDbToStorage(db);
    }
    return { ok: true } as T;
  }

  if (pathname === '/api/audit-logs') {
    const ent = params.get('entitas') || '';
    const pel = (params.get('pelaku') || '').toLowerCase();
    const items = db.audit_log.filter((a) => (!ent || a.entitas === ent) && (!pel || a.pelaku_nama.toLowerCase().includes(pel)));
    return { items: items.slice(0, 150) } as T;
  }

  throw new ApiError(`Endpoint lokal tidak ditemukan: ${method} ${pathname}`, 404);
}
