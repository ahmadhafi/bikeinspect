-- Migrasi 001: Skema Awal Sistem Inspeksi Kendaraan Bermotor Roda Dua
-- Sesuai PRD Bagian 11 (Model Data)
-- Pemetaan entitas PRD:
--   users -> pengguna
--   employees -> karyawan
--   vehicles -> kendaraan
--   checklist_items -> parameter_pemeriksaan
--   inspections -> inspeksi
--   inspection_results -> inspeksi_item
--   evidence_files -> bukti_foto
--   follow_ups -> temuan + teguran_manual
--   access_events -> penangguhan_akses + penangguhan_temuan
--   audit_logs -> audit_log
--   tambahan: ocr_percobaan, ekspor_log, addendum_inspeksi, permintaan_pendaftaran_kendaraan, sesi

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS pengguna (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  nama TEXT NOT NULL,
  peran TEXT NOT NULL CHECK (peran IN ('Petugas', 'PIC', 'Admin')),
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL,
  diubah_pada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sesi (
  id TEXT PRIMARY KEY,
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  kadaluarsa_pada TEXT NOT NULL,
  terakhir_aktif_pada TEXT NOT NULL,
  alamat_ip TEXT,
  dibuat_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sesi_token ON sesi(token_hash);
CREATE INDEX IF NOT EXISTS idx_sesi_pengguna ON sesi(pengguna_id);

CREATE TABLE IF NOT EXISTS karyawan (
  id TEXT PRIMARY KEY,
  nik TEXT NOT NULL UNIQUE,
  nama TEXT NOT NULL,
  departemen TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL,
  diubah_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_karyawan_nik ON karyawan(nik);
CREATE INDEX IF NOT EXISTS idx_karyawan_nama ON karyawan(nama);

CREATE TABLE IF NOT EXISTS kendaraan (
  id TEXT PRIMARY KEY,
  plat_normal TEXT NOT NULL,
  plat_tampil TEXT NOT NULL,
  merek TEXT NOT NULL,
  tipe TEXT NOT NULL,
  tahun INTEGER NOT NULL,
  warna TEXT NOT NULL,
  karyawan_id TEXT NOT NULL REFERENCES karyawan(id),
  status_akses TEXT NOT NULL DEFAULT 'Aktif' CHECK (status_akses IN ('Aktif', 'Ditangguhkan Sementara')),
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL,
  diubah_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_kendaraan_plat ON kendaraan(plat_normal);
CREATE INDEX IF NOT EXISTS idx_kendaraan_karyawan ON kendaraan(karyawan_id);

CREATE TABLE IF NOT EXISTS permintaan_pendaftaran_kendaraan (
  id TEXT PRIMARY KEY,
  plat_normal TEXT NOT NULL,
  plat_tampil TEXT NOT NULL,
  catatan TEXT,
  pelapor_id TEXT NOT NULL REFERENCES pengguna(id),
  status TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Diproses', 'Ditolak')),
  dibuat_pada TEXT NOT NULL,
  diproses_pada TEXT,
  diproses_oleh TEXT REFERENCES pengguna(id)
);

CREATE TABLE IF NOT EXISTS parameter_pemeriksaan (
  id TEXT PRIMARY KEY,
  kelompok TEXT NOT NULL CHECK (kelompok IN ('Administrasi', 'Kelengkapan', 'Kondisi Teknis', 'Pengendara')),
  nama TEXT NOT NULL,
  deskripsi TEXT NOT NULL DEFAULT '',
  wajib INTEGER NOT NULL DEFAULT 1,
  jenis_temuan TEXT NOT NULL CHECK (jenis_temuan IN ('Fisik', 'Administrasi')),
  boleh_tidak_berlaku INTEGER NOT NULL DEFAULT 0,
  wajib_foto INTEGER NOT NULL DEFAULT 1,
  acuan_jenis TEXT NOT NULL DEFAULT 'Tidak Ada' CHECK (acuan_jenis IN ('Internal', 'Hukum', 'Tidak Ada')),
  acuan_teks TEXT NOT NULL DEFAULT '',
  urutan INTEGER NOT NULL DEFAULT 0,
  versi INTEGER NOT NULL DEFAULT 1,
  aktif INTEGER NOT NULL DEFAULT 1,
  dibuat_pada TEXT NOT NULL,
  diubah_pada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inspeksi (
  id TEXT PRIMARY KEY,
  kode_inspeksi TEXT NOT NULL UNIQUE,
  kendaraan_id TEXT NOT NULL REFERENCES kendaraan(id),
  karyawan_id_snapshot TEXT NOT NULL,
  nama_karyawan_snapshot TEXT NOT NULL,
  nik_snapshot TEXT NOT NULL,
  departemen_snapshot TEXT NOT NULL,
  plat_tampil_snapshot TEXT NOT NULL,
  merek_tipe_snapshot TEXT NOT NULL,
  tahun_snapshot INTEGER NOT NULL,
  warna_snapshot TEXT NOT NULL,
  petugas_id TEXT NOT NULL REFERENCES pengguna(id),
  jenis TEXT NOT NULL DEFAULT 'Awal' CHECK (jenis IN ('Awal', 'Ulang')),
  inspeksi_asal_id TEXT REFERENCES inspeksi(id),
  status TEXT NOT NULL DEFAULT 'Draf' CHECK (status IN ('Draf', 'Final', 'Dibuang')),
  hasil TEXT CHECK (hasil IS NULL OR hasil IN ('Sesuai Seluruhnya', 'Ada Temuan')),
  status_tindak_lanjut TEXT NOT NULL DEFAULT 'Tidak Perlu' CHECK (
    status_tindak_lanjut IN ('Tidak Perlu', 'Menunggu Tindak Lanjut PIC', 'Dalam Proses', 'Menunggu Inspeksi Ulang', 'Selesai')
  ),
  kunci_idempotensi TEXT UNIQUE,
  is_demo INTEGER NOT NULL DEFAULT 0,
  masa_berlaku_sim TEXT,
  masa_berlaku_stnk_pajak TEXT,
  catatan_umum TEXT,
  dibuat_pada TEXT NOT NULL,
  diubah_pada TEXT NOT NULL,
  difinalkan_pada TEXT
);
CREATE INDEX IF NOT EXISTS idx_inspeksi_kendaraan ON inspeksi(kendaraan_id);
CREATE INDEX IF NOT EXISTS idx_inspeksi_petugas ON inspeksi(petugas_id);
CREATE INDEX IF NOT EXISTS idx_inspeksi_status ON inspeksi(status);
CREATE INDEX IF NOT EXISTS idx_inspeksi_asal ON inspeksi(inspeksi_asal_id);

CREATE TABLE IF NOT EXISTS inspeksi_item (
  id TEXT PRIMARY KEY,
  inspeksi_id TEXT NOT NULL REFERENCES inspeksi(id) ON DELETE CASCADE,
  parameter_id TEXT NOT NULL REFERENCES parameter_pemeriksaan(id),
  parameter_versi INTEGER NOT NULL,
  kelompok_snapshot TEXT NOT NULL,
  nama_snapshot TEXT NOT NULL,
  deskripsi_snapshot TEXT NOT NULL DEFAULT '',
  wajib_snapshot INTEGER NOT NULL DEFAULT 1,
  jenis_temuan_snapshot TEXT NOT NULL CHECK (jenis_temuan_snapshot IN ('Fisik', 'Administrasi')),
  boleh_tidak_berlaku_snapshot INTEGER NOT NULL DEFAULT 0,
  wajib_foto_snapshot INTEGER NOT NULL DEFAULT 1,
  acuan_jenis_snapshot TEXT NOT NULL DEFAULT 'Tidak Ada',
  acuan_teks_snapshot TEXT NOT NULL DEFAULT '',
  urutan_snapshot INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Belum Diperiksa' CHECK (
    status IN ('Belum Diperiksa', 'Sesuai', 'Tidak Sesuai', 'Tidak Berlaku')
  ),
  catatan TEXT,
  alasan_tidak_berlaku TEXT,
  temuan_asal_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_inspeksi_item_inspeksi ON inspeksi_item(inspeksi_id);

CREATE TABLE IF NOT EXISTS bukti_foto (
  id TEXT PRIMARY KEY,
  inspeksi_item_id TEXT NOT NULL REFERENCES inspeksi_item(id) ON DELETE CASCADE,
  kunci_penyimpanan TEXT NOT NULL,
  nama_asli TEXT NOT NULL,
  jenis TEXT NOT NULL CHECK (jenis IN ('Fisik', 'Dokumen')),
  ukuran INTEGER NOT NULL,
  tipe_mime TEXT NOT NULL,
  checksum TEXT NOT NULL,
  diambil_pada TEXT NOT NULL,
  diunggah_oleh TEXT NOT NULL REFERENCES pengguna(id)
);
CREATE INDEX IF NOT EXISTS idx_bukti_foto_item ON bukti_foto(inspeksi_item_id);

CREATE TABLE IF NOT EXISTS temuan (
  id TEXT PRIMARY KEY,
  inspeksi_id TEXT NOT NULL REFERENCES inspeksi(id),
  inspeksi_item_id TEXT NOT NULL UNIQUE REFERENCES inspeksi_item(id),
  status TEXT NOT NULL DEFAULT 'Terbuka' CHECK (status IN ('Terbuka', 'Terverifikasi Selesai')),
  item_verifikasi_id TEXT REFERENCES inspeksi_item(id),
  diverifikasi_pada TEXT,
  dibuat_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_temuan_inspeksi ON temuan(inspeksi_id);
CREATE INDEX IF NOT EXISTS idx_temuan_status ON temuan(status);

CREATE TABLE IF NOT EXISTS teguran_manual (
  id TEXT PRIMARY KEY,
  inspeksi_id TEXT NOT NULL REFERENCES inspeksi(id),
  dikirim_pada TEXT NOT NULL,
  saluran TEXT,
  catatan TEXT NOT NULL,
  dicatat_oleh TEXT NOT NULL REFERENCES pengguna(id),
  dicatat_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_teguran_inspeksi ON teguran_manual(inspeksi_id);

CREATE TABLE IF NOT EXISTS addendum_inspeksi (
  id TEXT PRIMARY KEY,
  inspeksi_id TEXT NOT NULL REFERENCES inspeksi(id),
  catatan TEXT NOT NULL,
  dibuat_oleh TEXT NOT NULL REFERENCES pengguna(id),
  dibuat_pada TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_addendum_inspeksi ON addendum_inspeksi(inspeksi_id);

CREATE TABLE IF NOT EXISTS penangguhan_akses (
  id TEXT PRIMARY KEY,
  kendaraan_id TEXT NOT NULL REFERENCES kendaraan(id),
  status TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif', 'Dipulihkan')),
  alasan TEXT NOT NULL,
  berlaku_efektif_pada TEXT NOT NULL,
  dicatat_oleh TEXT NOT NULL REFERENCES pengguna(id),
  dicatat_pada TEXT NOT NULL,
  pemulihan_efektif_pada TEXT,
  pemulihan_catatan TEXT,
  dipulihkan_oleh TEXT REFERENCES pengguna(id)
);
CREATE INDEX IF NOT EXISTS idx_penangguhan_kendaraan ON penangguhan_akses(kendaraan_id);
CREATE INDEX IF NOT EXISTS idx_penangguhan_status ON penangguhan_akses(status);

CREATE TABLE IF NOT EXISTS penangguhan_temuan (
  penangguhan_id TEXT NOT NULL REFERENCES penangguhan_akses(id) ON DELETE CASCADE,
  temuan_id TEXT NOT NULL REFERENCES temuan(id),
  PRIMARY KEY (penangguhan_id, temuan_id)
);

CREATE TABLE IF NOT EXISTS ocr_percobaan (
  id TEXT PRIMARY KEY,
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
  inspeksi_id TEXT REFERENCES inspeksi(id),
  mode TEXT NOT NULL CHECK (mode IN ('Produksi', 'Demo')),
  plat_mentah TEXT,
  keyakinan REAL,
  status TEXT NOT NULL CHECK (status IN ('Berhasil', 'Gagal', 'Buram', 'Timeout')),
  plat_terkonfirmasi TEXT,
  dibuat_pada TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  waktu TEXT NOT NULL,
  pelaku_id TEXT,
  pelaku_nama TEXT NOT NULL,
  entitas TEXT NOT NULL,
  id_entitas TEXT NOT NULL,
  aksi TEXT NOT NULL,
  nilai_sebelum TEXT,
  nilai_sesudah TEXT,
  alamat_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_waktu ON audit_log(waktu DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entitas ON audit_log(entitas, id_entitas);

-- Jaminan append-only di level database (NFR-14)
CREATE TRIGGER IF NOT EXISTS trg_audit_no_update
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log bersifat append-only dan tidak dapat diubah');
END;

CREATE TRIGGER IF NOT EXISTS trg_audit_no_delete
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log bersifat append-only dan tidak dapat dihapus');
END;

CREATE TABLE IF NOT EXISTS ekspor_log (
  id TEXT PRIMARY KEY,
  pengguna_id TEXT NOT NULL REFERENCES pengguna(id),
  waktu TEXT NOT NULL,
  filter_json TEXT NOT NULL,
  jumlah_baris INTEGER NOT NULL
);
