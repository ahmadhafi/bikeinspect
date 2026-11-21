# Sistem Inspeksi Kendaraan (Roda Dua)

Aplikasi web mobile-first dan responsif berbahasa Indonesia untuk inspeksi kelengkapan dan kondisi kendaraan roda dua karyawan di tempat kerja, pencatatan tindak lanjut PIC, laporan Excel (`.xlsx`), dan administrasi.

## Fitur Utama (Halaman P-01 s.d. P-13)
- **P-01 Masuk**: Autentikasi akun individual (`bcrypt`), sesi `HttpOnly` + batas tidak aktif 30 menit, ganti kata sandi.
- **Beranda & P-02 Scan Plat Nomor**: Kamera belakang (`facingMode: environment`), bingkai panduan hijau, unggah foto, input manual, adaptor OCR server-side (dengan **Mode Demo — OCR Simulasi** yang transparan bila belum dikonfigurasi), usulan OCR dapat diedit & wajib dikonfirmasi.
- **P-03 Konfirmasi Identitas Kendaraan**: Pencocokan ke database internal, NIK disamarkan untuk Petugas, status akses kendaraan saat ini, penanganan kendaraan belum terdaftar (lapor ke Admin) dan kecocokan ganda.
- **P-04 Formulir Inspeksi**: 4 kelompok parameter (Administrasi, Kelengkapan, Kondisi Teknis, Pengendara) dapat dibuka/tutup, layout 2 panel di tablet/desktop, status awal seluruh item *Belum Diperiksa*, temuan fisik wajib catatan + foto privat, temuan administrasi wajib catatan, *Tidak Berlaku* hanya bila diizinkan + wajib alasan, draf lokal + simpan draf server + finalisasi idempoten.
- **P-05 Data Tersimpan di Database**: Tampil hanya setelah server mengonfirmasi, kartu bersyarat temuan & penangguhan (inspeksi baru tidak menghapus penangguhan lama), kartu ekspor Excel khusus PIC.
- **P-06 Riwayat & P-07 Detail Inspeksi**: Pencarian (plat, nama, NIK), filter gabungan, 4 status terpisah, tautan foto bukti bertanda tangan berumur pendek, addendum PIC, panel tindak lanjut PIC (teguran manual tanpa kirim email, penangguhan/pemulihan akses kendaraan, transisi status tindak lanjut), riwayat audit.
- **P-08 Inspeksi Ulang**: Terhubung ke inspeksi asal, memverifikasi temuan terbuka menjadi *Terverifikasi Selesai* saat final.
- **P-09 Laporan & Ekspor Excel (`.xlsx`)**: Khusus PIC; berkas `.xlsx` asli dengan lembar **Rekap Inspeksi** (21 kolom) dan **Detail Pemeriksaan** (11 kolom), freeze header, autofilter, tanggal WIB, plat/NIK teks, netralisasi formula injection.
- **P-10 s.d. P-13 Administrasi & Audit**: Kelola Pengguna, Karyawan & Kendaraan (beserta laporan kendaraan belum terdaftar), Parameter Pemeriksaan (versi & snapshot), dan Log Audit *append-only* (dilindungi trigger SQLite).

## Akun Contoh Pengembangan
| Peran | Username | Kata Sandi | Nama |
| --- | --- | --- | --- |
| **Petugas** | `petugas` | `Petugas123!` | Raka Pratama |
| **Petugas 2** | `petugas2` | `Petugas123!` | Dimas Saputra |
| **PIC** | `pic` | `Pic12345!` | Dewi Anggraini |
| **Admin** | `admin` | `Admin123!` | Agus Setiawan |

## Data Contoh Fiktif (Seed)
- Kendaraan termasuk **`B 1234 KSP`** (Honda Beat 2021 Hitam, milik Budi Santoso — HSE, memiliki temuan knalpot, 1 teguran manual, dan **1 penangguhan akses aktif**), `B 5678 XYZ` (Yamaha NMAX 2023 Hitam, milik Ahmad Fauzi — Logistik, memiliki temuan tanpa penangguhan), `B 2468 MNO` (Honda Vario 160 Putih, Sesuai Seluruhnya), `D 3579 ABC`, dan `B 9012 KLM`.
- 18 parameter pemeriksaan bawaan across 4 kelompok.

## Cara Menjalankan
```bash
# 1. Instal dependensi
npm install && npm --prefix server install && npm --prefix client install

# 2. (Opsional) Salin konfigurasi lingkungan
cp .env.example .env

# 3. Jalankan migrasi & data contoh (otomatis juga berjalan saat server start)
npm run seed

# 4. Mode pengembangan (API port 3001 + Vite port 5173)
npm run dev

# 5. Build produksi & jalankan satu server (port 3001)
npm run build
npm start

# 6. Jalankan uji penerimaan otomatis
npm test
```

## Variabel Lingkungan (`.env`)
Lihat [`.env.example`](.env.example):
- `PORT` (default `3001`), `NODE_ENV`, `APP_BASE_URL`
- `SESSION_SECRET`, `SIGNED_URL_SECRET`, `SESSION_TIMEOUT_MINUTES` (default `30`), `SIGNED_URL_TTL_SECONDS` (default `300`)
- `DB_PATH` (default `../data/inspeksi.db`), `UPLOAD_DIR` (default `../data/uploads`)
- **Integrasi OCR (khusus server, tidak pernah dikirim ke klien)**:
  - `OCR_PROVIDER`: `demo` (default bila belum dikonfigurasi) atau `http`
  - `OCR_API_URL`: endpoint HTTP POST penerima `multipart/form-data` field `image`
  - `OCR_API_KEY`: token Bearer untuk autentikasi ke layanan OCR
  - `OCR_TIMEOUT_MS`: batas tunggu panggilan OCR (default `8000`)
  - `OCR_CONFIDENCE_THRESHOLD`: ambang keyakinan (default `0.85`)

### Kontrak Respons Adaptor OCR (`OCR_PROVIDER=http`)
Layanan OCR eksternal diharapkan mengembalikan JSON:
```json
{
  "plate": "B 1234 KSP",
  "confidence": 0.94,
  "candidates": ["B 1234 KSP"],
  "blurry": false,
  "expiry_hint": "08·28"
}
```
Server menormalkan dan memvalidasi format plat (`^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{0,3}$`), mencatat `ocr_percobaan` tanpa menyimpan foto scan, dan selalu menampilkan hasil sebagai usulan yang dapat diedit oleh Petugas.

## Pemetaan Model Data (PRD Bagian 11)
Skema lengkap berada pada [`server/migrations/001_init.sql`](server/migrations/001_init.sql) menggunakan nama entitas PRD:
`pengguna`, `sesi`, `karyawan`, `kendaraan`, `permintaan_pendaftaran_kendaraan`, `parameter_pemeriksaan`, `inspeksi`, `inspeksi_item`, `bukti_foto`, `temuan`, `teguran_manual`, `addendum_inspeksi`, `penangguhan_akses`, `penangguhan_temuan`, `ocr_percobaan`, `audit_log` (append-only via trigger), `ekspor_log`.

## Daftar Kriteria Penerimaan (PRD Bagian 15: AC-01 s.d. AC-30)
| ID | Status | Bukti / Keterangan |
| --- | --- | --- |
| AC-01 | Lulus | Usulan OCR dapat diedit, konfirmasi eksplisit wajib (`acceptance.test.ts` & `ScanPage.tsx`) |
| AC-02 | Lulus | Data kendaraan & karyawan dari DB internal, NIK disamarkan untuk Petugas |
| AC-03 | Lulus | Plat tidak terdaftar menampilkan “Kendaraan Belum Terdaftar” tanpa membuat inspeksi + opsi lapor Admin |
| AC-04 | Lulus | Penolakan izin kamera menampilkan panduan + tombol Unggah Foto & Input Manual |
| AC-05 | Lulus | Mode Demo OCR menampilkan label permanen “Mode Demo — OCR Simulasi” dan menandai `is_demo` |
| AC-06 | Lulus | Seluruh item inspeksi baru berstatus awal `Belum Diperiksa` |
| AC-07 | Lulus | Server menolak finalisasi (422) bila item wajib `Belum Diperiksa`; UI menggulir & menandai item pertama |
| AC-08 | Lulus | Temuan fisik tanpa catatan atau foto ditolak (422) dengan pesan spesifik |
| AC-09 | Lulus | `Tidak Berlaku` tanpa alasan atau pada parameter tidak mengizinkan ditolak (422) |
| AC-10 | Lulus | Nama STNK berbeda dengan pengendara tidak menghasilkan temuan otomatis |
| AC-11 | Lulus | Draf lokal disimpan otomatis di `localStorage` dengan penanda jelas “Draf lokal — belum tersimpan di server” |
| AC-12 | Lulus | Kunci idempotensi mencegah duplikasi inspeksi Final pada klik ganda/percobaan ulang |
| AC-13 | Lulus | Layar “Data Tersimpan di Database” hanya tampil setelah server mengonfirmasi status `Final` |
| AC-14 | Lulus | Inspeksi bertemuan tanpa tindakan PIC menampilkan “Temuan Tercatat — Menunggu Tindak Lanjut PIC” |
| AC-15 | Lulus | Banner “Akses Kendaraan Ditangguhkan Sementara” tidak tampil bila PIC belum mencatat penangguhan |
| AC-16 | Lulus | Inspeksi baru bebas temuan tidak menghapus penangguhan aktif lama; banner tetap tampil |
| AC-17 | Lulus | Pencarian plat/nama/NIK dan filter gabungan berfungsi di `HistoryPage.tsx` & `/api/inspections` |
| AC-18 | Lulus | Ekspor `.xlsx` asli untuk PIC memuat lembar “Rekap Inspeksi” & “Detail Pemeriksaan” sesuai filter |
| AC-19 | Lulus | Seluruh 21+11 kolom tersedia, Plat/NIK bertipe teks, formula dinetralkan, tautan bukti butuh login |
| AC-20 | Lulus | RBAC ditegakkan di server; Petugas memanggil `/api/reports/export` atau `/api/suspensions` ditolak 403 |
| AC-21 | Lulus | PIC mencatat teguran manual (waktu + catatan), status menjadi `Sudah Dicatat`, tidak mengirim email |
| AC-22 | Lulus | PIC mencatat penangguhan kendaraan saja + disclaimer tidak memblokir gerbang fisik otomatis |
| AC-23 | Lulus | Inspeksi ulang final memverifikasi temuan asal menjadi `Terverifikasi Selesai` |
| AC-24 | Lulus | Pemulihan akses prematur ditolak (400) dengan daftar temuan yang belum terverifikasi |
| AC-25 | Lulus | Pemulihan sah mengubah status akses kendaraan ke `Aktif` dan tercatat di audit |
| AC-26 | Lulus | Log audit append-only (dilindungi trigger SQLite `BEFORE UPDATE/DELETE`) mencatat pelaku, waktu, nilai |
| AC-27 | Lulus | Foto bukti privat menolak tautan kedaluwarsa/token tidak valid atau akun tak berhak (403) |
| AC-28 | Lulus | Setiap status selalu ikon + teks; tombol utama `min-h-[48px]` |
| AC-29 | Lulus | Perubahan parameter oleh Admin menaikkan versi tanpa mengubah snapshot inspeksi lama |
| AC-30 | Lulus | Tidak ada teks “Tiket Peringatan”, “Denda”, “Email Teguran Otomatis”, atau rujukan pasal hukum otomatis |

## Asumsi & Item P2 yang Ditunda
- **P2 Ditunda (sesuai PRD Bagian 4.2 & 18.1 A-10)**: Impor massal CSV/Excel data karyawan & kendaraan, penautan temuan baru dari inspeksi lain ke penangguhan aktif (`FR-FUP-09`), dan lembar opsional “Info Ekspor” pada `.xlsx`.
- **Database**: Menggunakan SQLite persisten (`node:sqlite`, WAL mode) agar berjalan tanpa layanan eksternal; skema SQL standar siap dimigrasi ke PostgreSQL untuk produksi skala besar.
- **HTTPS**: Kamera belakang di ponsel memerlukan HTTPS di lingkungan produksi (reverse proxy Nginx/Caddy/TLS atau AutoSSL cPanel).

## Panduan Deploy ke cPanel (`https://galaxyfleet.web.id/bikeinspect`)
1. **Clone dari GitHub di cPanel**:
   - Buka **Git™ Version Control** di cPanel → klik **Create** → tempel URL repo `bikeinspect`.
   - Set *Repository Path* di luar `public_html`, misalnya `/home/<cpanel_user>/bikeinspect`.
2. **Setup Node.js App di cPanel**:
   - Buka **Setup Node.js App** → klik **Create Application**:
     - **Node.js version**: `22` (minimal `22.5+`)
     - **Application mode**: `Production`
     - **Application root**: `bikeinspect` (sesuai folder clone)
     - **Application URL**: `galaxyfleet.web.id` + subpath `bikeinspect`
     - **Application startup file**: `server.mjs`
3. **Atur Environment Variables di cPanel Setup Node.js App**:
   - `NODE_ENV` = `production`
   - `APP_BASE_PATH` = `/bikeinspect`
   - `APP_BASE_URL` = `https://galaxyfleet.web.id/bikeinspect`
   - `SESSION_SECRET` = *(string acak panjang minimal 32 karakter)*
   - `SIGNED_URL_SECRET` = *(string acak panjang minimal 32 karakter)*
   - `DB_PATH` = `/home/<cpanel_user>/bikeinspect-data/inspeksi.db`
   - `UPLOAD_DIR` = `/home/<cpanel_user>/bikeinspect-data/uploads`
   - `OCR_PROVIDER` = `demo` *(atau `http` + isi `OCR_API_URL` & `OCR_API_KEY`)*
4. **Instal Dependensi & Build (via cPanel Terminal / Enter virtual environment)**:
   ```bash
   # Masuk ke virtual environment Node 22 (salin perintah "source ..." dari atas halaman Setup Node.js App)
   npm run install:all
   npm run build:cpanel
   ```
5. **Restart Application** di cPanel **Setup Node.js App**, lalu pastikan **AutoSSL / HTTPS** aktif untuk `galaxyfleet.web.id` agar kamera belakang berfungsi di ponsel.

