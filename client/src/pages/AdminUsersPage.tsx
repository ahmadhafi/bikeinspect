import React, { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, KeyRound, UserPlus } from 'lucide-react';
import { apiFetch, formatWib } from '../lib/api';

interface UserRow {
  id: string;
  username: string;
  nama: string;
  peran: 'Petugas' | 'PIC' | 'Admin';
  aktif: number;
  dibuat_pada: string;
}

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [form, setForm] = useState({ username: '', nama: '', peran: 'Petugas', password: '' });
  const [saving, setSaving] = useState(false);

  const [resetId, setResetId] = useState<string | null>(null);
  const [resetPwd, setResetPwd] = useState('');

  const load = () => {
    apiFetch<{ items: UserRow[] }>('/api/admin/users')
      .then((res) => setUsers(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      await apiFetch('/api/admin/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ username: '', nama: '', peran: 'Petugas', password: '' });
      setMsg({ type: 'ok', text: 'Akun pengguna baru berhasil ditambahkan.' });
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah pengguna.' });
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: UserRow) => {
    setMsg(null);
    try {
      await apiFetch(`/api/admin/users/${u.id}`, {
        method: 'PUT',
        body: JSON.stringify({ aktif: u.aktif !== 1 }),
      });
      setMsg({ type: 'ok', text: `Status akun ${u.username} diperbarui.` });
      load();
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengubah status.' });
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetId) return;
    setMsg(null);
    try {
      await apiFetch(`/api/admin/users/${resetId}`, {
        method: 'PUT',
        body: JSON.stringify({ newPassword: resetPwd }),
      });
      setResetId(null);
      setResetPwd('');
      setMsg({ type: 'ok', text: 'Kata sandi pengguna berhasil direset.' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal reset kata sandi.' });
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">Admin: Kelola Pengguna</h1>
        <p className="text-xs text-slate-500">
          Buat akun individual, atur peran (Petugas/PIC/Admin), nonaktifkan akun, atau reset kata sandi.
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

      {/* Form Tambah Pengguna */}
      <form onSubmit={handleCreate} className="card p-5 space-y-3">
        <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
          <UserPlus className="w-4 h-4 text-brand-700" />
          Tambah Akun Baru
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <input
            type="text"
            required
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
            className="input-field"
          />
          <input
            type="text"
            required
            placeholder="Nama Lengkap"
            value={form.nama}
            onChange={(e) => setForm((p) => ({ ...p, nama: e.target.value }))}
            className="input-field"
          />
          <select
            value={form.peran}
            onChange={(e) => setForm((p) => ({ ...p, peran: e.target.value }))}
            className="input-field"
          >
            <option value="Petugas">Petugas</option>
            <option value="PIC">PIC</option>
            <option value="Admin">Admin</option>
          </select>
          <input
            type="password"
            required
            minLength={8}
            placeholder="Kata Sandi (min. 8)"
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            className="input-field"
          />
        </div>
        <button type="submit" disabled={saving} className="btn-primary">
          {saving ? 'Menyimpan...' : 'Tambah Pengguna'}
        </button>
      </form>

      {/* Daftar Pengguna */}
      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Memuat daftar pengguna...</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-navy-900 text-white">
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Nama</th>
                <th className="py-3 px-4">Peran</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Dibuat</th>
                <th className="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-navy-900">{u.username}</td>
                  <td className="py-3 px-4 font-medium text-navy-900">{u.nama}</td>
                  <td className="py-3 px-4">
                    <span className="px-2.5 py-0.5 rounded-full bg-brand-50 text-brand-800 font-semibold">
                      {u.peran}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`px-2.5 py-0.5 rounded-full font-semibold ${
                        u.aktif === 1 ? 'bg-brand-50 text-brand-700' : 'bg-danger-50 text-danger-700'
                      }`}
                    >
                      {u.aktif === 1 ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500">{formatWib(u.dibuat_pada)}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <button
                      type="button"
                      onClick={() => setResetId(u.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-100 font-semibold"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Reset Sandi</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(u)}
                      className="inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-navy-900"
                    >
                      {u.aktif === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resetId && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 flex items-center justify-center p-4">
          <form onSubmit={handleResetPassword} className="card w-full max-w-sm p-5 space-y-3">
            <h3 className="font-bold text-base text-navy-900">Reset Kata Sandi Pengguna</h3>
            <input
              type="password"
              required
              minLength={8}
              value={resetPwd}
              onChange={(e) => setResetPwd(e.target.value)}
              placeholder="Kata sandi baru (min. 8 karakter)"
              className="input-field"
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setResetId(null)} className="btn-secondary flex-1">
                Batal
              </button>
              <button type="submit" className="btn-primary flex-1">
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
