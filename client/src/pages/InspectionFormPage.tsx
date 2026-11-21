import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Cloud,
  CloudOff,
  FileText,
  MinusCircle,
  RefreshCw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ItemStatusBadge, SuspensionBanner } from '../components/StatusBadges';
import { VehicleCard } from '../components/VehicleCard';
import {
  ApiError,
  apiFetch,
  clearLocalDraft,
  formatWib,
  loadLocalDraft,
  resizeImageFile,
  saveLocalDraft,
} from '../lib/api';
import type { EvidencePhoto, InspectionDetail, InspectionItem, ItemStatus } from '../types';

const GROUPS = ['Administrasi', 'Kelengkapan', 'Kondisi Teknis', 'Pengendara'] as const;

interface LocalDraftPayload {
  items: Record<string, { status: ItemStatus; catatan: string; alasan_tidak_berlaku: string }>;
  masaBerlakuSim: string;
  masaBerlakuStnkPajak: string;
  catatanUmum: string;
}

export function InspectionFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [inspection, setInspection] = useState<InspectionDetail | null>(null);
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [masaBerlakuSim, setMasaBerlakuSim] = useState('');
  const [masaBerlakuStnkPajak, setMasaBerlakuStnkPajak] = useState('');
  const [catatanUmum, setCatatanUmum] = useState('');

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Administrasi: true,
    Kelengkapan: true,
    'Kondisi Teknis': true,
    Pengendara: true,
  });
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState('');
  const [validationMap, setValidationMap] = useState<Record<string, string>>({});

  // Penanda penyimpanan: draf lokal vs tersimpan di server (PRD 8.2, AC-11)
  const [syncState, setSyncState] = useState<'synced' | 'local' | 'saving' | 'error'>('synced');
  const [lastServerSave, setLastServerSave] = useState<string | null>(null);

  // Upload foto per item
  const [uploadingItemId, setUploadingItemId] = useState<string | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<{ itemId: string; file: File; error: string } | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Dialog konfirmasi
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  // Kunci idempotensi tetap sama untuk percobaan ulang finalisasi yang sama (FR-INS-16, AC-12)
  const idempotencyKeyRef = useRef<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `idemp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch<InspectionDetail>(`/api/inspections/${id}`)
      .then((data) => {
        if (data.status === 'Final') {
          navigate(`/inspeksi/${id}`, { replace: true });
          return;
        }
        setInspection(data);
        setLastServerSave(data.diubah_pada);

        // Pulihkan draf lokal bila ada perubahan yang belum tersimpan ke server (FR-INS-14, AC-11)
        const local = loadLocalDraft<LocalDraftPayload>(id);
        if (local && new Date(local.updatedAt).getTime() > new Date(data.diubah_pada).getTime()) {
          const mergedItems = data.items.map((it) => {
            const loc = local.data.items[it.id];
            if (!loc) return it;
            return {
              ...it,
              status: loc.status,
              catatan: loc.catatan,
              alasan_tidak_berlaku: loc.alasan_tidak_berlaku,
            };
          });
          setItems(mergedItems);
          setMasaBerlakuSim(local.data.masaBerlakuSim || '');
          setMasaBerlakuStnkPajak(local.data.masaBerlakuStnkPajak || '');
          setCatatanUmum(local.data.catatanUmum || '');
          setSyncState('local');
        } else {
          setItems(data.items);
          setMasaBerlakuSim(data.masa_berlaku_sim || '');
          setMasaBerlakuStnkPajak(data.masa_berlaku_stnk_pajak || '');
          setCatatanUmum(data.catatan_umum || '');
          setSyncState('synced');
        }

        if (data.items.length > 0) {
          setSelectedItemId(data.items[0].id);
        }
      })
      .catch((err) => {
        setErrorBanner(err instanceof Error ? err.message : 'Gagal memuat formulir inspeksi.');
      })
      .finally(() => setLoading(false));
  }, [id, navigate]);

  const persistLocal = (
    nextItems: InspectionItem[],
    nextSim = masaBerlakuSim,
    nextStnk = masaBerlakuStnkPajak,
    nextNote = catatanUmum
  ) => {
    if (!id) return;
    const map: LocalDraftPayload['items'] = {};
    for (const it of nextItems) {
      map[it.id] = {
        status: it.status,
        catatan: it.catatan || '',
        alasan_tidak_berlaku: it.alasan_tidak_berlaku || '',
      };
    }
    saveLocalDraft(id, {
      items: map,
      masaBerlakuSim: nextSim,
      masaBerlakuStnkPajak: nextStnk,
      catatanUmum: nextNote,
    });
    setSyncState('local');
  };

  const updateItem = (itemId: string, patch: Partial<InspectionItem>) => {
    setItems((prev) => {
      const next = prev.map((it) => (it.id === itemId ? { ...it, ...patch } : it));
      persistLocal(next);
      return next;
    });
    setValidationMap((prev) => {
      if (!prev[itemId]) return prev;
      const copy = { ...prev };
      delete copy[itemId];
      return copy;
    });
  };

  const checkedCount = useMemo(
    () => items.filter((it) => it.status !== 'Belum Diperiksa').length,
    [items]
  );
  const progressPct = items.length > 0 ? Math.round((checkedCount / items.length) * 100) : 0;

  const selectedItem = useMemo(
    () => items.find((it) => it.id === selectedItemId) || items[0] || null,
    [items, selectedItemId]
  );

  const handleSaveDraftServer = async () => {
    if (!id) return;
    setErrorBanner('');
    setSyncState('saving');
    try {
      const res = await apiFetch<{ savedAt: string }>(`/api/inspections/${id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({
          masaBerlakuSim: masaBerlakuSim || null,
          masaBerlakuStnkPajak: masaBerlakuStnkPajak || null,
          catatanUmum: catatanUmum || null,
          items: items.map((it) => ({
            id: it.id,
            status: it.status,
            catatan: it.catatan,
            alasan_tidak_berlaku: it.alasan_tidak_berlaku,
          })),
        }),
      });
      setLastServerSave(res.savedAt);
      setSyncState('synced');
      clearLocalDraft(id);
    } catch (err) {
      setSyncState('error');
      setErrorBanner(
        err instanceof Error
          ? err.message
          : 'Belum tersimpan di server. Draf lokal Anda tetap aman di perangkat.'
      );
    }
  };

  const handleUploadPhoto = async (itemId: string, rawFile: File) => {
    if (!id) return;
    setUploadingItemId(itemId);
    setFailedPhoto(null);
    setErrorBanner('');
    try {
      const resized = await resizeImageFile(rawFile, 1600);
      const form = new FormData();
      form.append('photo', resized);
      const uploaded = await apiFetch<EvidencePhoto>(`/api/inspections/${id}/items/${itemId}/photos`, {
        method: 'POST',
        body: form,
      });
      setItems((prev) =>
        prev.map((it) => (it.id === itemId ? { ...it, fotos: [...it.fotos, uploaded] } : it))
      );
      setValidationMap((prev) => {
        const copy = { ...prev };
        delete copy[itemId];
        return copy;
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gagal mengunggah foto bukti.';
      setFailedPhoto({ itemId, file: rawFile, error: msg });
    } finally {
      setUploadingItemId(null);
    }
  };

  const handleDeletePhoto = async (itemId: string, photoId: string) => {
    if (!id) return;
    try {
      await apiFetch(`/api/inspections/${id}/items/${itemId}/photos/${photoId}`, {
        method: 'DELETE',
      });
      setItems((prev) =>
        prev.map((it) =>
          it.id === itemId ? { ...it, fotos: it.fotos.filter((f) => f.id !== photoId) } : it
        )
      );
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal menghapus foto bukti.');
    }
  };

  const handleFinalize = async () => {
    if (!id || finalizing) return;
    setErrorBanner('');
    setFinalizing(true);
    try {
      await apiFetch(`/api/inspections/${id}/finalize`, {
        method: 'POST',
        headers: {
          'X-Idempotency-Key': idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          masaBerlakuSim: masaBerlakuSim || null,
          masaBerlakuStnkPajak: masaBerlakuStnkPajak || null,
          catatanUmum: catatanUmum || null,
          items: items.map((it) => ({
            id: it.id,
            status: it.status,
            catatan: it.catatan,
            alasan_tidak_berlaku: it.alasan_tidak_berlaku,
          })),
        }),
      });
      // Hanya setelah server mengonfirmasi sukses, hapus draf lokal dan tampilkan P-05 (FR-SAV-01)
      clearLocalDraft(id);
      setConfirmFinalize(false);
      navigate(`/inspeksi/${id}/tersimpan`, { replace: true });
    } catch (err) {
      setConfirmFinalize(false);
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.data.validationErrors)) {
        const errs = err.data.validationErrors as Array<{ itemId: string; nama: string; pesan: string }>;
        const map: Record<string, string> = {};
        for (const e of errs) {
          if (!map[e.itemId]) map[e.itemId] = e.pesan;
        }
        setValidationMap(map);
        if (errs.length > 0) {
          const first = errs[0];
          const targetItem = items.find((i) => i.id === first.itemId);
          if (targetItem) {
            setOpenGroups((prev) => ({ ...prev, [targetItem.kelompok_snapshot]: true }));
            setSelectedItemId(first.itemId);
          }
          setErrorBanner(`${errs.length} item belum lengkap: ${first.pesan}`);
          setTimeout(() => {
            document.getElementById(`item-row-${first.itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }, 80);
        }
      } else {
        setSyncState('error');
        setErrorBanner(
          err instanceof Error
            ? `${err.message} — Belum tersimpan di server. Draf lokal Anda tetap aman.`
            : 'Penyimpanan gagal. Belum tersimpan di server; silakan Coba Lagi.'
        );
      }
    } finally {
      setFinalizing(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!id) return;
    setDiscarding(true);
    try {
      await apiFetch(`/api/inspections/${id}/discard`, { method: 'POST' });
      clearLocalDraft(id);
      navigate('/', { replace: true });
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Gagal membuang draf.');
      setConfirmDiscard(false);
    } finally {
      setDiscarding(false);
    }
  };

  if (loading) {
    return <div className="card p-8 text-center text-sm text-slate-500">Memuat formulir inspeksi...</div>;
  }

  if (!inspection) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-danger-700 font-semibold">{errorBanner || 'Inspeksi tidak ditemukan.'}</p>
        <Link to="/" className="btn-secondary">
          Kembali ke Beranda
        </Link>
      </div>
    );
  }

  const renderItemDetail = (item: InspectionItem) => {
    const isFinding = item.status === 'Tidak Sesuai';
    const isNA = item.status === 'Tidak Berlaku';
    const itemError = validationMap[item.id];

    return (
      <div
        className={`card p-4 sm:p-5 space-y-4 ${
          isFinding ? 'bg-danger-50/70 border-red-300' : ''
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {item.kelompok_snapshot}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
                {item.jenis_temuan_snapshot}
              </span>
              {item.wajib_snapshot === 1 ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-navy-900/10 text-navy-900 font-semibold">
                  Wajib
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  Opsional
                </span>
              )}
            </div>
            <h3 className="text-base font-extrabold text-navy-900 mt-1">{item.nama_snapshot}</h3>
            {item.deskripsi_snapshot && (
              <p className="text-xs text-slate-600 mt-0.5">{item.deskripsi_snapshot}</p>
            )}
          </div>
          <ItemStatusBadge status={item.status} />
        </div>

        {/* Acuan ketentuan dari Admin (bukan dasar hukum otomatis, BR-15) */}
        {item.acuan_jenis_snapshot !== 'Tidak Ada' && item.acuan_teks_snapshot && (
          <div className="text-xs bg-white/80 rounded-xl px-3 py-2 border border-slate-200 flex items-center gap-2 text-slate-700">
            <FileText className="w-4 h-4 text-slate-400 shrink-0" />
            <span>
              <strong>
                {item.acuan_jenis_snapshot === 'Internal'
                  ? 'Ketentuan Internal Perusahaan'
                  : 'Persyaratan Hukum'}
                :
              </strong>{' '}
              {item.acuan_teks_snapshot}
            </span>
          </div>
        )}

        {itemError && (
          <div className="p-3 rounded-xl bg-danger-50 border border-red-300 text-danger-700 text-xs font-semibold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{itemError}</span>
          </div>
        )}

        {/* Pemilih Status 4 Segmen (PRD 8.2) */}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-700">Status Pemeriksaan</p>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { value: 'Sesuai', label: 'Sesuai', icon: CheckCircle2, activeCls: 'bg-brand-700 text-white border-brand-700' },
                { value: 'Tidak Sesuai', label: 'Tidak Sesuai', icon: AlertCircle, activeCls: 'bg-danger-700 text-white border-danger-700' },
                { value: 'Belum Diperiksa', label: 'Belum Diperiksa', icon: Circle, activeCls: 'bg-navy-900 text-white border-navy-900' },
                ...(item.boleh_tidak_berlaku_snapshot === 1
                  ? [{ value: 'Tidak Berlaku' as const, label: 'Tidak Berlaku', icon: MinusCircle, activeCls: 'bg-slate-700 text-white border-slate-700' }]
                  : []),
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              const active = item.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => updateItem(item.id, { status: opt.value })}
                  className={`min-h-[48px] px-3 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                    active ? opt.activeCls : 'bg-white text-navy-900 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Kolom Alasan Tidak Berlaku (BR-06) */}
        {isNA && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Alasan Tidak Berlaku <span className="text-danger-700">*</span>
            </label>
            <textarea
              rows={2}
              value={item.alasan_tidak_berlaku || ''}
              onChange={(e) => updateItem(item.id, { alasan_tidak_berlaku: e.target.value })}
              placeholder="Jelaskan mengapa item ini tidak berlaku..."
              className="input-field min-h-[72px] py-2"
            />
          </div>
        )}

        {/* Catatan (Wajib bila Tidak Sesuai; opsional untuk Sesuai, mis. STNK beda nama AL-14) */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1">
            Catatan Pemeriksaan {isFinding && <span className="text-danger-700">* (Wajib untuk Temuan)</span>}
          </label>
          <textarea
            rows={3}
            value={item.catatan || ''}
            onChange={(e) => updateItem(item.id, { catatan: e.target.value })}
            placeholder={
              isFinding
                ? 'Tuliskan rincian ketidaksesuaian yang ditemukan...'
                : 'Opsional (mis. catatan bila nama pada STNK berbeda dengan pengendara)'
            }
            className="input-field min-h-[84px] py-2"
          />
        </div>

        {/* Kartu Bukti Foto (Wajib minimal 1 untuk Temuan Fisik; opsional untuk Administrasi) */}
        <div className={`rounded-2xl p-3.5 border space-y-3 ${isFinding ? 'bg-white border-red-200' : 'bg-surface border-slate-200'}`}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-bold text-navy-900">
                Bukti Foto ({item.fotos.length}/5)
                {isFinding && item.jenis_temuan_snapshot === 'Fisik' && item.wajib_foto_snapshot === 1 && (
                  <span className="text-danger-700"> * Wajib</span>
                )}
              </p>
              <p className="text-[11px] text-slate-500">
                {item.jenis_temuan_snapshot === 'Administrasi'
                  ? 'Foto dokumen opsional (minimalkan data pribadi; tidak wajib secara bawaan).'
                  : 'Foto kondisi fisik kendaraan disimpan privat (metadata GPS dibuang otomatis).'}
              </p>
            </div>
          </div>

          {item.fotos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {item.fotos.map((foto) => (
                <div key={foto.id} className="relative rounded-xl overflow-hidden border border-slate-200 bg-white">
                  <img
                    src={foto.signedUrl}
                    alt={foto.nama_asli}
                    className="w-full h-24 object-cover"
                  />
                  <div className="p-1.5 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-600 truncate">{foto.nama_asli}</span>
                    <button
                      type="button"
                      onClick={() => handleDeletePhoto(item.id, foto.id)}
                      aria-label="Hapus foto"
                      className="p-1 text-danger-700 hover:bg-danger-50 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {failedPhoto && failedPhoto.itemId === item.id && (
            <div className="p-2.5 rounded-xl bg-danger-50 border border-red-200 text-xs text-danger-700 flex items-center justify-between gap-2">
              <span>Gagal unggah: {failedPhoto.error}</span>
              <button
                type="button"
                onClick={() => handleUploadPhoto(item.id, failedPhoto.file)}
                className="px-2.5 py-1 rounded-lg bg-danger-700 text-white font-semibold shrink-0"
              >
                Coba Lagi
              </button>
            </div>
          )}

          {item.fotos.length < 5 && (
            <div className="flex gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) handleUploadPhoto(item.id, f);
                }}
                className="hidden"
              />
              <button
                type="button"
                disabled={uploadingItemId === item.id}
                onClick={() => photoInputRef.current?.click()}
                className="btn-secondary flex-1 min-h-[44px] text-xs"
              >
                {uploadingItemId === item.id ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Mengunggah...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4" />
                    <span>Tambah Foto Bukti</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Header Formulir + Penanda Penyimpanan */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-extrabold text-navy-900">
              {inspection.jenis === 'Ulang' ? 'Formulir Inspeksi Ulang' : 'Formulir Inspeksi Detail'}
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-brand-50 text-brand-800 border border-brand-200">
              {inspection.plat_tampil_snapshot}
            </span>
            {inspection.is_demo === 1 && (
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900">
                Mode Demo
              </span>
            )}
          </div>
          {inspection.jenis === 'Ulang' && inspection.kode_inspeksi_asal && (
            <p className="text-xs text-purple-700 font-medium mt-0.5">
              Verifikasi perbaikan untuk inspeksi asal: <strong>{inspection.kode_inspeksi_asal}</strong>
            </p>
          )}
        </div>

        {/* Penanda Draf Lokal vs Tersimpan di Server (PRD 8.2) */}
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border self-start ${
            syncState === 'synced'
              ? 'bg-brand-50 text-brand-800 border-brand-200'
              : syncState === 'saving'
                ? 'bg-blue-50 text-blue-800 border-blue-200'
                : 'bg-amber-50 text-amber-900 border-amber-200'
          }`}
        >
          {syncState === 'synced' ? (
            <>
              <Cloud className="w-4 h-4 shrink-0" />
              <span>Tersimpan di server {lastServerSave ? `(${formatWib(lastServerSave)})` : ''}</span>
            </>
          ) : syncState === 'saving' ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
              <span>Menyimpan ke server...</span>
            </>
          ) : (
            <>
              <CloudOff className="w-4 h-4 shrink-0" />
              <span>Draf lokal — belum tersimpan di server</span>
            </>
          )}
        </div>
      </div>

      {errorBanner && (
        <div className="p-4 rounded-2xl bg-danger-50 border border-red-300 text-danger-700 text-sm font-medium flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorBanner}</span>
          </div>
          {syncState === 'error' && (
            <button type="button" onClick={handleSaveDraftServer} className="btn-secondary min-h-[40px] text-xs shrink-0">
              Coba Lagi
            </button>
          )}
        </div>
      )}

      {/* Layout Dua Panel pada Tablet (md/640+) & Desktop; Satu Kolom pada Ponsel */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">
        {/* Panel Kiri: Kartu Kendaraan + Bar Progres + Daftar Checklist 4 Kelompok */}
        <div className="md:col-span-6 lg:col-span-7 space-y-4">
          <VehicleCard
            compact
            platTampil={inspection.plat_tampil_snapshot}
            merekTipe={inspection.merek_tipe_snapshot}
            tahun={inspection.tahun_snapshot}
            warna={inspection.warna_snapshot}
            namaKaryawan={inspection.nama_karyawan_snapshot}
            nik={inspection.nik_snapshot}
            departemen={inspection.departemen_snapshot}
            statusAkses={inspection.status_akses_kendaraan}
          />

          {inspection.penangguhanAktif && (
            <SuspensionBanner
              alasan={inspection.penangguhanAktif.alasan}
              berlakuEfektifPada={inspection.penangguhanAktif.berlaku_efektif_pada}
            />
          )}

          {/* Bar Progres Inspeksi: "n dari N item diperiksa" (PRD 6.2 & 8.2) */}
          <div className="card p-4 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-navy-900">
              <span>Progres Pemeriksaan</span>
              <span>
                {checkedCount} dari {items.length} item diperiksa
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          {/* 4 Kelompok Parameter Dapat Dibuka/Tutup */}
          <div className="space-y-3">
            {GROUPS.map((group) => {
              const groupItems = items.filter((it) => it.kelompok_snapshot === group);
              if (groupItems.length === 0) return null;
              const isOpen = openGroups[group];
              const doneInGroup = groupItems.filter((it) => it.status !== 'Belum Diperiksa').length;

              return (
                <div key={group} className="card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenGroups((p) => ({ ...p, [group]: !p[group] }))}
                    className="w-full min-h-[52px] px-4 py-3 flex items-center justify-between bg-slate-50/80 hover:bg-slate-100/80 transition text-left"
                  >
                    <div className="flex items-center gap-2">
                      {isOpen ? (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-500" />
                      )}
                      <span className="font-bold text-sm text-navy-900">{group}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {doneInGroup}/{groupItems.length} diperiksa
                    </span>
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-slate-100">
                      {groupItems.map((it) => {
                        const isSelected = selectedItem?.id === it.id;
                        const hasErr = Boolean(validationMap[it.id]);
                        return (
                          <div key={it.id} id={`item-row-${it.id}`}>
                            <button
                              type="button"
                              onClick={() => setSelectedItemId(it.id)}
                              className={`w-full min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 text-left transition ${
                                isSelected
                                  ? 'bg-brand-50/70 ring-1 ring-inset ring-brand-500'
                                  : it.status === 'Tidak Sesuai'
                                    ? 'bg-danger-50/50 hover:bg-danger-50'
                                    : 'hover:bg-slate-50'
                              } ${hasErr ? 'ring-2 ring-inset ring-red-500' : ''}`}
                            >
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-navy-900 truncate">
                                  {it.nama_snapshot}
                                  {it.wajib_snapshot === 1 && (
                                    <span className="text-danger-700 ml-1">*</span>
                                  )}
                                </p>
                                {hasErr && (
                                  <p className="text-[11px] font-semibold text-danger-700 mt-0.5">
                                    {validationMap[it.id]}
                                  </p>
                                )}
                                {!hasErr && it.status === 'Tidak Sesuai' && it.catatan && (
                                  <p className="text-[11px] text-red-800 truncate mt-0.5">{it.catatan}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <ItemStatusBadge status={it.status} />
                                <ChevronRight className="w-4 h-4 text-slate-400" />
                              </div>
                            </button>

                            {/* Pada Ponsel (< md), tampilkan editor item tepat di bawah baris terpilih */}
                            {isSelected && (
                              <div className="md:hidden p-3 bg-surface border-t border-slate-100">
                                {renderItemDetail(it)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pencatatan Masa Berlaku Dokumen Visual (Opsional, FR-INS-11) */}
          <div className="card p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-navy-900">Pencatatan Masa Berlaku Dokumen (Opsional)</h3>
              <p className="text-[11px] text-slate-500">
                Diisi dari pemeriksaan visual Petugas; sistem tidak memverifikasi ke Samsat atau pihak luar.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Masa Berlaku SIM</label>
                <input
                  type="date"
                  value={masaBerlakuSim}
                  onChange={(e) => {
                    setMasaBerlakuSim(e.target.value);
                    persistLocal(items, e.target.value, masaBerlakuStnkPajak, catatanUmum);
                  }}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Masa Berlaku STNK / Pajak</label>
                <input
                  type="date"
                  value={masaBerlakuStnkPajak}
                  onChange={(e) => {
                    setMasaBerlakuStnkPajak(e.target.value);
                    persistLocal(items, masaBerlakuSim, e.target.value, catatanUmum);
                  }}
                  className="input-field"
                />
              </div>
            </div>
          </div>

          {/* Tombol Aksi Simpan Draf / Finalisasi / Buang Draf */}
          <div className="card p-4 space-y-3">
            <button
              type="button"
              disabled={finalizing}
              onClick={() => setConfirmFinalize(true)}
              className="btn-primary w-full text-base"
            >
              <Upload className="w-5 h-5" />
              <span>{finalizing ? 'Menyimpan ke Database...' : 'Simpan Data Inspeksi'}</span>
            </button>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                disabled={syncState === 'saving' || finalizing}
                onClick={handleSaveDraftServer}
                className="btn-secondary w-full"
              >
                <Save className="w-4 h-4" />
                <span>Simpan Draf</span>
              </button>
              <button
                type="button"
                disabled={finalizing || discarding}
                onClick={() => setConfirmDiscard(true)}
                className="btn-secondary w-full text-danger-700 border-red-200 hover:bg-danger-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Buang Draf</span>
              </button>
            </div>
          </div>
        </div>

        {/* Panel Kanan (Tablet & Desktop): Detail Item Terpilih Sticky */}
        <div className="hidden md:block md:col-span-6 lg:col-span-5 sticky top-6">
          {selectedItem ? (
            renderItemDetail(selectedItem)
          ) : (
            <div className="card p-6 text-center text-sm text-slate-500">
              Pilih item pemeriksaan di sebelah kiri untuk mengisi status, catatan, dan bukti foto.
            </div>
          )}
        </div>
      </div>

      {/* Dialog Konfirmasi Finalisasi */}
      <ConfirmDialog
        open={confirmFinalize}
        title="Simpan Data Inspeksi Final?"
        description="Setelah difinalkan, hasil inspeksi akan tersimpan permanen di database dan tidak dapat diubah lagi (koreksi hanya melalui addendum PIC atau inspeksi ulang). Pastikan seluruh item wajib sudah diperiksa."
        confirmLabel="Ya, Simpan Final"
        loading={finalizing}
        onConfirm={handleFinalize}
        onCancel={() => setConfirmFinalize(false)}
      />

      {/* Dialog Konfirmasi Buang Draf */}
      <ConfirmDialog
        open={confirmDiscard}
        title="Buang Draf Inspeksi?"
        description="Draf inspeksi ini akan ditandai dibuang dan tindakan ini tercatat di log audit."
        confirmLabel="Ya, Buang Draf"
        variant="danger"
        loading={discarding}
        onConfirm={handleDiscardDraft}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
