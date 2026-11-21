import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Filter, Search } from 'lucide-react';
import {
  FollowUpStatusBadge,
  InspectionResultBadge,
  ManualWarningBadge,
  VehicleAccessBadge,
} from '../components/StatusBadges';
import { useAuth } from '../context/AuthContext';
import { apiFetch, formatWib } from '../lib/api';

interface HistoryItem {
  id: string;
  kode_inspeksi: string;
  plat_tampil_snapshot: string;
  merek_tipe_snapshot: string;
  nama_karyawan_snapshot: string;
  nik_snapshot: string;
  departemen_snapshot: string;
  petugas_nama: string;
  jenis: string;
  status: string;
  hasil: string | null;
  status_tindak_lanjut: string;
  status_teguran_manual: string;
  jumlah_teguran: number;
  status_akses: string;
  jumlah_temuan: number;
  is_demo: number;
  difinalkan_pada: string | null;
  dibuat_pada: string;
}

export function HistoryPage() {
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const [tanggalMulai, setTanggalMulai] = useState('');
  const [tanggalSelesai, setTanggalSelesai] = useState('');
  const [departemen, setDepartemen] = useState('');
  const [hasil, setHasil] = useState('');
  const [statusAkses, setStatusAkses] = useState('');
  const [statusTindakLanjut, setStatusTindakLanjut] = useState('');
  const [includeDemo, setIncludeDemo] = useState(false);
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', '15');
    if (q.trim()) params.set('q', q.trim());
    if (tanggalMulai) params.set('tanggalMulai', tanggalMulai);
    if (tanggalSelesai) params.set('tanggalSelesai', tanggalSelesai);
    if (departemen) params.set('departemen', departemen);
    if (hasil) params.set('hasil', hasil);
    if (statusAkses) params.set('statusAkses', statusAkses);
    if (statusTindakLanjut) params.set('statusTindakLanjut', statusTindakLanjut);
    if (includeDemo) params.set('includeDemo', 'true');

    setLoading(true);
    apiFetch<{ items: HistoryItem[]; total: number; totalPages: number }>(`/api/inspections?${params.toString()}`)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setTotalPages(res.totalPages);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [q, tanggalMulai, tanggalSelesai, departemen, hasil, statusAkses, statusTindakLanjut, includeDemo, page]);

  const resetFilters = () => {
    setQ('');
    setTanggalMulai('');
    setTanggalSelesai('');
    setDepartemen('');
    setHasil('');
    setStatusAkses('');
    setStatusTindakLanjut('');
    setIncludeDemo(false);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">Riwayat Inspeksi</h1>
          <p className="text-xs text-slate-500">
            {user?.peran === 'Petugas'
              ? 'Menampilkan inspeksi yang Anda buat. NIK disamarkan untuk privasi.'
              : 'Menampilkan seluruh inspeksi kendaraan. Empat status ditampilkan terpisah.'}
          </p>
        </div>
        <span className="text-xs font-semibold text-slate-600">Total: {total} inspeksi</span>
      </div>

      {/* Pencarian & Filter (terlihat langsung di desktop, toggle di ponsel) */}
      <div className="card p-4 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Cari plat (B 1234 KSP), nama karyawan, NIK, atau ID inspeksi..."
              className="input-field pl-10"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFiltersMobile((v) => !v)}
            className="lg:hidden btn-secondary px-3"
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">Filter</span>
          </button>
        </div>

        <div className={`${showFiltersMobile ? 'grid' : 'hidden lg:grid'} grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2.5 pt-1`}>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={tanggalMulai}
              onChange={(e) => {
                setTanggalMulai(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={tanggalSelesai}
              onChange={(e) => {
                setTanggalSelesai(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Departemen</label>
            <select
              value={departemen}
              onChange={(e) => {
                setDepartemen(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            >
              <option value="">Semua Departemen</option>
              {['HSE', 'Logistik', 'Produksi', 'Pemeliharaan', 'HR & GA', 'Gudang'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Hasil Inspeksi</label>
            <select
              value={hasil}
              onChange={(e) => {
                setHasil(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            >
              <option value="">Semua Hasil</option>
              <option value="Sesuai Seluruhnya">Sesuai Seluruhnya</option>
              <option value="Ada Temuan">Ada Temuan</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status Tindak Lanjut</label>
            <select
              value={statusTindakLanjut}
              onChange={(e) => {
                setStatusTindakLanjut(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            >
              <option value="">Semua Status</option>
              <option value="Tidak Perlu">Tidak Perlu</option>
              <option value="Menunggu Tindak Lanjut PIC">Menunggu Tindak Lanjut PIC</option>
              <option value="Dalam Proses">Dalam Proses</option>
              <option value="Menunggu Inspeksi Ulang">Menunggu Inspeksi Ulang</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 mb-1">Status Akses Kendaraan</label>
            <select
              value={statusAkses}
              onChange={(e) => {
                setStatusAkses(e.target.value);
                setPage(1);
              }}
              className="input-field min-h-[44px] text-xs"
            >
              <option value="">Semua Status Akses</option>
              <option value="Aktif">Aktif</option>
              <option value="Ditangguhkan Sementara">Ditangguhkan Sementara</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
          <label className="inline-flex items-center gap-2 text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => {
                setIncludeDemo(e.target.checked);
                setPage(1);
              }}
              className="w-4 h-4 rounded accent-brand-700"
            />
            <span>Sertakan data Mode Demo (dikecualikan secara bawaan)</span>
          </label>
          <button type="button" onClick={resetFilters} className="text-brand-700 font-semibold hover:underline">
            Atur Ulang Filter
          </button>
        </div>
      </div>

      {/* Daftar Kartu (Mobile/Tablet) & Tabel Penuh (Desktop >1024px) */}
      {loading ? (
        <div className="card p-8 text-center text-sm text-slate-500">Memuat riwayat inspeksi...</div>
      ) : items.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          Tidak ada data inspeksi yang cocok dengan pencarian atau filter.
        </div>
      ) : (
        <>
          {/* Mobile & Tablet Cards */}
          <div className="lg:hidden space-y-3">
            {items.map((item) => (
              <Link
                key={item.id}
                to={`/inspeksi/${item.id}`}
                className="card p-4 block hover:border-brand-500 transition space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-navy-900">{item.plat_tampil_snapshot}</span>
                      <span className="text-xs font-mono text-slate-500">{item.kode_inspeksi}</span>
                      {item.is_demo === 1 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                          Demo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      {item.merek_tipe_snapshot} · {item.nama_karyawan_snapshot} ({item.departemen_snapshot})
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {formatWib(item.difinalkan_pada || item.dibuat_pada)} · Petugas: {item.petugas_nama}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <InspectionResultBadge hasil={item.hasil} />
                  <FollowUpStatusBadge status={item.status_tindak_lanjut} />
                  {item.hasil === 'Ada Temuan' && (
                    <ManualWarningBadge status={item.status_teguran_manual} jumlah={item.jumlah_teguran} />
                  )}
                  <VehicleAccessBadge status={item.status_akses} />
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop Table (>1024px) */}
          <div className="hidden lg:block card overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-navy-900 text-white">
                  <th className="py-3 px-4 font-semibold">ID & Waktu</th>
                  <th className="py-3 px-4 font-semibold">Kendaraan & Pemilik</th>
                  <th className="py-3 px-4 font-semibold">Hasil Inspeksi</th>
                  <th className="py-3 px-4 font-semibold">Tindak Lanjut</th>
                  <th className="py-3 px-4 font-semibold">Teguran Manual</th>
                  <th className="py-3 px-4 font-semibold">Akses Kendaraan</th>
                  <th className="py-3 px-4 font-semibold text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-4 align-top">
                      <p className="font-mono font-bold text-navy-900">{item.kode_inspeksi}</p>
                      <p className="text-[11px] text-slate-500">{formatWib(item.difinalkan_pada)}</p>
                      <p className="text-[11px] text-slate-400">
                        {item.jenis} · {item.petugas_nama}
                        {item.is_demo === 1 && ' · DEMO'}
                      </p>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <p className="font-bold text-navy-900">
                        {item.plat_tampil_snapshot} <span className="font-normal text-slate-500">({item.merek_tipe_snapshot})</span>
                      </p>
                      <p className="text-slate-700">{item.nama_karyawan_snapshot}</p>
                      <p className="text-[11px] text-slate-500">
                        NIK: {item.nik_snapshot} · {item.departemen_snapshot}
                      </p>
                    </td>
                    <td className="py-3 px-4 align-top">
                      <InspectionResultBadge hasil={item.hasil} />
                      {item.jumlah_temuan > 0 && (
                        <p className="text-[11px] text-danger-700 font-semibold mt-1">
                          {item.jumlah_temuan} temuan
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <FollowUpStatusBadge status={item.status_tindak_lanjut} />
                    </td>
                    <td className="py-3 px-4 align-top">
                      {item.hasil === 'Ada Temuan' ? (
                        <ManualWarningBadge status={item.status_teguran_manual} jumlah={item.jumlah_teguran} />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4 align-top">
                      <VehicleAccessBadge status={item.status_akses} />
                    </td>
                    <td className="py-3 px-4 align-top text-right">
                      <Link
                        to={`/inspeksi/${item.id}`}
                        className="inline-flex items-center px-3 py-2 rounded-lg bg-brand-50 text-brand-700 hover:bg-brand-100 font-semibold"
                      >
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Paginasi */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="btn-secondary min-h-[44px] px-3 text-xs"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Sebelumnya</span>
              </button>
              <span className="text-xs font-semibold text-slate-600">
                Halaman {page} dari {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="btn-secondary min-h-[44px] px-3 text-xs"
              >
                <span>Berikutnya</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
