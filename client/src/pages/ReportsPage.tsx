import { useEffect, useState } from 'react';
import { AlertCircle, Download, FileSpreadsheet, History } from 'lucide-react';
import { apiFetch, apiUrl, formatWib } from '../lib/api';

interface PreviewData {
  totalBaris: number;
  sesuaiSeluruhnya: number;
  adaTemuan: number;
  aksesDitangguhkan: number;
  departments: string[];
}

interface ExportLogRow {
  id: string;
  pengguna_nama: string;
  waktu: string;
  filter_json: string;
  jumlah_baris: number;
}

export function ReportsPage() {
  const [tanggalMulai, setTanggalMulai] = useState('');
  const [tanggalSelesai, setTanggalSelesai] = useState('');
  const [departemen, setDepartemen] = useState('');
  const [hasil, setHasil] = useState('');
  const [statusAkses, setStatusAkses] = useState('');
  const [statusTindakLanjut, setStatusTindakLanjut] = useState('');

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [logs, setLogs] = useState<ExportLogRow[]>([]);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  const buildParams = () => {
    const p = new URLSearchParams();
    if (tanggalMulai) p.set('tanggalMulai', tanggalMulai);
    if (tanggalSelesai) p.set('tanggalSelesai', tanggalSelesai);
    if (departemen) p.set('departemen', departemen);
    if (hasil) p.set('hasil', hasil);
    if (statusAkses) p.set('statusAkses', statusAkses);
    if (statusTindakLanjut) p.set('statusTindakLanjut', statusTindakLanjut);
    return p.toString();
  };

  const loadLogs = () => {
    apiFetch<{ items: ExportLogRow[] }>('/api/reports/export-logs')
      .then((res) => setLogs(res.items))
      .catch(() => {});
  };

  useEffect(() => {
    apiFetch<PreviewData>(`/api/reports/preview?${buildParams()}`)
      .then(setPreview)
      .catch(() => {});
  }, [tanggalMulai, tanggalSelesai, departemen, hasil, statusAkses, statusTindakLanjut]);

  useEffect(() => {
    loadLogs();
  }, []);

  const handleExport = async () => {
    setError('');
    setExporting(true);
    try {
      const resp = await fetch(apiUrl(`/api/reports/export?${buildParams()}`), {
        credentials: 'include',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || 'Gagal mengekspor Excel.');
      }
      const blob = await resp.blob();
      const cd = resp.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'Rekap_Inspeksi_Kendaraan.xlsx';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      loadLogs();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal mengunduh berkas Excel.');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900">Laporan & Ekspor Excel (.xlsx)</h1>
        <p className="text-xs text-slate-500">
          Khusus PIC. Berkas Excel asli memuat lembar <strong>Rekap Inspeksi</strong> dan <strong>Detail Pemeriksaan</strong> sesuai filter aktif (data Mode Demo dikecualikan).
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-danger-50 border border-red-200 text-danger-700 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Laporan */}
      <div className="card p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Dari Tanggal</label>
            <input type="date" value={tanggalMulai} onChange={(e) => setTanggalMulai(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Sampai Tanggal</label>
            <input type="date" value={tanggalSelesai} onChange={(e) => setTanggalSelesai(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Departemen</label>
            <select value={departemen} onChange={(e) => setDepartemen(e.target.value)} className="input-field">
              <option value="">Semua Departemen</option>
              {(preview?.departments || []).map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Hasil Inspeksi</label>
            <select value={hasil} onChange={(e) => setHasil(e.target.value)} className="input-field">
              <option value="">Semua Hasil</option>
              <option value="Sesuai Seluruhnya">Sesuai Seluruhnya</option>
              <option value="Ada Temuan">Ada Temuan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status Tindak Lanjut</label>
            <select value={statusTindakLanjut} onChange={(e) => setStatusTindakLanjut(e.target.value)} className="input-field">
              <option value="">Semua Status</option>
              <option value="Tidak Perlu">Tidak Perlu</option>
              <option value="Menunggu Tindak Lanjut PIC">Menunggu Tindak Lanjut PIC</option>
              <option value="Dalam Proses">Dalam Proses</option>
              <option value="Menunggu Inspeksi Ulang">Menunggu Inspeksi Ulang</option>
              <option value="Selesai">Selesai</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status Akses Kendaraan</label>
            <select value={statusAkses} onChange={(e) => setStatusAkses(e.target.value)} className="input-field">
              <option value="">Semua Status Akses</option>
              <option value="Aktif">Aktif</option>
              <option value="Ditangguhkan Sementara">Ditangguhkan Sementara</option>
            </select>
          </div>
        </div>

        {/* Pratinjau Jumlah Baris & Tombol Ekspor */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center flex-1">
            <div className="bg-surface rounded-xl p-2.5">
              <p className="text-lg font-extrabold text-navy-900">{preview?.totalBaris ?? '—'}</p>
              <p className="text-[11px] text-slate-500">Total Baris</p>
            </div>
            <div className="bg-brand-50 rounded-xl p-2.5">
              <p className="text-lg font-extrabold text-brand-700">{preview?.sesuaiSeluruhnya ?? '—'}</p>
              <p className="text-[11px] text-slate-600">Sesuai</p>
            </div>
            <div className="bg-danger-50 rounded-xl p-2.5">
              <p className="text-lg font-extrabold text-danger-700">{preview?.adaTemuan ?? '—'}</p>
              <p className="text-[11px] text-slate-600">Ada Temuan</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-2.5">
              <p className="text-lg font-extrabold text-amber-800">{preview?.aksesDitangguhkan ?? '—'}</p>
              <p className="text-[11px] text-slate-600">Ditangguhkan</p>
            </div>
          </div>

          <button
            type="button"
            disabled={exporting || (preview !== null && preview.totalBaris === 0)}
            onClick={handleExport}
            className="btn-primary sm:w-auto shrink-0"
          >
            <Download className="w-5 h-5" />
            <span>{exporting ? 'Membuat .xlsx...' : 'Ekspor Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {/* Riwayat Ekspor */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
          <History className="w-4 h-4 text-slate-500" />
          <h2 className="font-bold text-sm text-navy-900">Riwayat Ekspor Excel</h2>
        </div>
        {logs.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">Belum ada riwayat ekspor.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {logs.map((l) => (
              <div key={l.id} className="px-5 py-3 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <FileSpreadsheet className="w-4 h-4 text-brand-700 shrink-0" />
                  <div>
                    <p className="font-semibold text-navy-900">
                      {l.pengguna_nama} · {l.jumlah_baris} baris inspeksi
                    </p>
                    <p className="text-[11px] text-slate-500">{formatWib(l.waktu)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
