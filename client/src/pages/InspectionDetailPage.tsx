import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Ban,
  CheckCircle2,
  FilePlus2,
  MailCheck,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  FollowUpStatusBadge,
  InspectionResultBadge,
  ItemStatusBadge,
  ManualWarningBadge,
  SuspensionBanner,
  VehicleAccessBadge,
} from '../components/StatusBadges';
import { VehicleCard } from '../components/VehicleCard';
import { useAuth } from '../context/AuthContext';
import { ApiError, apiFetch, formatWib } from '../lib/api';
import type { InspectionDetail } from '../types';

export function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [data, setData] = useState<InspectionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Form PIC: Teguran Manual
  const [teguranWaktu, setTeguranWaktu] = useState(() => new Date().toISOString().slice(0, 16));
  const [teguranSaluran, setTeguranSaluran] = useState('Email Manual');
  const [teguranCatatan, setTeguranCatatan] = useState('');
  const [savingTeguran, setSavingTeguran] = useState(false);

  // Form PIC: Penangguhan Akses Kendaraan
  const [suspAlasan, setSuspAlasan] = useState('');
  const [suspEfektif, setSuspEfektif] = useState(() => new Date().toISOString().slice(0, 16));
  const [suspTemuanIds, setSuspTemuanIds] = useState<string[]>([]);
  const [confirmSusp, setConfirmSusp] = useState(false);
  const [savingSusp, setSavingSusp] = useState(false);

  // Form PIC: Pemulihan Akses Kendaraan
  const [restoreEfektif, setRestoreEfektif] = useState(() => new Date().toISOString().slice(0, 16));
  const [restoreCatatan, setRestoreCatatan] = useState('');
  const [confirmRestore, setConfirmRestore] = useState(false);
  const [savingRestore, setSavingRestore] = useState(false);
  const [unverifiedList, setUnverifiedList] = useState<Array<{ item: string; kodeInspeksi: string }>>([]);

  // Form PIC: Status Tindak Lanjut & Addendum
  const [nextStatus, setNextStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [addendumNote, setAddendumNote] = useState('');
  const [creatingReinsp, setCreatingReinsp] = useState(false);

  const loadDetail = async () => {
    if (!id) return;
    try {
      const res = await apiFetch<InspectionDetail>(`/api/inspections/${id}`);
      setData(res);
      const openFindingIds = res.items
        .filter((it) => it.status === 'Tidak Sesuai' && it.temuan_id && it.temuan_status === 'Terbuka')
        .map((it) => it.temuan_id!);
      setSuspTemuanIds(openFindingIds);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat detail inspeksi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDetail();
  }, [id]);

  const handleCreateReinspection = async () => {
    if (!data) return;
    setCreatingReinsp(true);
    setActionMsg(null);
    try {
      const res = await apiFetch<{ id: string }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify({
          jenis: 'Ulang',
          inspeksiAsalId: data.id,
        }),
      });
      navigate(`/inspeksi/${res.id}/edit`);
    } catch (err) {
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal membuat inspeksi ulang.' });
    } finally {
      setCreatingReinsp(false);
    }
  };

  const handleRecordTeguran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSavingTeguran(true);
    setActionMsg(null);
    try {
      await apiFetch(`/api/inspections/${data.id}/teguran-manual`, {
        method: 'POST',
        body: JSON.stringify({
          dikirimPada: new Date(teguranWaktu).toISOString(),
          saluran: teguranSaluran,
          catatan: teguranCatatan,
        }),
      });
      setTeguranCatatan('');
      setActionMsg({
        type: 'ok',
        text: 'Teguran manual berhasil dicatat. Sistem tidak mengirim email otomatis.',
      });
      await loadDetail();
    } catch (err) {
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mencatat teguran.' });
    } finally {
      setSavingTeguran(false);
    }
  };

  const handleRecordSuspension = async () => {
    if (!data) return;
    setSavingSusp(true);
    setActionMsg(null);
    try {
      await apiFetch('/api/suspensions', {
        method: 'POST',
        body: JSON.stringify({
          kendaraanId: data.kendaraan_id,
          alasan: suspAlasan,
          berlakuEfektifPada: new Date(suspEfektif).toISOString(),
          temuanIds: suspTemuanIds,
        }),
      });
      setConfirmSusp(false);
      setSuspAlasan('');
      setActionMsg({
        type: 'ok',
        text: 'Penangguhan akses kendaraan tercatat di sistem (tidak memblokir gerbang fisik secara otomatis).',
      });
      await loadDetail();
    } catch (err) {
      setConfirmSusp(false);
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mencatat penangguhan.' });
    } finally {
      setSavingSusp(false);
    }
  };

  const handleRestoreSuspension = async () => {
    if (!data?.penangguhanAktif) return;
    setSavingRestore(true);
    setActionMsg(null);
    setUnverifiedList([]);
    try {
      await apiFetch(`/api/suspensions/${data.penangguhanAktif.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({
          pemulihanEfektifPada: new Date(restoreEfektif).toISOString(),
          catatan: restoreCatatan,
        }),
      });
      setConfirmRestore(false);
      setRestoreCatatan('');
      setActionMsg({ type: 'ok', text: 'Pemulihan akses kendaraan berhasil dicatat di sistem.' });
      await loadDetail();
    } catch (err) {
      setConfirmRestore(false);
      if (err instanceof ApiError && Array.isArray(err.data.unverifiedFindings)) {
        setUnverifiedList(err.data.unverifiedFindings as Array<{ item: string; kodeInspeksi: string }>);
      }
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal memulihkan akses.' });
    } finally {
      setSavingRestore(false);
    }
  };

  const handleChangeFollowUpStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !nextStatus) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/inspections/${data.id}/status-tindak-lanjut`, {
        method: 'PATCH',
        body: JSON.stringify({ statusBaru: nextStatus, catatan: statusNote }),
      });
      setNextStatus('');
      setStatusNote('');
      setActionMsg({ type: 'ok', text: 'Status tindak lanjut berhasil diperbarui.' });
      await loadDetail();
    } catch (err) {
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal mengubah status.' });
    }
  };

  const handleAddAddendum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data || !addendumNote.trim()) return;
    setActionMsg(null);
    try {
      await apiFetch(`/api/inspections/${data.id}/addendum`, {
        method: 'POST',
        body: JSON.stringify({ catatan: addendumNote }),
      });
      setAddendumNote('');
      setActionMsg({ type: 'ok', text: 'Catatan koreksi (addendum) berhasil ditambahkan.' });
      await loadDetail();
    } catch (err) {
      setActionMsg({ type: 'err', text: err instanceof Error ? err.message : 'Gagal menambah addendum.' });
    }
  };

  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Memuat detail inspeksi...</div>;
  }

  if (error || !data) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-danger-700 font-semibold">{error || 'Detail inspeksi tidak ditemukan.'}</p>
        <Link to="/riwayat" className="btn-secondary">
          Kembali ke Riwayat
        </Link>
      </div>
    );
  }

  const openFindings = data.items.filter(
    (it) => it.status === 'Tidak Sesuai' && it.temuan_id && it.temuan_status === 'Terbuka'
  );
  const canCreateReinspection =
    data.status === 'Final' &&
    openFindings.length > 0 &&
    (user?.peran === 'Petugas' || user?.peran === 'PIC');

  const allowedNextStatuses: Record<string, string[]> = {
    'Menunggu Tindak Lanjut PIC': ['Dalam Proses'],
    'Dalam Proses': ['Menunggu Inspeksi Ulang'],
    'Menunggu Inspeksi Ulang': ['Dalam Proses'],
  };
  const nextStatusOptions = allowedNextStatuses[data.status_tindak_lanjut] || [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/riwayat" className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center hover:bg-slate-50">
            <ArrowLeft className="w-5 h-5 text-navy-900" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-extrabold text-navy-900">Detail Inspeksi</h1>
              <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-navy-900 text-white font-semibold">
                {data.kode_inspeksi}
              </span>
              {data.jenis === 'Ulang' && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-800 font-semibold">
                  Inspeksi Ulang
                </span>
              )}
              {data.is_demo === 1 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                  Mode Demo
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Petugas: <strong>{data.petugas_nama}</strong> · Difinalkan: {formatWib(data.difinalkan_pada)}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          {data.status === 'Draf' && data.petugas_id === user?.id && (
            <Link to={`/inspeksi/${data.id}/edit`} className="btn-primary">
              Lanjutkan Draf
            </Link>
          )}
          {canCreateReinspection && (
            <button
              type="button"
              disabled={creatingReinsp}
              onClick={handleCreateReinspection}
              className="btn-primary"
            >
              <RefreshCw className={`w-4 h-4 ${creatingReinsp ? 'animate-spin' : ''}`} />
              <span>{creatingReinsp ? 'Membuat...' : 'Buat Inspeksi Ulang'}</span>
            </button>
          )}
        </div>
      </div>

      {actionMsg && (
        <div
          className={`p-4 rounded-2xl text-sm font-medium border flex items-start gap-2.5 ${
            actionMsg.type === 'ok'
              ? 'bg-brand-50 text-brand-900 border-brand-200'
              : 'bg-danger-50 text-danger-700 border-red-200'
          }`}
        >
          {actionMsg.type === 'ok' ? (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p>{actionMsg.text}</p>
            {unverifiedList.length > 0 && (
              <ul className="list-disc pl-5 text-xs space-y-0.5">
                {unverifiedList.map((u, idx) => (
                  <li key={idx}>
                    {u.item} ({u.kodeInspeksi}) — belum terverifikasi selesai
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Kiri: Kartu Kendaraan, 4 Status, Ringkasan Angka, Daftar Item */}
        <div className="lg:col-span-7 space-y-4">
          <VehicleCard
            platTampil={data.plat_tampil_snapshot}
            merekTipe={data.merek_tipe_snapshot}
            tahun={data.tahun_snapshot}
            warna={data.warna_snapshot}
            namaKaryawan={data.nama_karyawan_snapshot}
            nik={data.nik_snapshot}
            departemen={data.departemen_snapshot}
            statusAkses={data.status_akses_kendaraan}
          />

          {data.penangguhanAktif && (
            <SuspensionBanner
              alasan={data.penangguhanAktif.alasan}
              berlakuEfektifPada={data.penangguhanAktif.berlaku_efektif_pada}
            />
          )}

          {/* Ringkasan 4 Status Terpisah + 3 Angka Utama (Gambar 4 kanan) */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                  data.hasil === 'Ada Temuan'
                    ? 'bg-danger-50 text-danger-700'
                    : 'bg-brand-50 text-brand-700'
                }`}
              >
                {data.hasil === 'Ada Temuan' ? (
                  <AlertTriangle className="w-6 h-6" />
                ) : (
                  <ShieldCheck className="w-6 h-6" />
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-500">Ringkasan Hasil Inspeksi</p>
                <p className="text-lg font-extrabold text-navy-900">{data.hasil || 'Draf'}</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-brand-50/70 rounded-xl p-3">
                <p className="text-2xl font-extrabold text-brand-700">{data.counts.sesuai}</p>
                <p className="text-xs font-medium text-slate-600">Sesuai</p>
              </div>
              <div className="bg-danger-50/70 rounded-xl p-3">
                <p className="text-2xl font-extrabold text-danger-700">{data.counts.tidakSesuai}</p>
                <p className="text-xs font-medium text-slate-600">Temuan</p>
              </div>
              <div className="bg-surface rounded-xl p-3">
                <p className="text-2xl font-extrabold text-navy-900">{data.counts.total}</p>
                <p className="text-xs font-medium text-slate-600">Total Item</p>
              </div>
            </div>

            {/* Empat status terpisah sesuai PRD 1.3 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-slate-100 text-xs">
              <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
                <span className="text-slate-500 font-medium">1. Hasil Inspeksi</span>
                <InspectionResultBadge hasil={data.hasil} />
              </div>
              <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
                <span className="text-slate-500 font-medium">2. Tindak Lanjut</span>
                <FollowUpStatusBadge status={data.status_tindak_lanjut} />
              </div>
              <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
                <span className="text-slate-500 font-medium">3. Teguran Manual</span>
                <ManualWarningBadge status={data.teguranManual.status} jumlah={data.teguranManual.jumlah} />
              </div>
              <div className="flex items-center justify-between bg-surface rounded-xl px-3 py-2">
                <span className="text-slate-500 font-medium">4. Akses Kendaraan</span>
                <VehicleAccessBadge status={data.status_akses_kendaraan} />
              </div>
            </div>

            {(data.masa_berlaku_sim || data.masa_berlaku_stnk_pajak) && (
              <div className="text-xs text-slate-600 flex flex-wrap gap-4 pt-2 border-t border-slate-100">
                {data.masa_berlaku_sim && (
                  <span>
                    Masa Berlaku SIM (visual): <strong>{data.masa_berlaku_sim}</strong>
                  </span>
                )}
                {data.masa_berlaku_stnk_pajak && (
                  <span>
                    Masa Berlaku STNK/Pajak (visual): <strong>{data.masa_berlaku_stnk_pajak}</strong>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Rincian Item Pemeriksaan & Bukti Foto */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-100">
              <h2 className="font-bold text-sm text-navy-900">Rincian Hasil Pemeriksaan</h2>
            </div>
            <div className="divide-y divide-slate-100">
              {data.items.map((it) => {
                const isFinding = it.status === 'Tidak Sesuai';
                return (
                  <div
                    key={it.id}
                    className={`p-4 space-y-2 ${isFinding ? 'bg-danger-50/50' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase">
                          {it.kelompok_snapshot} · {it.jenis_temuan_snapshot}
                        </p>
                        <p className="text-sm font-bold text-navy-900">{it.nama_snapshot}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <ItemStatusBadge status={it.status} />
                        {it.temuan_status && (
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              it.temuan_status === 'Terverifikasi Selesai'
                                ? 'bg-brand-100 text-brand-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            Temuan: {it.temuan_status}
                          </span>
                        )}
                      </div>
                    </div>

                    {it.acuan_jenis_snapshot !== 'Tidak Ada' && it.acuan_teks_snapshot && (
                      <p className="text-[11px] text-slate-600">
                        <strong>
                          {it.acuan_jenis_snapshot === 'Internal'
                            ? 'Ketentuan Internal Perusahaan'
                            : 'Persyaratan Hukum'}
                          :
                        </strong>{' '}
                        {it.acuan_teks_snapshot}
                      </p>
                    )}

                    {it.catatan && (
                      <p className="text-xs text-slate-800 bg-white/80 rounded-xl px-3 py-2 border border-slate-200">
                        <strong>Catatan:</strong> {it.catatan}
                      </p>
                    )}

                    {it.alasan_tidak_berlaku && (
                      <p className="text-xs text-slate-700 bg-slate-100 rounded-xl px-3 py-2">
                        <strong>Alasan Tidak Berlaku:</strong> {it.alasan_tidak_berlaku}
                      </p>
                    )}

                    {it.fotos.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {it.fotos.map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setPreviewPhoto(f.signedUrl)}
                            className="group relative rounded-xl overflow-hidden border border-slate-200 w-24 h-20 bg-white"
                          >
                            <img
                              src={f.signedUrl}
                              alt={f.nama_asli}
                              className="w-full h-full object-cover group-hover:scale-105 transition"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Daftar Inspeksi Ulang & Addendum */}
          {data.inspeksiUlang.length > 0 && (
            <div className="card p-4 space-y-2">
              <h3 className="text-sm font-bold text-navy-900">Riwayat Inspeksi Ulang</h3>
              {data.inspeksiUlang.map((ru) => (
                <Link
                  key={ru.id}
                  to={ru.status === 'Draf' ? `/inspeksi/${ru.id}/edit` : `/inspeksi/${ru.id}`}
                  className="flex items-center justify-between p-3 rounded-xl bg-surface hover:bg-slate-100 text-xs"
                >
                  <div>
                    <p className="font-mono font-bold text-navy-900">{ru.kode_inspeksi}</p>
                    <p className="text-slate-500">{formatWib(ru.difinalkan_pada || ru.dibuat_pada)}</p>
                  </div>
                  <InspectionResultBadge hasil={ru.hasil} />
                </Link>
              ))}
            </div>
          )}

          {data.addendums.length > 0 && (
            <div className="card p-4 space-y-2">
              <h3 className="text-sm font-bold text-navy-900">Catatan Koreksi (Addendum PIC)</h3>
              {data.addendums.map((a) => (
                <div key={a.id} className="p-3 rounded-xl bg-surface text-xs space-y-1">
                  <p className="text-navy-900">{a.catatan}</p>
                  <p className="text-[11px] text-slate-500">
                    {a.dibuat_oleh_nama} · {formatWib(a.dibuat_pada)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Kanan: Panel Tindak Lanjut PIC & Jejak Audit */}
        <div className="lg:col-span-5 space-y-4">
          {user?.peran === 'PIC' && data.status === 'Final' && (
            <>
              {/* 1. Pencatatan Teguran Manual (TIDAK mengirim email) */}
              {data.hasil === 'Ada Temuan' && (
                <div className="card p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
                      <MailCheck className="w-4 h-4 text-blue-700" />
                      Teguran Manual (Luar Aplikasi)
                    </h2>
                    <ManualWarningBadge
                      status={data.teguranManual.status}
                      jumlah={data.teguranManual.jumlah}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Aplikasi <strong>tidak mengirim email</strong>. Catat di sini setelah PIC mengirim email teguran secara manual di luar aplikasi.
                  </p>

                  {data.teguranManual.riwayat.length > 0 && (
                    <div className="space-y-2">
                      {data.teguranManual.riwayat.map((t) => (
                        <div key={t.id} className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-100 text-xs">
                          <p className="font-semibold text-navy-900">{t.catatan}</p>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Dikirim: {formatWib(t.dikirim_pada)} · {t.saluran || 'Email Manual'} · Oleh {t.dicatat_oleh_nama}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleRecordTeguran} className="space-y-2.5 pt-2 border-t border-slate-100">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Waktu Pengiriman</label>
                        <input
                          type="datetime-local"
                          required
                          value={teguranWaktu}
                          onChange={(e) => setTeguranWaktu(e.target.value)}
                          className="input-field min-h-[42px] text-xs px-2.5"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Saluran (Opsional)</label>
                        <input
                          type="text"
                          value={teguranSaluran}
                          onChange={(e) => setTeguranSaluran(e.target.value)}
                          placeholder="Email Manual"
                          className="input-field min-h-[42px] text-xs px-2.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Catatan Teguran *</label>
                      <textarea
                        rows={2}
                        required
                        value={teguranCatatan}
                        onChange={(e) => setTeguranCatatan(e.target.value)}
                        placeholder="Misal: Teguran email manual sudah dikirim ke karyawan dan atasan langsung..."
                        className="input-field min-h-[68px] py-2 text-xs"
                      />
                    </div>
                    <button type="submit" disabled={savingTeguran} className="btn-secondary w-full text-xs">
                      {savingTeguran ? 'Mencatat...' : 'Catat Teguran Email Manual Sudah Dikirim'}
                    </button>
                  </form>
                </div>
              )}

              {/* 2. Penangguhan / Pemulihan Akses Kendaraan */}
              <div className="card p-5 space-y-3">
                <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
                  <Ban className="w-4 h-4 text-danger-700" />
                  Status Akses Kendaraan
                </h2>

                {data.penangguhanAktif ? (
                  <div className="space-y-3">
                    <div className="text-xs space-y-1.5">
                      <p className="font-semibold text-slate-700">Temuan Penyebab Penangguhan:</p>
                      {data.penangguhanAktif.temuanPenyebab.map((tp) => (
                        <div
                          key={tp.id}
                          className="flex items-center justify-between p-2 rounded-lg bg-surface border border-slate-200"
                        >
                          <span className="font-medium text-navy-900">{tp.nama_snapshot}</span>
                          <span
                            className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                              tp.status === 'Terverifikasi Selesai'
                                ? 'bg-brand-100 text-brand-800'
                                : 'bg-danger-50 text-danger-700'
                            }`}
                          >
                            {tp.status}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <p className="text-xs font-bold text-brand-800">Catat Pemulihan Akses Kendaraan</p>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Waktu Efektif Pemulihan</label>
                        <input
                          type="datetime-local"
                          value={restoreEfektif}
                          onChange={(e) => setRestoreEfektif(e.target.value)}
                          className="input-field min-h-[42px] text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">Catatan Pemulihan *</label>
                        <textarea
                          rows={2}
                          value={restoreCatatan}
                          onChange={(e) => setRestoreCatatan(e.target.value)}
                          placeholder="Seluruh temuan penyebab telah diperbaiki dan lulus inspeksi ulang..."
                          className="input-field min-h-[68px] py-2 text-xs"
                        />
                      </div>
                      <button
                        type="button"
                        disabled={!restoreCatatan.trim() || savingRestore}
                        onClick={() => setConfirmRestore(true)}
                        className="btn-primary w-full text-xs"
                      >
                        Catat Pemulihan Akses Kendaraan
                      </button>
                    </div>
                  </div>
                ) : openFindings.length > 0 && data.is_demo === 0 ? (
                  <div className="space-y-2.5">
                    <p className="text-[11px] text-slate-600">
                      Penangguhan hanya berlaku untuk <strong>kendaraan ini</strong> (bukan seluruh akses kerja karyawan), dicatat di database, dan <strong>tidak memblokir gerbang fisik secara otomatis</strong>.
                    </p>
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-slate-700">Pilih Temuan Penyebab:</p>
                      {openFindings.map((of) => (
                        <label key={of.temuan_id} className="flex items-center gap-2 text-xs text-navy-900">
                          <input
                            type="checkbox"
                            checked={suspTemuanIds.includes(of.temuan_id!)}
                            onChange={(e) =>
                              setSuspTemuanIds((prev) =>
                                e.target.checked
                                  ? [...prev, of.temuan_id!]
                                  : prev.filter((x) => x !== of.temuan_id)
                              )
                            }
                            className="w-4 h-4 accent-danger-700"
                          />
                          <span>{of.nama_snapshot}</span>
                        </label>
                      ))}
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Waktu Efektif</label>
                      <input
                        type="datetime-local"
                        value={suspEfektif}
                        onChange={(e) => setSuspEfektif(e.target.value)}
                        className="input-field min-h-[42px] text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">Alasan Penangguhan *</label>
                      <textarea
                        rows={2}
                        value={suspAlasan}
                        onChange={(e) => setSuspAlasan(e.target.value)}
                        placeholder="Jelaskan alasan penangguhan akses kendaraan..."
                        className="input-field min-h-[68px] py-2 text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={!suspAlasan.trim() || suspTemuanIds.length === 0 || savingSusp}
                      onClick={() => setConfirmSusp(true)}
                      className="btn-danger w-full text-xs"
                    >
                      Catat Penangguhan Akses Kendaraan
                    </button>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    {data.is_demo === 1
                      ? 'Inspeksi Mode Demo tidak dapat memicu penangguhan akses kendaraan.'
                      : 'Tidak ada temuan terbuka untuk ditangguhkan.'}
                  </p>
                )}
              </div>

              {/* 3. Ubah Status Tindak Lanjut & Addendum PIC */}
              {nextStatusOptions.length > 0 && (
                <form onSubmit={handleChangeFollowUpStatus} className="card p-5 space-y-2.5">
                  <h2 className="font-bold text-sm text-navy-900">Perbarui Status Tindak Lanjut</h2>
                  <select
                    required
                    value={nextStatus}
                    onChange={(e) => setNextStatus(e.target.value)}
                    className="input-field min-h-[44px] text-xs"
                  >
                    <option value="">Pilih status berikutnya...</option>
                    {nextStatusOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                  <textarea
                    rows={2}
                    required
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Catatan perubahan status tindak lanjut..."
                    className="input-field min-h-[64px] py-2 text-xs"
                  />
                  <button type="submit" className="btn-secondary w-full text-xs">
                    Simpan Status Tindak Lanjut
                  </button>
                </form>
              )}

              <form onSubmit={handleAddAddendum} className="card p-5 space-y-2.5">
                <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
                  <FilePlus2 className="w-4 h-4 text-slate-600" />
                  Tambah Catatan Koreksi (Addendum)
                </h2>
                <p className="text-[11px] text-slate-500">
                  Rekaman inspeksi final tidak dapat diubah. Gunakan addendum untuk mencatat koreksi secara auditabel.
                </p>
                <textarea
                  rows={2}
                  required
                  value={addendumNote}
                  onChange={(e) => setAddendumNote(e.target.value)}
                  placeholder="Tulis catatan koreksi..."
                  className="input-field min-h-[64px] py-2 text-xs"
                />
                <button type="submit" className="btn-secondary w-full text-xs">
                  Simpan Addendum
                </button>
              </form>
            </>
          )}

          {/* Riwayat Perubahan / Audit (FR-AUD-02) */}
          <div className="card p-5 space-y-3">
            <h2 className="font-bold text-sm text-navy-900">Riwayat Perubahan (Audit)</h2>
            {data.auditHistory.length === 0 ? (
              <p className="text-xs text-slate-500">Belum ada catatan perubahan.</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {data.auditHistory.map((a) => (
                  <div key={a.id} className="p-2.5 rounded-xl bg-surface text-xs border border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-navy-900">{a.aksi}</span>
                      <span className="text-[10px] text-slate-400">{formatWib(a.waktu)}</span>
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">Oleh: {a.pelaku_nama}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal Pratinjau Foto Bukti */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-navy-950/80 flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setPreviewPhoto(null)}
              className="absolute -top-12 right-0 w-10 h-10 rounded-full bg-white text-navy-900 flex items-center justify-center"
            >
              <X className="w-5 h-5" />
            </button>
            <img src={previewPhoto} alt="Foto bukti" className="w-full max-h-[80vh] object-contain rounded-2xl bg-black" />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmSusp}
        title="Catat Penangguhan Akses Kendaraan?"
        description="Status akses kendaraan di database akan diubah menjadi Ditangguhkan Sementara. Ini hanya pencatatan sistem (tidak memblokir gerbang fisik otomatis) dan tidak memengaruhi akses kerja karyawan."
        confirmLabel="Ya, Catat Penangguhan"
        variant="danger"
        loading={savingSusp}
        onConfirm={handleRecordSuspension}
        onCancel={() => setConfirmSusp(false)}
      />

      <ConfirmDialog
        open={confirmRestore}
        title="Catat Pemulihan Akses Kendaraan?"
        description="Server akan memastikan seluruh temuan penyebab sudah Terverifikasi Selesai melalui inspeksi ulang final sebelum memulihkan status akses kendaraan menjadi Aktif."
        confirmLabel="Ya, Pulihkan Akses"
        loading={savingRestore}
        onConfirm={handleRestoreSuspension}
        onCancel={() => setConfirmRestore(false)}
      />
    </div>
  );
}
