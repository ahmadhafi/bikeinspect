import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  ClipboardCheck,
  FileEdit,
  FileSpreadsheet,
  Keyboard,
  ScanLine,
  Settings,
} from 'lucide-react';
import {
  FollowUpStatusBadge,
  InspectionResultBadge,
  VehicleAccessBadge,
} from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { apiFetch, formatWib } from '../lib/api';

interface DashboardData {
  inspeksiHariIni: number;
  temuanBelumSelesai: number;
  aksesDitangguhkan: number;
  drafAktif: Array<{
    id: string;
    kode_inspeksi: string;
    plat_tampil_snapshot: string;
    merek_tipe_snapshot: string;
    nama_karyawan_snapshot: string;
    jenis: string;
    diubah_pada: string;
  }>;
  inspeksiTerbaru: Array<{
    id: string;
    kode_inspeksi: string;
    plat_tampil_snapshot: string;
    merek_tipe_snapshot: string;
    nama_karyawan_snapshot: string;
    departemen_snapshot: string;
    hasil: string | null;
    status_tindak_lanjut: string;
    status_akses: string;
    difinalkan_pada: string;
    jenis: string;
    is_demo: number;
  }>;
}

export function HomePage() {
  const { user, ocrMode } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<DashboardData>('/api/dashboard/summary')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header Selamat Datang */}
      <div className="bg-navy-900 text-white rounded-[20px] p-5 sm:p-6 shadow-card-md">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
              Beranda · {user?.peran}
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold mt-0.5">
              Halo, {user?.nama}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              {user?.peran === 'Petugas' && 'Pindai atau masukkan plat nomor untuk memulai pemeriksaan kendaraan roda dua.'}
              {user?.peran === 'PIC' && 'Pantau hasil inspeksi, catat teguran manual, tindak lanjut, dan ekspor laporan Excel.'}
              {user?.peran === 'Admin' && 'Kelola akun pengguna, data karyawan & kendaraan, parameter pemeriksaan, serta log audit.'}
            </p>
          </div>

          {ocrMode === 'Demo' && user?.peran !== 'Admin' && (
            <span className="inline-flex items-center self-start sm:self-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-amber-400/20 text-amber-200 border border-amber-300/30">
              Mode Demo — OCR Simulasi
            </span>
          )}
        </div>

        {/* Tombol Aksi Cepat Utama */}
        {user?.peran !== 'Admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
            <Link to="/scan" className="btn-primary bg-brand-600 hover:bg-brand-500 text-base">
              <ScanLine className="w-5 h-5" />
              <span>Scan Plat Nomor</span>
            </Link>
            <Link
              to="/scan?mode=manual"
              className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20 text-base"
            >
              <Keyboard className="w-5 h-5" />
              <span>Input Plat Manual</span>
            </Link>
          </div>
        )}

        {user?.peran === 'Admin' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            <Link to="/admin/kendaraan" className="btn-primary bg-brand-600 hover:bg-brand-500">
              <Settings className="w-4 h-4" />
              <span>Karyawan & Kendaraan</span>
            </Link>
            <Link to="/admin/parameter" className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20">
              <span>Parameter Pemeriksaan</span>
            </Link>
            <Link to="/admin/pengguna" className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20">
              <span>Kelola Pengguna</span>
            </Link>
          </div>
        )}
      </div>

      {/* Ringkasan 3 Metrik Utama */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <ClipboardCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Inspeksi Hari Ini</p>
            <p className="text-2xl font-extrabold text-navy-900">
              {loading ? '—' : data?.inspeksiHariIni ?? 0}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Temuan Belum Selesai</p>
            <p className="text-2xl font-extrabold text-navy-900">
              {loading ? '—' : data?.temuanBelumSelesai ?? 0}
            </p>
          </div>
        </div>

        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-danger-50 text-danger-700 flex items-center justify-center shrink-0">
            <Ban className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Akses Kendaraan Ditangguhkan</p>
            <p className="text-2xl font-extrabold text-navy-900">
              {loading ? '—' : data?.aksesDitangguhkan ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Pintasan Laporan Excel khusus PIC */}
      {user?.peran === 'PIC' && (
        <Link
          to="/laporan"
          className="card p-4 bg-brand-50/70 border-brand-200 hover:bg-brand-50 transition flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-brand-700 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-navy-900">Laporan & Ekspor Excel (.xlsx) PIC</p>
              <p className="text-xs text-slate-600">
                Filter data inspeksi dan unduh berkas Excel asli dengan lembar Rekap Inspeksi & Detail Pemeriksaan.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-brand-700 shrink-0" />
        </Link>
      )}

      {/* Draf Aktif (bila ada) */}
      {data && data.drafAktif.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-navy-900 flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-amber-600" />
              Draf Inspeksi Belum Difinalkan
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {data.drafAktif.map((d) => (
              <Link
                key={d.id}
                to={`/inspeksi/${d.id}/edit`}
                className="card p-4 hover:border-brand-500 transition flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900">{d.plat_tampil_snapshot}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 font-semibold">
                      Draf {d.jenis === 'Ulang' ? 'Inspeksi Ulang' : ''}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 truncate mt-0.5">
                    {d.merek_tipe_snapshot} · {d.nama_karyawan_snapshot}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Diubah: {formatWib(d.diubah_pada)}</p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Inspeksi Terbaru */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-navy-900">Inspeksi Terbaru</h2>
          <Link to="/riwayat" className="text-xs font-semibold text-brand-700 hover:underline">
            Lihat Semua Riwayat →
          </Link>
        </div>

        {loading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Memuat ringkasan...</div>
        ) : !data || data.inspeksiTerbaru.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">
            Belum ada inspeksi final yang tercatat.
          </div>
        ) : (
          <div className="space-y-3">
            {data.inspeksiTerbaru.map((item) => (
              <Link
                key={item.id}
                to={`/inspeksi/${item.id}`}
                className="card p-4 hover:border-brand-500 transition flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-extrabold text-navy-900">{item.plat_tampil_snapshot}</span>
                    <span className="text-xs text-slate-500 font-mono">{item.kode_inspeksi}</span>
                    {item.jenis === 'Ulang' && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                        Inspeksi Ulang
                      </span>
                    )}
                    {item.is_demo === 1 && (
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        Demo
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600">
                    {item.merek_tipe_snapshot} · {item.nama_karyawan_snapshot} ({item.departemen_snapshot})
                  </p>
                  <p className="text-[11px] text-slate-400">{formatWib(item.difinalkan_pada)}</p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <InspectionResultBadge hasil={item.hasil} />
                  <FollowUpStatusBadge status={item.status_tindak_lanjut} />
                  {item.status_akses === 'Ditangguhkan Sementara' && (
                    <VehicleAccessBadge status={item.status_akses} />
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
