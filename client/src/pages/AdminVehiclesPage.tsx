import React, { useEffect, useState } from 'react';
import { AlertCircle, Bike, CheckCircle2, Plus, Users } from 'lucide-react';
import { VehicleAccessBadge } from '../components/StatusBadges';
import { apiFetch, formatWib } from '../lib/api';

interface EmployeeRow {
  id: string;
  nik: string;
  nama: string;
  departemen: string;
  aktif: number;
}

interface VehicleRow {
  id: string;
  plat_tampil: string;
  merek: string;
  tipe: string;
  tahun: number;
  warna: string;
  status_akses: string;
  aktif: number;
  karyawan_nama: string;
  karyawan_nik: string;
  karyawan_departemen: string;
}

interface VehicleRequestRow {
  id: string;
  plat_tampil: string;
  catatan: string;
  pelapor_nama: string;
  status: string;
  dibuat_pada: string;
}

export function AdminVehiclesPage() {
  const [tab, setTab] = useState<'vehicles' | 'employees' | 'requests'>('vehicles');
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [vehicles, setVehicles] = useState<VehicleRow[]>([]);
  const [requests, setRequests] = useState<VehicleRequestRow[]>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [empForm, setEmpForm] = useState({ nik: '', nama: '', departemen: '' });
  const [vehForm, setVehForm] = useState({
    plat: '',
    merek: '',
    tipe: '',
    tahun: '2023',
    warna: '',
    karyawanId: '',
  });

  const loadAll = () => {
    apiFetch<{ items: EmployeeRow[] }>('/api/admin/employees').then((r) => setEmployees(r.items)).catch(() => {});
    apiFetch<{ items: VehicleRow[] }>('/api/admin/vehicles').then((r) => setVehicles(r.items)).catch(() => {});
    apiFetch<{ items: VehicleRequestRow[] }>('/api/admin/vehicle-requests').then((r) => setRequests(r.items)).catch(() => {});
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/employees', { method: 'POST', body: JSON.stringify(empForm) });
      setEmpForm({ nik: '', nama: '', departemen: '' });
      setMsg({ type: 'ok', text: 'Data karyawan berhasil ditambahkan.' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah karyawan.' });
    }
  };

  const handleAddVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/vehicles', {
        method: 'POST',
        body: JSON.stringify({ ...vehForm, tahun: Number(vehForm.tahun) }),
      });
      setVehForm({ plat: '', merek: '', tipe: '', tahun: '2023', warna: '', karyawanId: '' });
      setMsg({ type: 'ok', text: 'Data kendaraan berhasil didaftarkan.' });
      loadAll();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah kendaraan.' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">Admin: Karyawan & Kendaraan</h1>
        <p className="text-xs text-slate-500">
          Pendaftaran kendaraan dan pengelolaan data pemilik hanya dilakukan oleh Admin (PRD A-04, K-06).
        </p>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl text-sm flex items-center gap-2 border ${
            msg.type === 'ok'
              ? 'bg-brand-50 text-brand-900 border-brand-200'
              : 'bg-danger-50 text-danger-700 border-red-200'
          }`}
        >
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('vehicles')}
          className={tab === 'vehicles' ? 'btn-primary' : 'btn-secondary'}
        >
          <Bike className="w-4 h-4" />
          <span>Kendaraan ({vehicles.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('employees')}
          className={tab === 'employees' ? 'btn-primary' : 'btn-secondary'}
        >
          <Users className="w-4 h-4" />
          <span>Karyawan ({employees.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('requests')}
          className={tab === 'requests' ? 'btn-primary' : 'btn-secondary'}
        >
          <span>Laporan Belum Terdaftar ({requests.filter((r) => r.status === 'Menunggu').length})</span>
        </button>
      </div>

      {tab === 'vehicles' && (
        <div className="space-y-4">
          <form onSubmit={handleAddVehicle} className="card p-5 space-y-3">
            <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
              <Plus className="w-4 h-4 text-brand-700" />
              Daftarkan Kendaraan Roda Dua
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="Plat Nomor (contoh: B 4321 XYZ)"
                value={vehForm.plat}
                onChange={(e) => setVehForm((p) => ({ ...p, plat: e.target.value.toUpperCase() }))}
                className="input-field uppercase"
              />
              <input
                type="text"
                required
                placeholder="Merek (contoh: Honda)"
                value={vehForm.merek}
                onChange={(e) => setVehForm((p) => ({ ...p, merek: e.target.value }))}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="Tipe (contoh: Beat)"
                value={vehForm.tipe}
                onChange={(e) => setVehForm((p) => ({ ...p, tipe: e.target.value }))}
                className="input-field"
              />
              <input
                type="number"
                required
                min={1980}
                max={2035}
                placeholder="Tahun"
                value={vehForm.tahun}
                onChange={(e) => setVehForm((p) => ({ ...p, tahun: e.target.value }))}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="Warna"
                value={vehForm.warna}
                onChange={(e) => setVehForm((p) => ({ ...p, warna: e.target.value }))}
                className="input-field"
              />
              <select
                required
                value={vehForm.karyawanId}
                onChange={(e) => setVehForm((p) => ({ ...p, karyawanId: e.target.value }))}
                className="input-field"
              >
                <option value="">Pilih Karyawan Pemilik...</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nama} ({e.nik} · {e.departemen})
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-primary">
              Simpan Kendaraan
            </button>
          </form>

          <div className="card overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-navy-900 text-white">
                  <th className="py-3 px-4">Plat Nomor</th>
                  <th className="py-3 px-4">Merek / Tipe</th>
                  <th className="py-3 px-4">Tahun & Warna</th>
                  <th className="py-3 px-4">Pemilik (NIK & Dept)</th>
                  <th className="py-3 px-4">Status Akses</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {vehicles.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-extrabold text-navy-900">{v.plat_tampil}</td>
                    <td className="py-3 px-4">
                      {v.merek} {v.tipe}
                    </td>
                    <td className="py-3 px-4">
                      {v.tahun} · {v.warna}
                    </td>
                    <td className="py-3 px-4">
                      <p className="font-semibold text-navy-900">{v.karyawan_nama}</p>
                      <p className="text-[11px] text-slate-500">
                        {v.karyawan_nik} · {v.karyawan_departemen}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <VehicleAccessBadge status={v.status_akses} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'employees' && (
        <div className="space-y-4">
          <form onSubmit={handleAddEmployee} className="card p-5 space-y-3">
            <h2 className="font-bold text-sm text-navy-900">Tambah Data Karyawan</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <input
                type="text"
                required
                placeholder="NIK Karyawan (contoh: EMP-2026-0701)"
                value={empForm.nik}
                onChange={(e) => setEmpForm((p) => ({ ...p, nik: e.target.value }))}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="Nama Lengkap"
                value={empForm.nama}
                onChange={(e) => setEmpForm((p) => ({ ...p, nama: e.target.value }))}
                className="input-field"
              />
              <input
                type="text"
                required
                placeholder="Departemen"
                value={empForm.departemen}
                onChange={(e) => setEmpForm((p) => ({ ...p, departemen: e.target.value }))}
                className="input-field"
              />
            </div>
            <button type="submit" className="btn-primary">
              Simpan Karyawan
            </button>
          </form>

          <div className="card overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-navy-900 text-white">
                  <th className="py-3 px-4">NIK</th>
                  <th className="py-3 px-4">Nama Karyawan</th>
                  <th className="py-3 px-4">Departemen</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-navy-900">{e.nik}</td>
                    <td className="py-3 px-4 font-semibold text-navy-900">{e.nama}</td>
                    <td className="py-3 px-4">{e.departemen}</td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">
                        {e.aktif === 1 ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="card overflow-hidden">
          {requests.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Belum ada laporan kendaraan belum terdaftar dari Petugas.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {requests.map((r) => (
                <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  <div>
                    <p className="font-extrabold text-navy-900 text-sm">{r.plat_tampil}</p>
                    <p className="text-slate-600">{r.catatan || 'Tanpa catatan tambahan.'}</p>
                    <p className="text-[11px] text-slate-400">
                      Dilaporkan oleh {r.pelapor_nama} · {formatWib(r.dibuat_pada)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 rounded-full font-semibold ${
                        r.status === 'Diproses' ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {r.status}
                    </span>
                    {r.status === 'Menunggu' && (
                      <button
                        type="button"
                        onClick={() => {
                          setVehForm((p) => ({ ...p, plat: r.plat_tampil }));
                          setTab('vehicles');
                        }}
                        className="btn-secondary min-h-[40px] text-xs px-3"
                      >
                        Daftarkan Sekarang
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
