import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config.js';
import { getDb } from './database.js';
import { recordAudit } from '../services/audit.js';

// Minimal valid 1x1 PNG placeholder untuk foto bukti contoh di penyimpanan privat
const SAMPLE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAARElEQVR4nO3PQQ0AIAwEQbT/n9kRQA6Y9UwyM1vV698B/9sAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAocELw0B0t1Q7m8AAAAASUVORK5CYII=';

export function seedDatabase(force = false) {
  const db = getDb();
  const existingUsers = db.prepare('SELECT COUNT(*) as cnt FROM pengguna').get() as { cnt: number };
  if (existingUsers.cnt > 0 && !force) {
    console.log('[Seed] Database sudah memiliki data. Lewati seed.');
    return;
  }

  fs.mkdirSync(config.uploadDir, { recursive: true });
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();

  // 1. Akun Contoh untuk Tiap Peran
  const users = [
    { id: uuidv4(), username: 'petugas', pass: 'Petugas123!', nama: 'Raka Pratama', peran: 'Petugas' },
    { id: uuidv4(), username: 'petugas2', pass: 'Petugas123!', nama: 'Dimas Saputra', peran: 'Petugas' },
    { id: uuidv4(), username: 'pic', pass: 'Pic12345!', nama: 'Dewi Anggraini', peran: 'PIC' },
    { id: uuidv4(), username: 'admin', pass: 'Admin123!', nama: 'Agus Setiawan', peran: 'Admin' },
  ];

  const insertUser = db.prepare(
    `INSERT INTO pengguna (id, username, password_hash, nama, peran, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const u of users) {
    insertUser.run(u.id, u.username, bcrypt.hashSync(u.pass, 10), u.nama, u.peran, yesterday, yesterday);
  }
  const petugas1 = users[0];
  const picUser = users[2];
  const adminUser = users[3];

  // 2. Data Karyawan Fiktif
  const employees = [
    { id: uuidv4(), nik: 'EMP-2021-0142', nama: 'Budi Santoso', departemen: 'HSE' },
    { id: uuidv4(), nik: 'EMP-2022-0318', nama: 'Ahmad Fauzi', departemen: 'Logistik' },
    { id: uuidv4(), nik: 'EMP-2020-0087', nama: 'Siti Rahmawati', departemen: 'Produksi' },
    { id: uuidv4(), nik: 'EMP-2023-0511', nama: 'Dedi Kurniawan', departemen: 'Pemeliharaan' },
    { id: uuidv4(), nik: 'EMP-2021-0209', nama: 'Rina Wijaya', departemen: 'HR & GA' },
    { id: uuidv4(), nik: 'EMP-2024-0604', nama: 'Hendra Pratama', departemen: 'Gudang' },
  ];
  const insertEmp = db.prepare(
    `INSERT INTO karyawan (id, nik, nama, departemen, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, 1, ?, ?)`
  );
  for (const e of employees) {
    insertEmp.run(e.id, e.nik, e.nama, e.departemen, yesterday, yesterday);
  }

  // 3. Data Kendaraan Fiktif (termasuk "B 1234 KSP" sesuai PRD Bagian 6.2)
  const vehicles = [
    {
      id: uuidv4(),
      platNormal: 'B1234KSP',
      platTampil: 'B 1234 KSP',
      merek: 'Honda',
      tipe: 'Beat',
      tahun: 2021,
      warna: 'Hitam',
      karyawanId: employees[0].id,
      statusAkses: 'Ditangguhkan Sementara',
    },
    {
      id: uuidv4(),
      platNormal: 'B5678XYZ',
      platTampil: 'B 5678 XYZ',
      merek: 'Yamaha',
      tipe: 'NMAX',
      tahun: 2023,
      warna: 'Hitam',
      karyawanId: employees[1].id,
      statusAkses: 'Aktif',
    },
    {
      id: uuidv4(),
      platNormal: 'B2468MNO',
      platTampil: 'B 2468 MNO',
      merek: 'Honda',
      tipe: 'Vario 160',
      tahun: 2023,
      warna: 'Putih',
      karyawanId: employees[2].id,
      statusAkses: 'Aktif',
    },
    {
      id: uuidv4(),
      platNormal: 'D3579ABC',
      platTampil: 'D 3579 ABC',
      merek: 'Yamaha',
      tipe: 'Aerox 155',
      tahun: 2022,
      warna: 'Merah',
      karyawanId: employees[3].id,
      statusAkses: 'Aktif',
    },
    {
      id: uuidv4(),
      platNormal: 'B9012KLM',
      platTampil: 'B 9012 KLM',
      merek: 'Honda',
      tipe: 'Scoopy',
      tahun: 2022,
      warna: 'Krem',
      karyawanId: employees[4].id,
      statusAkses: 'Aktif',
    },
  ];

  const insertVeh = db.prepare(
    `INSERT INTO kendaraan (id, plat_normal, plat_tampil, merek, tipe, tahun, warna, karyawan_id, status_akses, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
  );
  for (const v of vehicles) {
    insertVeh.run(
      v.id,
      v.platNormal,
      v.platTampil,
      v.merek,
      v.tipe,
      v.tahun,
      v.warna,
      v.karyawanId,
      v.statusAkses,
      yesterday,
      yesterday
    );
  }

  // 4. Parameter Pemeriksaan Bawaan (FR-INS-03 s.d. FR-INS-06)
  const parameters = [
    // Administrasi
    { kelompok: 'Administrasi', nama: 'SIM C Sesuai Golongan & Masa Berlaku', deskripsi: 'Pemeriksaan visual SIM C pengendara masih berlaku.', wajib: 1, jenis: 'Administrasi', bolehTB: 0, wajibFoto: 0, acuanJenis: 'Internal', acuanTeks: 'Ketentuan Keselamatan Berkendara Internal', urutan: 1 },
    { kelompok: 'Administrasi', nama: 'STNK Kendaraan', deskripsi: 'Ketersediaan STNK kendaraan roda dua saat pemeriksaan.', wajib: 1, jenis: 'Administrasi', bolehTB: 0, wajibFoto: 0, acuanJenis: 'Internal', acuanTeks: 'Ketentuan Administrasi Kendaraan Area Kerja', urutan: 2 },
    { kelompok: 'Administrasi', nama: 'Kesesuaian Identitas Kendaraan', deskripsi: 'Kesesuaian nomor plat, merek, tipe, dan warna dengan STNK (nama berbeda tidak otomatis temuan).', wajib: 1, jenis: 'Administrasi', bolehTB: 0, wajibFoto: 0, acuanJenis: 'Internal', acuanTeks: 'Prosedur Identifikasi Kendaraan', urutan: 3 },
    { kelompok: 'Administrasi', nama: 'Masa Berlaku Dokumen & Pajak', deskripsi: 'Pencatatan visual masa berlaku pajak/STNK dan SIM.', wajib: 1, jenis: 'Administrasi', bolehTB: 0, wajibFoto: 0, acuanJenis: 'Internal', acuanTeks: 'Ketentuan Administrasi Kendaraan Area Kerja', urutan: 4 },
    { kelompok: 'Administrasi', nama: 'Plat Nomor Depan & Belakang', deskripsi: 'Terpasang lengkap di depan dan belakang serta terbaca jelas.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Identifikasi Kendaraan', urutan: 5 },

    // Kelengkapan
    { kelompok: 'Kelengkapan', nama: 'Lampu Utama', deskripsi: 'Lampu depan dekat dan jauh menyala normal.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 6 },
    { kelompok: 'Kelengkapan', nama: 'Lampu Sein', deskripsi: 'Lampu sein kiri dan kanan depan-belakang berfungsi.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 7 },
    { kelompok: 'Kelengkapan', nama: 'Lampu Rem', deskripsi: 'Lampu belakang dan lampu rem menyala saat tuas ditekan.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 8 },
    { kelompok: 'Kelengkapan', nama: 'Klakson', deskripsi: 'Klakson berbunyi jelas dan berfungsi baik.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 9 },
    { kelompok: 'Kelengkapan', nama: 'Dua Spion', deskripsi: 'Spion kiri dan kanan terpasang utuh dan tidak retak.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelengkapan Keselamatan Roda Dua', urutan: 10 },
    { kelompok: 'Kelengkapan', nama: 'Knalpot', deskripsi: 'Knalpot standar pabrikan, tidak bising/modifikasi non-standar.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Kebijakan Kebisingan & Knalpot Standar Area Kerja', urutan: 11 },

    // Kondisi Teknis
    { kelompok: 'Kondisi Teknis', nama: 'Kondisi Ban', deskripsi: 'Alur ban masih layak, tidak gundul atau retak parah.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelaikan Teknis Kendaraan', urutan: 12 },
    { kelompok: 'Kondisi Teknis', nama: 'Rem Depan', deskripsi: 'Rem depan pakem dan tuas bekerja normal.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelaikan Teknis Kendaraan', urutan: 13 },
    { kelompok: 'Kondisi Teknis', nama: 'Rem Belakang', deskripsi: 'Rem belakang pakem dan bekerja normal.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelaikan Teknis Kendaraan', urutan: 14 },
    { kelompok: 'Kondisi Teknis', nama: 'Kebocoran Fluida', deskripsi: 'Tidak ada kebocoran oli mesin, bahan bakar, atau cairan rem.', wajib: 1, jenis: 'Fisik', bolehTB: 0, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Standar Kelaikan Teknis & Lingkungan', urutan: 15 },

    // Pengendara
    { kelompok: 'Pengendara', nama: 'Helm SNI & Pengikat', deskripsi: 'Menggunakan helm berstandar SNI dengan tali pengikat terpasang.', wajib: 1, jenis: 'Fisik', bolehTB: 1, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Kebijakan APD Berkendara Perusahaan', urutan: 16 },
    { kelompok: 'Pengendara', nama: 'Alas Kaki Tertutup', deskripsi: 'Menggunakan sepatu/alas kaki tertutup saat berkendara.', wajib: 1, jenis: 'Fisik', bolehTB: 1, wajibFoto: 1, acuanJenis: 'Internal', acuanTeks: 'Kebijakan APD Berkendara Perusahaan', urutan: 17 },
    { kelompok: 'Pengendara', nama: 'Perlengkapan Tambahan Perusahaan', deskripsi: 'Rompi reflektif atau kartu akses parkir sesuai kebijakan area (opsional).', wajib: 0, jenis: 'Fisik', bolehTB: 1, wajibFoto: 0, acuanJenis: 'Internal', acuanTeks: 'Kebijakan Area Parkir Perusahaan', urutan: 18 },
  ];

  const paramRows: Array<{ id: string } & (typeof parameters)[number]> = [];
  const insertParam = db.prepare(
    `INSERT INTO parameter_pemeriksaan
      (id, kelompok, nama, deskripsi, wajib, jenis_temuan, boleh_tidak_berlaku, wajib_foto, acuan_jenis, acuan_teks, urutan, versi, aktif, dibuat_pada, diubah_pada)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`
  );
  for (const p of parameters) {
    const id = uuidv4();
    insertParam.run(
      id,
      p.kelompok,
      p.nama,
      p.deskripsi,
      p.wajib,
      p.jenis,
      p.bolehTB,
      p.wajibFoto,
      p.acuanJenis,
      p.acuanTeks,
      p.urutan,
      yesterday,
      yesterday
    );
    paramRows.push({ id, ...p });
  }

  // Helper membuat file foto bukti privat contoh
  function createSamplePhoto(filenameHint: string): { key: string; checksum: string; size: number } {
    const buf = Buffer.from(SAMPLE_PNG_BASE64, 'base64');
    const key = `${uuidv4()}.png`;
    fs.writeFileSync(path.join(config.uploadDir, key), buf);
    const checksum = crypto.createHash('sha256').update(buf).digest('hex');
    return { key, checksum, size: buf.length };
  }

  // 5. Contoh Inspeksi #1: B 1234 KSP — Ada Temuan (Knalpot) + Teguran Manual + Penangguhan Aktif
  const insp1Id = uuidv4();
  db.prepare(
    `INSERT INTO inspeksi (
      id, kode_inspeksi, kendaraan_id, karyawan_id_snapshot, nama_karyawan_snapshot, nik_snapshot, departemen_snapshot,
      plat_tampil_snapshot, merek_tipe_snapshot, tahun_snapshot, warna_snapshot, petugas_id,
      jenis, status, hasil, status_tindak_lanjut, kunci_idempotensi, is_demo,
      masa_berlaku_sim, masa_berlaku_stnk_pajak, dibuat_pada, diubah_pada, difinalkan_pada
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awal', 'Final', 'Ada Temuan', 'Dalam Proses', ?, 0, ?, ?, ?, ?, ?)`
  ).run(
    insp1Id,
    'INS-20261120-0001',
    vehicles[0].id,
    employees[0].id,
    employees[0].nama,
    employees[0].nik,
    employees[0].departemen,
    vehicles[0].platTampil,
    `${vehicles[0].merek} ${vehicles[0].tipe}`,
    vehicles[0].tahun,
    vehicles[0].warna,
    petugas1.id,
    'seed-idemp-1',
    '2028-08-15',
    '2027-08-20',
    yesterday,
    yesterday,
    yesterday
  );

  let knalpotTemuanId = '';
  const insertItem = db.prepare(
    `INSERT INTO inspeksi_item (
      id, inspeksi_id, parameter_id, parameter_versi, kelompok_snapshot, nama_snapshot, deskripsi_snapshot,
      wajib_snapshot, jenis_temuan_snapshot, boleh_tidak_berlaku_snapshot, wajib_foto_snapshot,
      acuan_jenis_snapshot, acuan_teks_snapshot, urutan_snapshot, status, catatan, alasan_tidak_berlaku
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const p of paramRows) {
    const itemId = uuidv4();
    const isKnalpot = p.nama === 'Knalpot';
    const status = isKnalpot ? 'Tidak Sesuai' : 'Sesuai';
    const catatan = isKnalpot ? 'Knalpot tidak sesuai standar pabrikan (suara bising / modifikasi).' : null;
    insertItem.run(
      itemId,
      insp1Id,
      p.id,
      p.kelompok,
      p.nama,
      p.deskripsi,
      p.wajib,
      p.jenis,
      p.bolehTB,
      p.wajibFoto,
      p.acuanJenis,
      p.acuanTeks,
      p.urutan,
      status,
      catatan,
      null
    );

    if (isKnalpot) {
      const photo = createSamplePhoto('knalpot_b1234ksp.png');
      db.prepare(
        `INSERT INTO bukti_foto (id, inspeksi_item_id, kunci_penyimpanan, nama_asli, jenis, ukuran, tipe_mime, checksum, diambil_pada, diunggah_oleh)
         VALUES (?, ?, ?, ?, 'Fisik', ?, 'image/png', ?, ?, ?)`
      ).run(uuidv4(), itemId, photo.key, 'knalpot_1234.png', photo.size, photo.checksum, yesterday, petugas1.id);

      knalpotTemuanId = uuidv4();
      db.prepare(
        `INSERT INTO temuan (id, inspeksi_id, inspeksi_item_id, status, dibuat_pada)
         VALUES (?, ?, ?, 'Terbuka', ?)`
      ).run(knalpotTemuanId, insp1Id, itemId, yesterday);
    }
  }

  // Teguran Manual oleh PIC untuk inspeksi #1
  db.prepare(
    `INSERT INTO teguran_manual (id, inspeksi_id, dikirim_pada, saluran, catatan, dicatat_oleh, dicatat_pada)
     VALUES (?, ?, ?, 'Email Internal', 'Email teguran manual dikirim ke karyawan terkait penggantian knalpot standar.', ?, ?)`
  ).run(uuidv4(), insp1Id, yesterday, picUser.id, yesterday);

  // Penangguhan Akses Kendaraan aktif oleh PIC untuk B 1234 KSP
  const penangguhanId = uuidv4();
  db.prepare(
    `INSERT INTO penangguhan_akses (id, kendaraan_id, status, alasan, berlaku_efektif_pada, dicatat_oleh, dicatat_pada)
     VALUES (?, ?, 'Aktif', 'Temuan knalpot non-standar belum diperbaiki; menunggu penggantian dan inspeksi ulang.', ?, ?, ?)`
  ).run(penangguhanId, vehicles[0].id, yesterday, picUser.id, yesterday);
  db.prepare(
    `INSERT INTO penangguhan_temuan (penangguhan_id, temuan_id) VALUES (?, ?)`
  ).run(penangguhanId, knalpotTemuanId);

  // 6. Contoh Inspeksi #2: B 5678 XYZ — Ada Temuan (Spion + STNK), Menunggu Tindak Lanjut PIC (BELUM ditangguhkan)
  const insp2Id = uuidv4();
  db.prepare(
    `INSERT INTO inspeksi (
      id, kode_inspeksi, kendaraan_id, karyawan_id_snapshot, nama_karyawan_snapshot, nik_snapshot, departemen_snapshot,
      plat_tampil_snapshot, merek_tipe_snapshot, tahun_snapshot, warna_snapshot, petugas_id,
      jenis, status, hasil, status_tindak_lanjut, kunci_idempotensi, is_demo,
      masa_berlaku_sim, masa_berlaku_stnk_pajak, dibuat_pada, diubah_pada, difinalkan_pada
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awal', 'Final', 'Ada Temuan', 'Menunggu Tindak Lanjut PIC', ?, 0, ?, ?, ?, ?, ?)`
  ).run(
    insp2Id,
    'INS-20261121-0001',
    vehicles[1].id,
    employees[1].id,
    employees[1].nama,
    employees[1].nik,
    employees[1].departemen,
    vehicles[1].platTampil,
    `${vehicles[1].merek} ${vehicles[1].tipe}`,
    vehicles[1].tahun,
    vehicles[1].warna,
    petugas1.id,
    'seed-idemp-2',
    '2029-03-10',
    '2026-10-01',
    twoHoursAgo,
    twoHoursAgo,
    twoHoursAgo
  );

  for (const p of paramRows) {
    const itemId = uuidv4();
    const isSpion = p.nama === 'Dua Spion';
    const isStnk = p.nama === 'STNK Kendaraan';
    const status = isSpion || isStnk ? 'Tidak Sesuai' : 'Sesuai';
    const catatan = isSpion
      ? 'Spion kanan tidak terpasang.'
      : isStnk
        ? 'Pengendara tidak membawa STNK asli saat pemeriksaan.'
        : null;
    insertItem.run(
      itemId,
      insp2Id,
      p.id,
      p.kelompok,
      p.nama,
      p.deskripsi,
      p.wajib,
      p.jenis,
      p.bolehTB,
      p.wajibFoto,
      p.acuanJenis,
      p.acuanTeks,
      p.urutan,
      status,
      catatan,
      null
    );

    if (isSpion) {
      const photo = createSamplePhoto('spion_b5678xyz.png');
      db.prepare(
        `INSERT INTO bukti_foto (id, inspeksi_item_id, kunci_penyimpanan, nama_asli, jenis, ukuran, tipe_mime, checksum, diambil_pada, diunggah_oleh)
         VALUES (?, ?, ?, ?, 'Fisik', ?, 'image/png', ?, ?, ?)`
      ).run(uuidv4(), itemId, photo.key, 'spion_kanan.png', photo.size, photo.checksum, twoHoursAgo, petugas1.id);
    }
    if (isSpion || isStnk) {
      db.prepare(
        `INSERT INTO temuan (id, inspeksi_id, inspeksi_item_id, status, dibuat_pada)
         VALUES (?, ?, ?, 'Terbuka', ?)`
      ).run(uuidv4(), insp2Id, itemId, twoHoursAgo);
    }
  }

  // 7. Contoh Inspeksi #3: B 2468 MNO — Sesuai Seluruhnya
  const insp3Id = uuidv4();
  db.prepare(
    `INSERT INTO inspeksi (
      id, kode_inspeksi, kendaraan_id, karyawan_id_snapshot, nama_karyawan_snapshot, nik_snapshot, departemen_snapshot,
      plat_tampil_snapshot, merek_tipe_snapshot, tahun_snapshot, warna_snapshot, petugas_id,
      jenis, status, hasil, status_tindak_lanjut, kunci_idempotensi, is_demo,
      masa_berlaku_sim, masa_berlaku_stnk_pajak, dibuat_pada, diubah_pada, difinalkan_pada
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Awal', 'Final', 'Sesuai Seluruhnya', 'Tidak Perlu', ?, 0, ?, ?, ?, ?, ?)`
  ).run(
    insp3Id,
    'INS-20261121-0002',
    vehicles[2].id,
    employees[2].id,
    employees[2].nama,
    employees[2].nik,
    employees[2].departemen,
    vehicles[2].platTampil,
    `${vehicles[2].merek} ${vehicles[2].tipe}`,
    vehicles[2].tahun,
    vehicles[2].warna,
    petugas1.id,
    'seed-idemp-3',
    '2029-11-01',
    '2027-05-15',
    oneHourAgo,
    oneHourAgo,
    oneHourAgo
  );

  for (const p of paramRows) {
    insertItem.run(
      uuidv4(),
      insp3Id,
      p.id,
      p.kelompok,
      p.nama,
      p.deskripsi,
      p.wajib,
      p.jenis,
      p.bolehTB,
      p.wajibFoto,
      p.acuanJenis,
      p.acuanTeks,
      p.urutan,
      'Sesuai',
      null,
      null
    );
  }

  recordAudit({
    pelakuId: adminUser.id,
    pelakuNama: adminUser.nama,
    entitas: 'sistem',
    idEntitas: 'seed',
    aksi: 'INISIALISASI_DATA_CONTOH',
    nilaiSesudah: {
      pengguna: users.length,
      karyawan: employees.length,
      kendaraan: vehicles.length,
      parameter: paramRows.length,
      inspeksi: 3,
    },
    alamatIp: '127.0.0.1',
  });

  console.log('[Seed] Data contoh berhasil dibuat (4 akun, 6 karyawan, 5 kendaraan termasuk B 1234 KSP, 18 parameter, 3 inspeksi, 1 penangguhan aktif).');
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase(process.argv.includes('--force'));
}
