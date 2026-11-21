import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Lock, ShieldCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal masuk ke sistem.');
    } finally {
      setSubmitting(false);
    }
  };

  const quickFill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
    setError('');
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header gelap mengikuti acuan Gambar 3 */}
      <div className="bg-navy-900 text-white pt-10 pb-20 px-4">
        <div className="max-w-md mx-auto text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-brand-700 border border-brand-500/40 flex items-center justify-center mx-auto shadow-lg">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">Sistem Inspeksi Kendaraan</h1>
            <p className="text-sm text-emerald-200 mt-1">
              Inspeksi, Tindak Lanjut & Pelaporan Kendaraan Roda Dua
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 px-4 -mt-12 pb-10">
        <div className="card max-w-md mx-auto p-6 sm:p-7 space-y-5">
          <div>
            <h2 className="text-lg font-bold text-navy-900">Masuk ke Akun Anda</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Gunakan akun individual sesuai peran (Petugas, PIC, atau Admin).
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-danger-50 border border-red-200 text-danger-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Nama Pengguna
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan nama pengguna"
                  className="input-field pl-10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="password" className="block text-xs font-semibold text-slate-700 mb-1.5">
                Kata Sandi
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="input-field pl-10"
                />
              </div>
            </div>

            <button type="submit" disabled={submitting} className="btn-primary w-full text-base">
              {submitting ? 'Memeriksa kredensial...' : 'Masuk'}
            </button>
          </form>

          {/* Pintasan akun pengembangan */}
          <div className="pt-4 border-t border-slate-100 space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Akun Contoh Pengembangan
            </p>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => quickFill('petugas', 'Petugas123!')}
                className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 text-xs font-semibold text-navy-900 transition"
              >
                Petugas
              </button>
              <button
                type="button"
                onClick={() => quickFill('pic', 'Pic12345!')}
                className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 text-xs font-semibold text-navy-900 transition"
              >
                PIC
              </button>
              <button
                type="button"
                onClick={() => quickFill('admin', 'Admin123!')}
                className="min-h-[44px] px-2 py-2 rounded-xl border border-slate-200 hover:border-brand-500 hover:bg-brand-50/50 text-xs font-semibold text-navy-900 transition"
              >
                Admin
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Sesi otomatis berakhir setelah 30 menit tidak aktif. Lupa kata sandi? Hubungi Admin untuk reset.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
