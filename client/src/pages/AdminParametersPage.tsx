import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface ParamRow {
  id: string;
  kelompok: string;
  nama: string;
  deskripsi: string;
  wajib: number;
  jenis_temuan: string;
  boleh_tidak_berlaku: number;
  wajib_foto: number;
  acuan_jenis: string;
  acuan_teks: string;
  urutan: number;
  versi: number;
  aktif: number;
}

export function AdminParametersPage() {
  const [params, setParams] = useState<ParamRow[]>([]);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [form, setForm] = useState({
    kelompok: 'Kelengkapan',
    nama: '',
    deskripsi: '',
    wajib: true,
    jenisTemuan: 'Fisik',
    bolehTidakBerlaku: false,
    wajibFoto: true,
    acuanJenis: 'Internal',
    acuanTeks: '',
    urutan: 20,
  });

  const load = () => {
    apiFetch<{ items: ParamRow[] }>('/api/admin/parameters')
      .then((r) => setParams(r.items))
      .catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch('/api/admin/parameters', { method: 'POST', body: JSON.stringify(form) });
      setForm({
        kelompok: 'Kelengkapan',
        nama: '',
        deskripsi: '',
        wajib: true,
        jenisTemuan: 'Fisik',
        bolehTidakBerlaku: false,
        wajibFoto: true,
        acuanJenis: 'Internal',
        acuanTeks: '',
        urutan: params.length + 1,
      });
      setMsg({
        type: 'ok',
        text: 'Parameter pemeriksaan baru berhasil ditambahkan (berlaku untuk inspeksi baru; inspeksi lama tetap memakai snapshot).',
      });
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah parameter.' });
    }
  };

  const toggleActive = async (p: ParamRow) => {
    setMsg(null);
    try {
      await apiFetch(`/api/admin/parameters/${p.id}`, {
        method: 'PUT',
        body: JSON.stringify({ aktif: p.aktif !== 1 }),
      });
      setMsg({ type: 'ok', text: `Parameter "${p.nama}" diperbarui (versi ${p.versi + 1}).` });
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengubah parameter.' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">Admin: Parameter Pemeriksaan</h1>
        <p className="text-xs text-slate-500">
          Perubahan parameter hanya berlaku untuk inspeksi baru; inspeksi lama tetap mempertahankan snapshot parameter saat dibuat (FR-ADM-04).
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

      <form onSubmit={handleCreate} className="card p-5 space-y-3">
        <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
          <Plus className="w-4 h-4 text-brand-700" />
          Tambah Parameter Pemeriksaan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <select
            value={form.kelompok}
            onChange={(e) => setForm((p) => ({ ...p, kelompok: e.target.value }))}
            className="input-field"
          >
            <option value="Administrasi">Administrasi</option>
            <option value="Kelengkapan">Kelengkapan</option>
            <option value="Kondisi Teknis">Kondisi Teknis</option>
            <option value="Pengendara">Pengendara</option>
          </select>
          <input
            type="text"
            required
            placeholder="Nama Parameter"
            value={form.nama}
            onChange={(e) => setForm((p) => ({ ...p, nama: e.target.value }))}
            className="input-field"
          />
          <select
            value={form.jenisTemuan}
            onChange={(e) =>
              setForm((p) => ({
                ...p,
                jenisTemuan: e.target.value,
                wajibFoto: e.target.value === 'Fisik',
              }))
            }
            className="input-field"
          >
            <option value="Fisik">Jenis Temuan: Fisik</option>
            <option value="Administrasi">Jenis Temuan: Administrasi</option>
          </select>
          <input
            type="number"
            placeholder="Urutan"
            value={form.urutan}
            onChange={(e) => setForm((p) => ({ ...p, urutan: Number(e.target.value) }))}
            className="input-field"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="Deskripsi singkat pemeriksaan"
            value={form.deskripsi}
            onChange={(e) => setForm((p) => ({ ...p, deskripsi: e.target.value }))}
            className="input-field"
          />
          <select
            value={form.acuanJenis}
            onChange={(e) => setForm((p) => ({ ...p, acuanJenis: e.target.value }))}
            className="input-field"
          >
            <option value="Internal">Acuan: Ketentuan Internal Perusahaan</option>
            <option value="Hukum">Acuan: Persyaratan Hukum (terkonfirmasi)</option>
            <option value="Tidak Ada">Acuan: Tidak Ada</option>
          </select>
          <input
            type="text"
            placeholder="Teks acuan ketentuan (opsional)"
            value={form.acuanTeks}
            onChange={(e) => setForm((p) => ({ ...p, acuanTeks: e.target.value }))}
            className="input-field"
          />
        </div>
        <div className="flex flex-wrap gap-5 text-xs font-medium text-navy-900">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.wajib}
              onChange={(e) => setForm((p) => ({ ...p, wajib: e.target.checked }))}
              className="w-4 h-4 accent-brand-700"
            />
            Wajib Diperiksa
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.wajibFoto}
              onChange={(e) => setForm((p) => ({ ...p, wajibFoto: e.target.checked }))}
              className="w-4 h-4 accent-brand-700"
            />
            Wajib Foto Bukti saat Temuan
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.bolehTidakBerlaku}
              onChange={(e) => setForm((p) => ({ ...p, bolehTidakBerlaku: e.target.checked }))}
              className="w-4 h-4 accent-brand-700"
            />
            Boleh Status &ldquo;Tidak Berlaku&rdquo;
          </label>
        </div>
        <button type="submit" className="btn-primary">
          Simpan Parameter
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-navy-900 text-white">
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Kelompok & Nama</th>
              <th className="py-3 px-4">Aturan</th>
              <th className="py-3 px-4">Acuan Ketentuan</th>
              <th className="py-3 px-4">Versi</th>
              <th className="py-3 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {params.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="py-3 px-4 font-mono text-slate-500">{p.urutan}</td>
                <td className="py-3 px-4">
                  <span className="text-[10px] font-bold uppercase text-brand-700">{p.kelompok}</span>
                  <p className="font-bold text-navy-900">{p.nama}</p>
                  <p className="text-[11px] text-slate-500">{p.deskripsi}</p>
                </td>
                <td className="py-3 px-4 space-y-0.5 text-[11px]">
                  <p>{p.wajib === 1 ? 'Wajib' : 'Opsional'} · {p.jenis_temuan}</p>
                  <p className="text-slate-500">
                    Foto: {p.wajib_foto === 1 ? 'Wajib' : 'Opsional'} · Tdk Berlaku: {p.boleh_tidak_berlaku === 1 ? 'Boleh' : 'Tidak'}
                  </p>
                </td>
                <td className="py-3 px-4 text-[11px]">
                  <span className="font-semibold">{p.acuan_jenis}</span>
                  {p.acuan_teks && <p className="text-slate-500">{p.acuan_teks}</p>}
                </td>
                <td className="py-3 px-4 font-mono">v{p.versi}</td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleActive(p)}
                    className={`px-3 py-1.5 rounded-lg font-semibold ${
                      p.aktif === 1
                        ? 'bg-brand-50 text-brand-700 hover:bg-brand-100'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {p.aktif === 1 ? 'Aktif' : 'Nonaktif'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
