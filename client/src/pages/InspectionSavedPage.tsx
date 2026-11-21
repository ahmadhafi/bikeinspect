import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileSpreadsheet,
  History,
  Home,
  ShieldCheck,
} from 'lucide-react';
import {
  FollowUpStatusBadge,
  InspectionResultBadge,
  SuspensionBanner,
} from '../components/StatusBadges';
import { VehicleCard } from '../components/VehicleCard';
import { useAuth } from '../context/AuthContext';
import { apiFetch, clearLocalDraft, formatWib } from '../lib/api';
import type { InspectionDetail } from '../types';

/**
 * Halaman P-05: Data Tersimpan di Database (mengacu Gambar 1 Layar 3 & PRD 6.2, 9.4).
 * Hanya tampil apabila server mengonfirmasi status = Final.
 */
export function InspectionSavedPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InspectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    apiFetch<InspectionDetail>(`/api/inspections/${id}`)
      .then((res) => {
        if (res.status !== 'Final') {
          navigate(`/inspeksi/${id}/edit`, { replace: true });
          return;
        }
        setData(res);
        clearLocalDraft(id);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Gagal memuat konfirmasi penyimpanan.'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Memverifikasi data di server...</div>;
  }

  if (error || !data) {
    return (
      <div className="card p-8 max-w-lg mx-auto text-center space-y-4">
        <p className="text-danger-700 font-semibold">{error || 'Data inspeksi belum terkonfirmasi di server.'}</p>
        <Link to="/" className="btn-secondary">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const hasFindings = data.hasil === 'Ada Temuan';

  return (
    <div className="max-w-xl mx-auto space-y-5">
      {/* Header Konfirmasi — Ikon mengikuti hasil sesuai PRD Bagian 6.2 */}
      <div className="card p-6 text-center space-y-3">
        <div
          className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center ${
            hasFindings
              ? 'bg-amber-100 text-amber-700 ring-8 ring-amber-50'
              : 'bg-brand-600 text-white ring-8 ring-brand-50'
          }`}
        >
          {hasFindings ? <AlertTriangle className="w-8 h-8" /> : <CheckCircle2 className="w-9 h-9" />}
        </div>

        <div>
          <h1 className="text-2xl font-extrabold text-brand-700">Data Tersimpan di Database</h1>
          <p className="text-sm text-slate-600 mt-1">
            Inspeksi kendaraan telah terkonfirmasi tersimpan oleh server.
          </p>
        </div>

        <div className="inline-flex items-center gap-2 flex-wrap justify-center pt-1">
          <InspectionResultBadge hasil={data.hasil} />
          <FollowUpStatusBadge status={data.status_tindak_lanjut} />
        </div>

        {/* Ringkasan Angka (Sesuai / Temuan / Tidak Berlaku / Total) */}
        <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-100 text-center">
          <div className="bg-brand-50/70 rounded-xl p-2.5">
            <p className="text-lg font-extrabold text-brand-700">{data.counts.sesuai}</p>
            <p className="text-[11px] font-medium text-slate-600">Sesuai</p>
          </div>
          <div className="bg-danger-50/70 rounded-xl p-2.5">
            <p className="text-lg font-extrabold text-danger-700">{data.counts.tidakSesuai}</p>
            <p className="text-[11px] font-medium text-slate-600">Temuan</p>
          </div>
          <div className="bg-slate-100 rounded-xl p-2.5">
            <p className="text-lg font-extrabold text-slate-700">{data.counts.tidakBerlaku}</p>
            <p className="text-[11px] font-medium text-slate-600">Tdk Berlaku</p>
          </div>
          <div className="bg-surface rounded-xl p-2.5">
            <p className="text-lg font-extrabold text-navy-900">{data.counts.total}</p>
            <p className="text-[11px] font-medium text-slate-600">Total Item</p>
          </div>
        </div>

        <div className="text-xs text-slate-500 pt-2 space-y-0.5">
          <p>
            ID Inspeksi: <strong className="font-mono text-navy-900">{data.kode_inspeksi}</strong>
          </p>
          <p>
            Waktu Simpan Server: <strong className="text-navy-900">{formatWib(data.difinalkan_pada)}</strong>
          </p>
          <p>
            Petugas: <strong className="text-navy-900">{data.petugas_nama}</strong>
          </p>
        </div>
      </div>

      {/* Kartu Kendaraan */}
      <VehicleCard
        compact
        platTampil={data.plat_tampil_snapshot}
        merekTipe={data.merek_tipe_snapshot}
        tahun={data.tahun_snapshot}
        warna={data.warna_snapshot}
        namaKaryawan={data.nama_karyawan_snapshot}
        nik={data.nik_snapshot}
        departemen={data.departemen_snapshot}
        statusAkses={data.status_akses_kendaraan}
      />

      {/* Kartu Bersyarat: Temuan Tercatat — Menunggu Tindak Lanjut PIC (FR-SAV-04, AC-14) */}
      {hasFindings && data.status_tindak_lanjut === 'Menunggu Tindak Lanjut PIC' && (
        <div className="rounded-[16px] bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900">Temuan Tercatat — Menunggu Tindak Lanjut PIC</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Tidak ada penangguhan otomatis atau email otomatis dari sistem. PIC akan meninjau temuan ini untuk tindak lanjut lebih lanjut.
            </p>
          </div>
        </div>
      )}

      {/* Kartu Bersyarat: Penangguhan Akses Kendaraan HANYA bila sudah tercatat aktif oleh PIC (FR-SAV-05, FR-SAV-06, AC-15, AC-16) */}
      {data.penangguhanAktif && (
        <SuspensionBanner
          alasan={data.penangguhanAktif.alasan}
          berlakuEfektifPada={data.penangguhanAktif.berlaku_efektif_pada}
        />
      )}

      {/* Kartu Hijau Ekspor Excel — KHUSUS PIC (FR-SAV-07, Gambar 1 Layar 3) */}
      {user?.peran === 'PIC' ? (
        <Link
          to="/laporan"
          className="card p-4 bg-brand-50 border-brand-200 hover:bg-brand-100/70 transition flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-brand-700 text-white flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-brand-900">
                Data Siap Diekspor ke Excel (.xlsx) untuk Laporan PIC
              </p>
              <p className="text-xs text-brand-800">
                Buka halaman Laporan & Ekspor untuk mengunduh rekap inspeksi.
              </p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-brand-700 shrink-0" />
        </Link>
      ) : (
        <Link
          to="/riwayat"
          className="card p-4 hover:border-brand-500 transition flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <History className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-navy-900">Lihat di Riwayat Inspeksi</p>
              <p className="text-xs text-slate-500">Tinjau rincian inspeksi yang telah Anda simpan.</p>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
        </Link>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to={`/inspeksi/${data.id}`} className="btn-secondary w-full">
          <ShieldCheck className="w-4 h-4" />
          <span>Lihat Detail Inspeksi</span>
        </Link>
        <Link to="/" className="btn-primary w-full">
          <Home className="w-4 h-4" />
          <span>Kembali ke Beranda</span>
        </Link>
      </div>
    </div>
  );
}
