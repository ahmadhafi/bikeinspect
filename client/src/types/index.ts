export type UserRole = 'Petugas' | 'PIC' | 'Admin';

export interface AuthUser {
  id: string;
  username: string;
  nama: string;
  peran: UserRole;
}

export type ItemStatus = 'Belum Diperiksa' | 'Sesuai' | 'Tidak Sesuai' | 'Tidak Berlaku';

export interface VehicleMatch {
  id: string;
  platNormal: string;
  platTampil: string;
  merek: string;
  tipe: string;
  tahun: number;
  warna: string;
  statusAkses: 'Aktif' | 'Ditangguhkan Sementara';
  karyawan: {
    id: string;
    nama: string;
    nik: string;
    departemen: string;
  };
  penangguhanAktif: {
    id: string;
    alasan: string;
    berlakuEfektifPada: string;
  } | null;
}

export interface EvidencePhoto {
  id: string;
  nama_asli: string;
  jenis: 'Fisik' | 'Dokumen';
  ukuran: number;
  tipe_mime: string;
  diambil_pada: string;
  signedUrl: string;
}

export interface InspectionItem {
  id: string;
  inspeksi_id: string;
  parameter_id: string;
  parameter_versi: number;
  kelompok_snapshot: 'Administrasi' | 'Kelengkapan' | 'Kondisi Teknis' | 'Pengendara';
  nama_snapshot: string;
  deskripsi_snapshot: string;
  wajib_snapshot: number;
  jenis_temuan_snapshot: 'Fisik' | 'Administrasi';
  boleh_tidak_berlaku_snapshot: number;
  wajib_foto_snapshot: number;
  acuan_jenis_snapshot: 'Internal' | 'Hukum' | 'Tidak Ada';
  acuan_teks_snapshot: string;
  urutan_snapshot: number;
  status: ItemStatus;
  catatan: string | null;
  alasan_tidak_berlaku: string | null;
  temuan_asal_id: string | null;
  temuan_id?: string | null;
  temuan_status?: 'Terbuka' | 'Terverifikasi Selesai' | null;
  diverifikasi_pada?: string | null;
  fotos: EvidencePhoto[];
}

export interface InspectionDetail {
  id: string;
  kode_inspeksi: string;
  kendaraan_id: string;
  plat_tampil_snapshot: string;
  merek_tipe_snapshot: string;
  tahun_snapshot: number;
  warna_snapshot: string;
  nama_karyawan_snapshot: string;
  nik_snapshot: string;
  departemen_snapshot: string;
  petugas_id: string;
  petugas_nama: string;
  jenis: 'Awal' | 'Ulang';
  inspeksi_asal_id: string | null;
  kode_inspeksi_asal: string | null;
  status: 'Draf' | 'Final' | 'Dibuang';
  hasil: 'Sesuai Seluruhnya' | 'Ada Temuan' | null;
  status_tindak_lanjut:
    | 'Tidak Perlu'
    | 'Menunggu Tindak Lanjut PIC'
    | 'Dalam Proses'
    | 'Menunggu Inspeksi Ulang'
    | 'Selesai';
  status_akses_kendaraan: 'Aktif' | 'Ditangguhkan Sementara';
  is_demo: number;
  masa_berlaku_sim: string | null;
  masa_berlaku_stnk_pajak: string | null;
  catatan_umum: string | null;
  dibuat_pada: string;
  diubah_pada: string;
  difinalkan_pada: string | null;
  items: InspectionItem[];
  counts: {
    total: number;
    sesuai: number;
    tidakSesuai: number;
    tidakBerlaku: number;
    belumDiperiksa: number;
  };
  teguranManual: {
    status: 'Belum Dicatat' | 'Sudah Dicatat';
    jumlah: number;
    riwayat: Array<{
      id: string;
      dikirim_pada: string;
      saluran: string | null;
      catatan: string;
      dicatat_oleh_nama: string;
      dicatat_pada: string;
    }>;
  };
  addendums: Array<{
    id: string;
    catatan: string;
    dibuat_oleh_nama: string;
    dibuat_pada: string;
  }>;
  penangguhanAktif: {
    id: string;
    alasan: string;
    berlaku_efektif_pada: string;
    dicatat_oleh_nama: string;
    dicatat_pada: string;
    temuanPenyebab: Array<{
      id: string;
      status: 'Terbuka' | 'Terverifikasi Selesai';
      nama_snapshot: string;
      kode_inspeksi: string;
      inspeksi_id: string;
    }>;
  } | null;
  inspeksiUlang: Array<{
    id: string;
    kode_inspeksi: string;
    status: string;
    hasil: string | null;
    difinalkan_pada: string | null;
    dibuat_pada: string;
  }>;
  auditHistory: Array<{
    id: string;
    waktu: string;
    pelaku_nama: string;
    entitas: string;
    aksi: string;
    nilai_sesudah: string | null;
  }>;
}
