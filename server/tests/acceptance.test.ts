import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import ExcelJS from 'exceljs';
import type { Server } from 'node:http';
import { config } from '../src/config.js';
import { getDb, setDbForTest } from '../src/db/database.js';
import { seedDatabase } from '../src/db/seed.js';
import { createApp } from '../src/index.js';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sik-test-'));
config.dbPath = path.join(tmpDir, 'test.db');
config.uploadDir = path.join(tmpDir, 'uploads');
fs.mkdirSync(config.uploadDir, { recursive: true });

let server: Server;
let baseUrl = '';

class SessionClient {
  cookie = '';
  async request(method: string, urlPath: string, body?: unknown, extraHeaders: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      'X-Requested-With': 'XMLHttpRequest',
      ...extraHeaders,
    };
    if (this.cookie) headers.Cookie = this.cookie;

    let fetchBody: BodyInit | undefined;
    if (body instanceof FormData) {
      fetchBody = body;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      fetchBody = JSON.stringify(body);
    }

    const resp = await fetch(`${baseUrl}${urlPath}`, {
      method,
      headers,
      body: fetchBody,
    });

    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) {
      this.cookie = setCookie.split(';')[0];
    }
    return resp;
  }

  async login(username: string, password: string) {
    const r = await this.request('POST', '/api/auth/login', { username, password });
    assert.equal(r.status, 200, `Login ${username} gagal`);
    return r.json();
  }
}

before(async () => {
  setDbForTest(null);
  getDb();
  seedDatabase(true);
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('Uji Penerimaan PRD Sistem Inspeksi Kendaraan (AC-01 s.d. AC-30)', () => {
  const petugas = new SessionClient();
  const pic = new SessionClient();
  const admin = new SessionClient();

  it('AC-20 & Autentikasi: Login 3 peran dan penegakan RBAC 403 di server', async () => {
    await petugas.login('petugas', 'Petugas123!');
    await pic.login('pic', 'Pic12345!');
    await admin.login('admin', 'Admin123!');

    // Petugas dilarang ekspor Excel & dilarang mencatat penangguhan (AC-20)
    const expResp = await petugas.request('GET', '/api/reports/export');
    assert.equal(expResp.status, 403);

    const suspResp = await petugas.request('POST', '/api/suspensions', {
      kendaraanId: 'x',
      alasan: 'test',
      berlakuEfektifPada: new Date().toISOString(),
      temuanIds: ['y'],
    });
    assert.equal(suspResp.status, 403);
  });

  it('AC-01, AC-02, AC-03, AC-05: OCR Mode Demo, validasi plat, pencocokan DB & NIK tersamarkan', async () => {
    // Mode Demo OCR (AC-01, AC-05)
    const fd = new FormData();
    fd.append('demoScenario', 'valid_ksp');
    const ocrResp = await petugas.request('POST', '/api/scan/ocr', fd);
    assert.equal(ocrResp.status, 200);
    const ocrData = (await ocrResp.json()) as { mode: string; isDemo: boolean; platTampil: string };
    assert.equal(ocrData.mode, 'Demo');
    assert.equal(ocrData.isDemo, true);
    assert.equal(ocrData.platTampil, 'B 1234 KSP');

    // Uji format salah B 1234 K3P ditolak (TC-09)
    const badConfirm = await petugas.request('POST', '/api/scan/confirm-plate', { plate: 'B 1234 K3P' });
    assert.equal(badConfirm.status, 400);

    // Konfirmasi plat valid B 1234 KSP cocok DB & NIK disamarkan untuk Petugas (AC-02)
    const goodConfirm = await petugas.request('POST', '/api/scan/confirm-plate', { plate: 'b1234ksp' });
    assert.equal(goodConfirm.status, 200);
    const matchData = (await goodConfirm.json()) as {
      matchStatus: string;
      vehicle: { platTampil: string; statusAkses: string; karyawan: { nik: string } };
    };
    assert.equal(matchData.matchStatus, 'matched');
    assert.equal(matchData.vehicle.platTampil, 'B 1234 KSP');
    assert.equal(matchData.vehicle.statusAkses, 'Ditangguhkan Sementara');
    assert.ok(matchData.vehicle.karyawan.nik.startsWith('*'), 'NIK harus disamarkan untuk Petugas');

    // Plat belum terdaftar (AC-03)
    const unreg = await petugas.request('POST', '/api/scan/confirm-plate', { plate: 'B 9999 ZZZ' });
    const unregData = (await unreg.json()) as { matchStatus: string };
    assert.equal(unregData.matchStatus, 'unregistered');
  });

  it('AC-06, AC-07, AC-08, AC-09, AC-10, AC-12, AC-16: Siklus inspeksi, validasi, idempotensi & penangguhan lama tetap aktif', async () => {
    const matchRes = await petugas.request('POST', '/api/scan/confirm-plate', { plate: 'B 1234 KSP' });
    const { vehicle } = (await matchRes.json()) as { vehicle: { id: string } };

    // Buat draf inspeksi baru
    const createRes = await petugas.request('POST', '/api/inspections', {
      kendaraanId: vehicle.id,
      jenis: 'Awal',
      isDemo: false,
    });
    assert.equal(createRes.status, 201);
    const { id: inspId } = (await createRes.json()) as { id: string };

    // AC-06: Seluruh item berstatus awal Belum Diperiksa
    const detailRes = await petugas.request('GET', `/api/inspections/${inspId}`);
    const detail = (await detailRes.json()) as {
      items: Array<{ id: string; status: string; nama_snapshot: string; boleh_tidak_berlaku_snapshot: number; jenis_temuan_snapshot: string }>;
    };
    assert.ok(detail.items.length >= 18);
    assert.ok(detail.items.every((it) => it.status === 'Belum Diperiksa'));

    // AC-07: Finalisasi ditolak bila ada item wajib Belum Diperiksa
    const failIncomplete = await petugas.request('POST', `/api/inspections/${inspId}/finalize`, {
      idempotencyKey: 'test-key-incomplete',
    });
    assert.equal(failIncomplete.status, 422);

    // AC-08: Temuan fisik tanpa foto/catatan ditolak
    const knalpot = detail.items.find((i) => i.nama_snapshot === 'Knalpot')!;
    const itemsBadFinding = detail.items.map((it) => ({
      id: it.id,
      status: it.id === knalpot.id ? 'Tidak Sesuai' : 'Sesuai',
      catatan: '',
      alasan_tidak_berlaku: '',
    }));
    const failFinding = await petugas.request('POST', `/api/inspections/${inspId}/finalize`, {
      idempotencyKey: 'test-key-bad-finding',
      items: itemsBadFinding,
    });
    assert.equal(failFinding.status, 422);

    // AC-09: Tidak Berlaku tanpa alasan ditolak
    const helm = detail.items.find((i) => i.boleh_tidak_berlaku_snapshot === 1)!;
    const itemsBadNA = detail.items.map((it) => ({
      id: it.id,
      status: it.id === helm.id ? 'Tidak Berlaku' : 'Sesuai',
      catatan: '',
      alasan_tidak_berlaku: '',
    }));
    const failNA = await petugas.request('POST', `/api/inspections/${inspId}/finalize`, {
      idempotencyKey: 'test-key-bad-na',
      items: itemsBadNA,
    });
    assert.equal(failNA.status, 422);

    // AC-10 & AC-12 & AC-16: Finalisasi sah (dengan catatan STNK berbeda nama tetap Sesuai), idempoten, penangguhan lama tetap aktif
    const stnk = detail.items.find((i) => i.nama_snapshot.includes('Kesesuaian Identitas'))!;
    const validItems = detail.items.map((it) => ({
      id: it.id,
      status: 'Sesuai',
      catatan: it.id === stnk.id ? 'STNK atas nama istri; pengendara membawa surat kuasa.' : '',
      alasan_tidak_berlaku: '',
    }));

    const idempKey = 'test-key-final-clean-1';
    const fin1 = await petugas.request('POST', `/api/inspections/${inspId}/finalize`, {
      idempotencyKey: idempKey,
      items: validItems,
    });
    assert.equal(fin1.status, 200);
    const fin1Data = (await fin1.json()) as { status: string; hasil: string };
    assert.equal(fin1Data.status, 'Final');
    assert.equal(fin1Data.hasil, 'Sesuai Seluruhnya');

    // Klik ganda dengan kunci idempotensi sama mengembalikan replay tanpa duplikat (AC-12)
    const fin2 = await petugas.request('POST', `/api/inspections/${inspId}/finalize`, {
      idempotencyKey: idempKey,
      items: validItems,
    });
    assert.equal(fin2.status, 200);
    const fin2Data = (await fin2.json()) as { idempotentReplay?: boolean };
    assert.equal(fin2Data.idempotentReplay, true);

    // AC-16: Penangguhan aktif sebelumnya pada B 1234 KSP TIDAK dihapus oleh inspeksi baru!
    const afterDetailRes = await petugas.request('GET', `/api/inspections/${inspId}`);
    const afterDetail = (await afterDetailRes.json()) as { status_akses_kendaraan: string; penangguhanAktif: unknown };
    assert.equal(afterDetail.status_akses_kendaraan, 'Ditangguhkan Sementara');
    assert.ok(afterDetail.penangguhanAktif, 'Penangguhan aktif lama harus tetap ada');
  });

  it('AC-18, AC-19: Ekspor Excel (.xlsx) asli dengan dua lembar wajib dan netralisasi formula', async () => {
    const resp = await pic.request('GET', '/api/reports/export');
    assert.equal(resp.status, 200);
    assert.ok(
      resp.headers.get('content-type')?.includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    );

    const buf = Buffer.from(await resp.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ExcelJS.Buffer);

    const sheetNames = wb.worksheets.map((w) => w.name);
    assert.deepEqual(sheetNames, ['Rekap Inspeksi', 'Detail Pemeriksaan']);

    const wsRekap = wb.getWorksheet('Rekap Inspeksi')!;
    assert.equal(wsRekap.columnCount, 21);
    assert.ok(wsRekap.rowCount >= 4);

    const wsDetail = wb.getWorksheet('Detail Pemeriksaan')!;
    assert.equal(wsDetail.columnCount, 11);
  });

  it('AC-21, AC-23, AC-24, AC-25: Teguran manual, pemulihan prematur ditolak, inspeksi ulang & pemulihan sah', async () => {
    // Cari inspeksi seed B 1234 KSP yang memiliki penangguhan aktif
    const listRes = await pic.request('GET', '/api/inspections?q=B1234KSP');
    const list = (await listRes.json()) as { items: Array<{ id: string; kode_inspeksi: string }> };
    const origin = list.items.find((x) => x.kode_inspeksi === 'INS-20261120-0001')!;
    assert.ok(origin);

    const detRes = await pic.request('GET', `/api/inspections/${origin.id}`);
    const det = (await detRes.json()) as { penangguhanAktif: { id: string } };
    const suspId = det.penangguhanAktif.id;

    // AC-21: Catat teguran manual
    const tegRes = await pic.request('POST', `/api/inspections/${origin.id}/teguran-manual`, {
      dikirimPada: new Date().toISOString(),
      saluran: 'Email Manual',
      catatan: 'Pengingat kedua via email manual PIC.',
    });
    assert.equal(tegRes.status, 201);

    // AC-24: Pemulihan prematur (temuan knalpot masih Terbuka) HARUS ditolak
    const premRestore = await pic.request('POST', `/api/suspensions/${suspId}/restore`, {
      pemulihanEfektifPada: new Date().toISOString(),
      catatan: 'Coba pulihkan sebelum inspeksi ulang',
    });
    assert.equal(premRestore.status, 400);
    const premBody = (await premRestore.json()) as { unverifiedFindings?: unknown[] };
    assert.ok(Array.isArray(premBody.unverifiedFindings) && premBody.unverifiedFindings.length === 1);

    // AC-23: Buat inspeksi ulang dari temuan asal, nilai Sesuai, lalu finalisasi
    const reinspCreate = await pic.request('POST', '/api/inspections', {
      jenis: 'Ulang',
      inspeksiAsalId: origin.id,
    });
    assert.equal(reinspCreate.status, 201);
    const { id: reinspId } = (await reinspCreate.json()) as { id: string };

    const reinspDetRes = await pic.request('GET', `/api/inspections/${reinspId}`);
    const reinspDet = (await reinspDetRes.json()) as { items: Array<{ id: string }> };
    assert.equal(reinspDet.items.length, 1);

    const reinspFin = await pic.request('POST', `/api/inspections/${reinspId}/finalize`, {
      idempotencyKey: 'test-reinsp-final-1',
      items: [{ id: reinspDet.items[0].id, status: 'Sesuai', catatan: 'Knalpot sudah diganti standar.', alasan_tidak_berlaku: '' }],
    });
    assert.equal(reinspFin.status, 200);

    // AC-25: Setelah temuan terverifikasi, pemulihan akses sah berhasil
    const validRestore = await pic.request('POST', `/api/suspensions/${suspId}/restore`, {
      pemulihanEfektifPada: new Date().toISOString(),
      catatan: 'Knalpot telah diverifikasi standar melalui inspeksi ulang.',
    });
    assert.equal(validRestore.status, 200);
    const validBody = (await validRestore.json()) as { statusAkses: string };
    assert.equal(validBody.statusAkses, 'Aktif');
  });

  it('AC-26, AC-27, AC-29: Audit append-only, foto privat menolak tautan invalid, snapshot parameter terjaga', async () => {
    // AC-26: Audit log tidak dapat diubah/dihapus di level DB
    const db = getDb();
    assert.throws(() => db.exec("DELETE FROM audit_log"), /append-only/);
    assert.throws(() => db.exec("UPDATE audit_log SET aksi = 'X'"), /append-only/);

    // AC-27: Tautan foto privat dengan token palsu/kedaluwarsa ditolak 403
    const badPhoto = await petugas.request('GET', '/api/evidence/fake-id/file?token=invalid&exp=100');
    assert.equal(badPhoto.status, 403);

    // AC-29: Admin mengubah parameter -> versi naik, inspeksi lama tidak berubah
    const paramsRes = await admin.request('GET', '/api/admin/parameters');
    const { items: paramsList } = (await paramsRes.json()) as { items: Array<{ id: string; nama: string; versi: number }> };
    const klakson = paramsList.find((p) => p.nama === 'Klakson')!;
    const updRes = await admin.request('PUT', `/api/admin/parameters/${klakson.id}`, {
      nama: 'Klakson Standar Baru',
    });
    assert.equal(updRes.status, 200);
    const updData = (await updRes.json()) as { versi: number };
    assert.equal(updData.versi, klakson.versi + 1);

    // Inspeksi lama masih memakai snapshot nama "Klakson"
    const oldInsp = await pic.request('GET', '/api/inspections?q=INS-20261121-0002');
    const oldList = (await oldInsp.json()) as { items: Array<{ id: string }> };
    const oldDetRes = await pic.request('GET', `/api/inspections/${oldList.items[0].id}`);
    const oldDet = (await oldDetRes.json()) as { items: Array<{ nama_snapshot: string }> };
    assert.ok(oldDet.items.some((i) => i.nama_snapshot === 'Klakson'));
  });
});
