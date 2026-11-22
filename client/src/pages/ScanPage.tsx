import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  Flashlight,
  Keyboard,
  RefreshCw,
  Send,
  Upload,
} from 'lucide-react';
import { SuspensionBanner } from '../components/StatusBadges';
import { VehicleCard } from '../components/VehicleCard';
import { useAuth } from '../context/AuthContext';
import { apiFetch, resizeImageFile, validatePlateClient } from '../lib/api';
import type { VehicleMatch } from '../types';

interface OcrResponse {
  ocrId: string;
  mode: 'Produksi' | 'Demo';
  isDemo: boolean;
  status: 'Berhasil' | 'Gagal' | 'Buram' | 'Timeout';
  platMentah: string | null;
  platNormal: string | null;
  platTampil: string | null;
  formatValid: boolean;
  keyakinan: number | null;
  keyakinanRendah: boolean;
  kandidat: string[];
  petunjukMasaBerlaku?: string | null;
  pesan: string;
}

interface ConfirmResponse {
  matchStatus: 'matched' | 'unregistered' | 'multiple';
  platNormal: string;
  platTampil: string;
  vehicles: VehicleMatch[];
  vehicle?: VehicleMatch;
  pesan?: string;
}

export function ScanPage() {
  const { user, ocrMode, disableAuth, inspectorName } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const startManual = searchParams.get('mode') === 'manual';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<'idle' | 'active' | 'denied' | 'unavailable'>('idle');
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);

  const [scanning, setScanning] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResponse | null>(null);
  const [plateInput, setPlateInput] = useState('');
  const [usedDemoOcr, setUsedDemoOcr] = useState(false);

  const [confirming, setConfirming] = useState(false);
  const [confirmResult, setConfirmResult] = useState<ConfirmResponse | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleMatch | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  // Pendaftaran cepat kendaraan & pemilik langsung saat inspeksi
  const [quickReg, setQuickReg] = useState({
    namaKaryawan: '',
    nik: '',
    departemen: '',
    merek: '',
    tipe: '',
    tahun: String(new Date().getFullYear()),
    warna: '',
  });
  const [registering, setRegistering] = useState(false);

  const [startingInspection, setStartingInspection] = useState(false);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  const startCamera = async () => {
    setErrorMsg('');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setCameraState('unavailable');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
      setFlashSupported(Boolean(caps?.torch));
      setCameraState('active');
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setCameraState('denied');
      } else {
        setCameraState('unavailable');
      }
    }
  };

  useEffect(() => {
    if (!startManual) {
      startCamera();
    }
    return () => stopCamera();
  }, [startManual]);

  const toggleFlash = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !flashOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setFlashOn(next);
    } catch {
      setFlashSupported(false);
    }
  };

  const sendPhotoToOcr = async (file: File | null, demoScenario?: string) => {
    setErrorMsg('');
    setConfirmResult(null);
    setSelectedVehicle(null);
    setScanning(true);
    try {
      const form = new FormData();
      if (file) {
        const resized = await resizeImageFile(file, 1600);
        form.append('photo', resized);
      }
      if (demoScenario) {
        form.append('demoScenario', demoScenario);
      }
      const res = await apiFetch<OcrResponse>('/api/scan/ocr', {
        method: 'POST',
        body: form,
      });
      setOcrResult(res);
      setUsedDemoOcr(res.isDemo);
      if (res.platTampil) {
        setPlateInput(res.platTampil);
      } else {
        setPlateInput('');
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Layanan pembacaan plat sedang bermasalah.');
    } finally {
      setScanning(false);
    }
  };

  const handleCapturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
        sendPhotoToOcr(file);
      },
      'image/jpeg',
      0.88
    );
  };

  const handleUploadFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    sendPhotoToOcr(file);
  };

  const plateCheck = validatePlateClient(plateInput);

  const handleConfirmPlate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!plateCheck.valid) return;
    setErrorMsg('');
    setConfirming(true);
    try {
      const res = await apiFetch<ConfirmResponse>('/api/scan/confirm-plate', {
        method: 'POST',
        body: JSON.stringify({
          plate: plateCheck.formatted,
          ocrId: ocrResult?.ocrId || undefined,
        }),
      });
      setConfirmResult(res);
      if (res.matchStatus === 'matched' && res.vehicle) {
        setSelectedVehicle(res.vehicle);
      } else {
        setSelectedVehicle(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mencocokkan plat dengan database.');
    } finally {
      setConfirming(false);
    }
  };

  const handleStartInspection = async () => {
    if (!selectedVehicle) return;
    setStartingInspection(true);
    setErrorMsg('');
    try {
      const res = await apiFetch<{ id: string }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify({
          kendaraanId: selectedVehicle.id,
          jenis: 'Awal',
          isDemo: usedDemoOcr,
          ocrId: ocrResult?.ocrId || undefined,
        }),
      });
      navigate(`/inspeksi/${res.id}/edit`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal memulai inspeksi.');
    } finally {
      setStartingInspection(false);
    }
  };

  const handleQuickRegisterAndStart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmResult) return;
    if (disableAuth && !inspectorName.trim()) {
      setErrorMsg('Silakan isi Nama Pemeriksa (Inspector) di kolom bagian atas terlebih dahulu.');
      return;
    }
    setRegistering(true);
    setErrorMsg('');
    try {
      const regRes = await apiFetch<{ vehicle: VehicleMatch }>('/api/scan/quick-register', {
        method: 'POST',
        body: JSON.stringify({
          plate: confirmResult.platTampil,
          ...quickReg,
          tahun: Number(quickReg.tahun) || new Date().getFullYear(),
        }),
      });
      const inspRes = await apiFetch<{ id: string }>('/api/inspections', {
        method: 'POST',
        body: JSON.stringify({
          kendaraanId: regRes.vehicle.id,
          jenis: 'Awal',
          isDemo: usedDemoOcr,
          ocrId: ocrResult?.ocrId || undefined,
        }),
      });
      navigate(`/inspeksi/${inspRes.id}/edit`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Gagal mendaftarkan kendaraan dan memulai inspeksi.');
    } finally {
      setRegistering(false);
    }
  };

  const handleResetScan = () => {
    setOcrResult(null);
    setPlateInput('');
    setConfirmResult(null);
    setSelectedVehicle(null);
    setErrorMsg('');
    setUsedDemoOcr(false);
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold text-navy-900">Scan Plat Nomor & Identifikasi</h1>
          <p className="text-xs text-slate-500">
            AI hanya membaca teks plat sebagai usulan. Petugas wajib memeriksa dan mengonfirmasi plat.
          </p>
        </div>

        {/* Lencana OCR / Mode Demo permanen sesuai PRD Bagian 6.2 & 12.2 */}
        {ocrMode === 'Demo' ? (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
            <Cpu className="w-3.5 h-3.5" />
            Mode Demo — OCR Simulasi
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-brand-50 text-brand-700 border border-brand-200">
            <Cpu className="w-3.5 h-3.5" />
            AI Camera OCR
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Kiri: Viewfinder Kamera + Unggah Foto */}
        <div className="lg:col-span-7 space-y-4">
          <div className="card overflow-hidden bg-navy-950 text-white">
            <div className="relative aspect-[4/3] sm:aspect-[16/10] bg-slate-900 flex items-center justify-center overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover ${cameraState === 'active' ? 'block' : 'hidden'}`}
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Lencana OCR di atas viewfinder seperti Gambar 3 */}
              <div className="absolute top-3 left-3 px-3 py-1.5 rounded-xl bg-navy-950/75 backdrop-blur-sm border border-white/15 flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full ${ocrMode === 'Demo' ? 'bg-amber-400' : 'bg-brand-500 animate-pulse'}`} />
                <span className="font-semibold">
                  {ocrMode === 'Demo' ? 'Mode Demo — OCR Simulasi' : 'AI Camera OCR'}
                </span>
              </div>

              {/* Tombol Flash */}
              {cameraState === 'active' && flashSupported && (
                <button
                  type="button"
                  onClick={toggleFlash}
                  aria-label="Nyalakan atau matikan flash"
                  className={`absolute top-3 right-3 w-11 h-11 rounded-full flex items-center justify-center backdrop-blur-sm border ${
                    flashOn
                      ? 'bg-amber-400 text-navy-950 border-amber-300'
                      : 'bg-navy-950/70 text-white border-white/20'
                  }`}
                >
                  <Flashlight className="w-5 h-5" />
                </button>
              )}

              {/* Bingkai Pemindai Hijau (panduan visual, bukan deteksi otomatis) */}
              {cameraState === 'active' && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center p-6">
                  <div className="w-64 sm:w-80 h-28 sm:h-36 relative">
                    <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-brand-500 rounded-tl-xl" />
                    <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-brand-500 rounded-tr-xl" />
                    <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-brand-500 rounded-bl-xl" />
                    <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-brand-500 rounded-br-xl" />
                  </div>
                  <p className="mt-3 text-[11px] bg-navy-950/70 px-3 py-1 rounded-full text-slate-200">
                    Posisikan plat nomor di dalam bingkai hijau
                  </p>
                </div>
              )}

              {/* Fallback bila izin ditolak / kamera tidak tersedia / mode manual */}
              {cameraState !== 'active' && (
                <div className="p-6 text-center max-w-sm space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center mx-auto">
                    <Camera className="w-7 h-7 text-emerald-300" />
                  </div>
                  {cameraState === 'denied' && (
                    <>
                      <p className="font-bold text-sm text-white">Izin kamera belum diberikan.</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Aktifkan izin kamera pada pengaturan peramban (ikon gembok di bilah alamat → Izin Kamera → Izinkan), atau gunakan <strong>Unggah Foto</strong> / <strong>Input Manual</strong> di bawah.
                      </p>
                    </>
                  )}
                  {cameraState === 'unavailable' && (
                    <>
                      <p className="font-bold text-sm text-white">Kamera tidak dapat dibuka.</p>
                      <p className="text-xs text-slate-300 leading-relaxed">
                        Kamera belakang memerlukan HTTPS dan perangkat berkamera. Gunakan <strong>Unggah Foto</strong> atau <strong>Input Manual</strong>.
                      </p>
                    </>
                  )}
                  {cameraState === 'idle' && (
                    <>
                      <p className="font-bold text-sm text-white">Mode Input Manual Aktif</p>
                      <p className="text-xs text-slate-300">
                        Ketik plat nomor di panel sebelah atau aktifkan kamera untuk memindai plat.
                      </p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={startCamera}
                    className="min-h-[44px] px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-semibold text-white transition"
                  >
                    Coba Buka Kamera Belakang
                  </button>
                </div>
              )}
            </div>

            {/* Tombol Ambil Foto / Unggah Foto / Scan Ulang */}
            <div className="p-4 bg-navy-900 flex flex-wrap gap-2.5">
              {cameraState === 'active' && (
                <button
                  type="button"
                  disabled={scanning}
                  onClick={handleCapturePhoto}
                  className="btn-primary flex-1 bg-brand-600 hover:bg-brand-500"
                >
                  <Camera className="w-5 h-5" />
                  <span>{scanning ? 'Memindai OCR...' : 'Ambil Foto'}</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleUploadFile}
                className="hidden"
              />
              {cameraState !== 'active' && (
                <label className="btn-primary flex-1 bg-brand-600 hover:bg-brand-500 cursor-pointer">
                  <Camera className="w-5 h-5" />
                  <span>{scanning ? 'Memindai...' : 'Kamera Belakang'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handleUploadFile}
                    className="hidden"
                  />
                </label>
              )}
              <button
                type="button"
                disabled={scanning}
                onClick={() => fileInputRef.current?.click()}
                className="btn-secondary flex-1 bg-white/10 hover:bg-white/20 text-white border-white/20"
              >
                <Upload className="w-5 h-5" />
                <span>Unggah Foto</span>
              </button>

              {(ocrResult || confirmResult) && (
                <button
                  type="button"
                  onClick={handleResetScan}
                  className="btn-secondary bg-white/10 hover:bg-white/20 text-white border-white/20"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Scan Ulang</span>
                </button>
              )}
            </div>
          </div>

          {/* Panel Simulasi Mode Demo (hanya muncul bila OCR belum dikonfigurasi / Mode Demo) */}
          {ocrMode === 'Demo' && (
            <div className="card p-4 bg-amber-50/70 border-amber-200 space-y-2.5">
              <p className="text-xs font-bold text-amber-900">
                Uji Simulasi Mode Demo OCR (tanpa layanan OCR eksternal)
              </p>
              <p className="text-[11px] text-amber-800">
                Inspeksi yang dibuat dari hasil Mode Demo akan ditandai <code>is_demo</code> dan dikecualikan dari laporan produksi. Untuk inspeksi produksi normal, ketik plat di kolom <strong>Input Manual</strong>.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => sendPhotoToOcr(null, 'valid_ksp')}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-navy-900 hover:bg-amber-100"
                >
                  Simulasi B 1234 KSP
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => sendPhotoToOcr(null, 'valid_xyz')}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-navy-900 hover:bg-amber-100"
                >
                  Simulasi B 5678 XYZ
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => sendPhotoToOcr(null, 'invalid_k3p')}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-navy-900 hover:bg-amber-100"
                >
                  Uji OCR Salah Baca (K3P)
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => sendPhotoToOcr(null, 'blur')}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-navy-900 hover:bg-amber-100"
                >
                  Uji Foto Buram
                </button>
                <button
                  type="button"
                  disabled={scanning}
                  onClick={() => sendPhotoToOcr(null, 'not_found')}
                  className="min-h-[40px] px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs font-semibold text-navy-900 hover:bg-amber-100"
                >
                  Uji Plat Tidak Ditemukan
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Kanan: Usulan OCR / Input Manual & Konfirmasi Identitas Kendaraan (P-03) */}
        <div className="lg:col-span-5 space-y-4">
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-danger-50 border border-red-200 text-danger-700 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Kartu Usulan OCR / Input Manual */}
          <div className="card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-bold text-sm text-navy-900 flex items-center gap-2">
                <Keyboard className="w-4 h-4 text-brand-700" />
                {ocrResult ? 'Usulan OCR — Periksa Sebelum Konfirmasi' : 'Input Plat Manual'}
              </h2>
              {ocrResult?.keyakinan !== null && ocrResult?.keyakinan !== undefined && (
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    ocrResult.keyakinanRendah
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-brand-50 text-brand-700'
                  }`}
                >
                  Keyakinan {Math.round(ocrResult.keyakinan * 100)}%
                </span>
              )}
            </div>

            {ocrResult && (
              <div
                className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                  ocrResult.status !== 'Berhasil' || ocrResult.keyakinanRendah
                    ? 'bg-amber-50 text-amber-900 border border-amber-200'
                    : 'bg-brand-50 text-brand-800 border border-brand-100'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p>{ocrResult.pesan}</p>
                  {ocrResult.petunjukMasaBerlaku && (
                    <p className="text-[11px] opacity-80">
                      Petunjuk angka masa berlaku pada plat: <strong>{ocrResult.petunjukMasaBerlaku}</strong> (tidak dipakai otomatis; catat secara visual di formulir inspeksi).
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Kandidat ganda dari OCR */}
            {ocrResult && ocrResult.kandidat.length > 1 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600">Pilih kandidat atau edit manual:</p>
                <div className="flex flex-wrap gap-2">
                  {ocrResult.kandidat.map((cand) => (
                    <button
                      key={cand}
                      type="button"
                      onClick={() => setPlateInput(cand)}
                      className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 hover:border-brand-600 text-xs font-bold text-navy-900"
                    >
                      {cand}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleConfirmPlate} className="space-y-3">
              <div>
                <label htmlFor="plate-input" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Plat Kendaraan
                </label>
                <input
                  id="plate-input"
                  type="text"
                  value={plateInput}
                  onChange={(e) => {
                    setPlateInput(e.target.value.toUpperCase());
                    setConfirmResult(null);
                    setSelectedVehicle(null);
                    if (!ocrResult) setUsedDemoOcr(false);
                  }}
                  placeholder="Contoh: B 1234 KSP"
                  className={`input-field text-lg font-extrabold tracking-widest uppercase ${
                    plateInput && !plateCheck.valid ? 'border-red-500 focus:ring-red-400' : ''
                  }`}
                />
                {plateInput && !plateCheck.valid && (
                  <p className="text-xs text-danger-700 mt-1 font-medium">{plateCheck.error}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={!plateCheck.valid || confirming}
                className="btn-primary w-full"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>{confirming ? 'Mencocokkan dengan Database...' : 'Konfirmasi Plat'}</span>
              </button>
            </form>
          </div>

          {/* P-03: Kendaraan Baru — Daftarkan Langsung Saat Inspeksi */}
          {confirmResult?.matchStatus === 'unregistered' && (
            <div className="card p-5 border-brand-200 bg-brand-50/40 space-y-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-6 h-6 text-brand-700 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-navy-900">
                    Daftarkan Kendaraan Baru: {confirmResult.platTampil}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Plat belum tercatat di perangkat ini. Isi data pemilik & kendaraan di bawah untuk langsung mendaftarkan dan memulai inspeksi.
                  </p>
                </div>
              </div>

              {disableAuth && !inspectorName.trim() && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
                  Silakan isi <strong>Nama Pemeriksa (Inspector)</strong> di kolom bagian atas terlebih dahulu.
                </p>
              )}

              <form onSubmit={handleQuickRegisterAndStart} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Pemilik / Karyawan *</label>
                  <input
                    type="text"
                    required
                    value={quickReg.namaKaryawan}
                    onChange={(e) => setQuickReg((p) => ({ ...p, namaKaryawan: e.target.value }))}
                    placeholder="Contoh: Budi Santoso"
                    className="input-field"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">NIK (Opsional)</label>
                    <input
                      type="text"
                      value={quickReg.nik}
                      onChange={(e) => setQuickReg((p) => ({ ...p, nik: e.target.value }))}
                      placeholder="Contoh: EMP-001"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Departemen *</label>
                    <input
                      type="text"
                      required
                      value={quickReg.departemen}
                      onChange={(e) => setQuickReg((p) => ({ ...p, departemen: e.target.value }))}
                      placeholder="Contoh: HSE / Produksi"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Merek Motor *</label>
                    <input
                      type="text"
                      required
                      value={quickReg.merek}
                      onChange={(e) => setQuickReg((p) => ({ ...p, merek: e.target.value }))}
                      placeholder="Honda / Yamaha"
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe *</label>
                    <input
                      type="text"
                      required
                      value={quickReg.tipe}
                      onChange={(e) => setQuickReg((p) => ({ ...p, tipe: e.target.value }))}
                      placeholder="Beat / Vario / NMAX"
                      className="input-field"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun</label>
                    <input
                      type="number"
                      min={1980}
                      max={2035}
                      value={quickReg.tahun}
                      onChange={(e) => setQuickReg((p) => ({ ...p, tahun: e.target.value }))}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Warna *</label>
                    <input
                      type="text"
                      required
                      value={quickReg.warna}
                      onChange={(e) => setQuickReg((p) => ({ ...p, warna: e.target.value }))}
                      placeholder="Hitam / Putih / Merah"
                      className="input-field"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={registering || (disableAuth && !inspectorName.trim())}
                  className="btn-primary w-full text-base"
                >
                  <Send className="w-4 h-4" />
                  <span>{registering ? 'Menyimpan & Membuka Formulir...' : 'Simpan Kendaraan & Mulai Inspeksi'}</span>
                </button>
              </form>
            </div>
          )}

          {/* Kecocokan Ganda (AL-07 / FR-IDN-11) */}
          {confirmResult?.matchStatus === 'multiple' && (
            <div className="card p-4 space-y-3 border-amber-300 bg-amber-50/50">
              <p className="text-sm font-bold text-amber-900">Pilih Kendaraan yang Sesuai</p>
              <p className="text-xs text-amber-800">{confirmResult.pesan}</p>
              <div className="space-y-2">
                {confirmResult.vehicles.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVehicle(v)}
                    className={`w-full text-left p-3 rounded-xl border transition ${
                      selectedVehicle?.id === v.id
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-slate-200 bg-white hover:border-brand-400'
                    }`}
                  >
                    <p className="font-bold text-sm text-navy-900">
                      {v.merek} {v.tipe} ({v.tahun}, {v.warna})
                    </p>
                    <p className="text-xs text-slate-600">
                      {v.karyawan.nama} · {v.karyawan.departemen} · NIK: {v.karyawan.nik}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Kartu Data Kendaraan Cocok (P-03) */}
          {selectedVehicle && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-brand-50 border border-brand-200 text-brand-800 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Data Kendaraan Cocok dengan database internal.</span>
              </div>

              <VehicleCard
                platTampil={selectedVehicle.platTampil}
                merekTipe={`${selectedVehicle.merek} ${selectedVehicle.tipe}`}
                tahun={selectedVehicle.tahun}
                warna={selectedVehicle.warna}
                namaKaryawan={selectedVehicle.karyawan.nama}
                nik={selectedVehicle.karyawan.nik}
                departemen={selectedVehicle.karyawan.departemen}
                statusAkses={selectedVehicle.statusAkses}
              />

              {selectedVehicle.penangguhanAktif && (
                <SuspensionBanner
                  alasan={selectedVehicle.penangguhanAktif.alasan}
                  berlakuEfektifPada={selectedVehicle.penangguhanAktif.berlakuEfektifPada}
                />
              )}

              {disableAuth || user?.peran === 'Petugas' ? (
                <div className="space-y-2">
                  {disableAuth && !inspectorName.trim() && (
                    <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5 font-medium">
                      Silakan isi <strong>Nama Pemeriksa (Inspector)</strong> di kolom bagian atas terlebih dahulu sebelum memulai inspeksi.
                    </p>
                  )}
                  <button
                    type="button"
                    disabled={startingInspection || (disableAuth && !inspectorName.trim())}
                    onClick={handleStartInspection}
                    className="btn-primary w-full text-base"
                  >
                    {startingInspection ? 'Membuat Formulir Inspeksi...' : 'Mulai Inspeksi'}
                  </button>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-slate-100 text-xs text-slate-700">
                  Akun PIC dapat memverifikasi identitas kendaraan di sini. Pembuatan inspeksi awal dilakukan oleh Petugas; inspeksi ulang dapat dibuat dari halaman Detail Inspeksi.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
