import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Bike,
  ClipboardCheck,
  FileSpreadsheet,
  History,
  Home,
  KeyRound,
  LogOut,
  ScanLine,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, ocrMode, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '' });
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  if (!user) return <>{children}</>;

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path);

  const navItems = [
    { to: '/', label: 'Beranda', icon: Home, roles: ['Petugas', 'PIC', 'Admin'] },
    { to: '/scan', label: 'Scan Plat', icon: ScanLine, roles: ['Petugas', 'PIC'] },
    { to: '/riwayat', label: 'Riwayat', icon: History, roles: ['Petugas', 'PIC', 'Admin'] },
    { to: '/laporan', label: 'Laporan', icon: FileSpreadsheet, roles: ['PIC'] },
    { to: '/admin/pengguna', label: 'Pengguna', icon: Users, roles: ['Admin'] },
    { to: '/admin/kendaraan', label: 'Karyawan & Kendaraan', icon: Bike, roles: ['Admin'] },
    { to: '/admin/parameter', label: 'Parameter', icon: SlidersHorizontal, roles: ['Admin'] },
    { to: '/audit', label: 'Log Audit', icon: ScrollText, roles: ['Admin', 'PIC'] },
  ].filter((item) => item.roles.includes(user.peran));

  const handleLogout = async () => {
    await logout();
    navigate('/masuk');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdMsg(null);
    setPwdSaving(true);
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify(pwdForm),
      });
      setPwdMsg({ type: 'ok', text: 'Kata sandi berhasil diperbarui.' });
      setPwdForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      setPwdMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengubah kata sandi.' });
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col sm:flex-row">
      {/* Sidebar Tablet (compact 640-1024px) & Desktop (>1024px) */}
      <aside className="hidden sm:flex sm:flex-col sm:w-20 lg:w-64 bg-navy-900 text-white shrink-0 sticky top-0 h-screen z-30">
        <div className="px-4 py-5 flex items-center gap-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-xl bg-brand-700 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div className="hidden lg:block min-w-0">
            <p className="font-bold text-sm leading-tight truncate">Sistem Inspeksi</p>
            <p className="text-[11px] text-emerald-300 truncate">Kendaraan Roda Dua</p>
          </div>
        </div>

        <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto" aria-label="Navigasi utama">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                title={item.label}
                className={`flex items-center justify-center lg:justify-start gap-3 min-h-[48px] px-3 rounded-xl text-sm font-medium transition-colors ${
                  active
                    ? 'bg-brand-700 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span className="hidden lg:inline truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          <div className="hidden lg:block px-2 py-1.5 rounded-xl bg-white/5">
            <p className="text-xs font-semibold truncate">{user.nama}</p>
            <p className="text-[11px] text-emerald-300">
              Peran: {user.peran} {ocrMode === 'Demo' ? '· Mode Demo OCR' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPwdModal(true)}
            title="Ganti Kata Sandi"
            className="w-full flex items-center justify-center lg:justify-start gap-2.5 min-h-[44px] px-3 rounded-xl text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-white transition"
          >
            <KeyRound className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Ganti Kata Sandi</span>
          </button>
          <button
            type="button"
            onClick={handleLogout}
            title="Keluar"
            className="w-full flex items-center justify-center lg:justify-start gap-2.5 min-h-[44px] px-3 rounded-xl text-xs font-medium text-red-200 hover:bg-red-500/20 hover:text-white transition"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span className="hidden lg:inline">Keluar</span>
          </button>
        </div>
      </aside>

      {/* Mobile Top Header (<640px) */}
      <header className="sm:hidden sticky top-0 z-30 bg-navy-900 text-white px-4 py-3 flex items-center justify-between shadow-sm">
        <Link to="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-brand-700 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-sm leading-tight truncate">Sistem Inspeksi Kendaraan</p>
            <p className="text-[11px] text-emerald-300 truncate">
              {user.nama} · {user.peran}
            </p>
          </div>
        </Link>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowPwdModal(true)}
            aria-label="Ganti kata sandi"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-200 hover:bg-white/10"
          >
            <KeyRound className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            aria-label="Keluar"
            className="w-11 h-11 rounded-xl flex items-center justify-center text-red-200 hover:bg-red-500/20"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 min-w-0 pb-24 sm:pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">{children}</div>
      </main>

      {/* Mobile Bottom Navigation (<640px) — sesuai PRD 8.2 & Gambar 3 */}
      <nav
        aria-label="Navigasi bawah"
        className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-navy-900 text-white border-t border-white/10 px-2 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-around h-16 relative">
          <Link
            to="/"
            className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] text-[11px] font-medium ${
              isActive('/') ? 'text-emerald-300' : 'text-slate-300'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span>Beranda</span>
          </Link>

          <Link
            to="/riwayat"
            className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] text-[11px] font-medium ${
              isActive('/riwayat') ? 'text-emerald-300' : 'text-slate-300'
            }`}
          >
            <History className="w-5 h-5 mb-0.5" />
            <span>Riwayat</span>
          </Link>

          {user.peran !== 'Admin' && (
            <Link
              to="/scan"
              aria-label="Scan Plat Nomor"
              className="-mt-6 flex flex-col items-center"
            >
              <span className="w-14 h-14 rounded-full bg-brand-600 hover:bg-brand-500 text-white flex items-center justify-center shadow-lg border-4 border-surface">
                <ScanLine className="w-6 h-6" />
              </span>
              <span className="text-[11px] font-semibold text-emerald-300 mt-0.5">Scan</span>
            </Link>
          )}

          {user.peran === 'PIC' && (
            <Link
              to="/laporan"
              className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] text-[11px] font-medium ${
                isActive('/laporan') ? 'text-emerald-300' : 'text-slate-300'
              }`}
            >
              <FileSpreadsheet className="w-5 h-5 mb-0.5" />
              <span>Laporan</span>
            </Link>
          )}

          {user.peran === 'Admin' && (
            <>
              <Link
                to="/admin/kendaraan"
                className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] text-[11px] font-medium ${
                  isActive('/admin/kendaraan') ? 'text-emerald-300' : 'text-slate-300'
                }`}
              >
                <Bike className="w-5 h-5 mb-0.5" />
                <span>Kendaraan</span>
              </Link>
              <Link
                to="/admin/parameter"
                className={`flex flex-col items-center justify-center min-w-[60px] min-h-[48px] text-[11px] font-medium ${
                  isActive('/admin/parameter') ? 'text-emerald-300' : 'text-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-5 h-5 mb-0.5" />
                <span>Parameter</span>
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Modal Ganti Kata Sandi */}
      {showPwdModal && (
        <div className="fixed inset-0 z-50 bg-navy-950/60 flex items-center justify-center p-4">
          <div className="card w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-navy-900">Ganti Kata Sandi</h2>
              <button
                type="button"
                onClick={() => setShowPwdModal(false)}
                className="w-10 h-10 rounded-xl hover:bg-slate-100 flex items-center justify-center"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {pwdMsg && (
              <div
                className={`p-3 rounded-xl text-sm ${
                  pwdMsg.type === 'ok'
                    ? 'bg-brand-50 text-brand-800 border border-brand-100'
                    : 'bg-danger-50 text-danger-700 border border-danger-100'
                }`}
              >
                {pwdMsg.text}
              </div>
            )}

            <form onSubmit={handleChangePassword} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kata Sandi Saat Ini</label>
                <input
                  type="password"
                  required
                  value={pwdForm.currentPassword}
                  onChange={(e) => setPwdForm((p) => ({ ...p, currentPassword: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Kata Sandi Baru (min. 8 karakter)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={pwdForm.newPassword}
                  onChange={(e) => setPwdForm((p) => ({ ...p, newPassword: e.target.value }))}
                  className="input-field"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowPwdModal(false)} className="btn-secondary flex-1">
                  Tutup
                </button>
                <button type="submit" disabled={pwdSaving} className="btn-primary flex-1">
                  {pwdSaving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
