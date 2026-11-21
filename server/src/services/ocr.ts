import { config, isDemoOcrMode } from '../config.js';
import { normalizeAndValidatePlate } from '../utils/plate.js';

export interface OcrResult {
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

/**
 * Adaptor OCR plat nomor kendaraan (server-side only, PRD Bagian 12).
 * - Mode Produksi: memanggil layanan eksternal lewat OCR_API_URL & OCR_API_KEY.
 * - Mode Demo: simulasi transparan dengan label permanen "Mode Demo — OCR Simulasi".
 */
export async function runPlateOcr(params: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  demoScenario?: string;
}): Promise<OcrResult> {
  if (isDemoOcrMode()) {
    return runDemoOcr(params.originalName, params.demoScenario);
  }

  return runHttpOcr(params.buffer, params.mimeType, params.originalName);
}

function runDemoOcr(originalName: string, scenario?: string): OcrResult {
  const lower = `${originalName} ${scenario || ''}`.toLowerCase();

  if (lower.includes('blur') || lower.includes('buram') || lower.includes('gelap')) {
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Buram',
      platMentah: null,
      platNormal: null,
      platTampil: null,
      formatValid: false,
      keyakinan: 0.31,
      keyakinanRendah: true,
      kandidat: [],
      pesan: 'Foto kurang jelas. Dekatkan kamera, stabilkan posisi, atau nyalakan flash lalu lakukan Scan Ulang.',
    };
  }

  if (lower.includes('not_found') || lower.includes('kosong') || lower.includes('gagal')) {
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Gagal',
      platMentah: null,
      platNormal: null,
      platTampil: null,
      formatValid: false,
      keyakinan: 0,
      keyakinanRendah: true,
      kandidat: [],
      pesan: 'Plat tidak terdeteksi pada foto. Silakan Scan Ulang atau gunakan Input Manual.',
    };
  }

  if (lower.includes('timeout')) {
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Timeout',
      platMentah: null,
      platNormal: null,
      platTampil: null,
      formatValid: false,
      keyakinan: null,
      keyakinanRendah: true,
      kandidat: [],
      pesan: 'Layanan pembacaan plat sedang bermasalah (waktu tunggu habis). Silakan coba lagi atau gunakan Input Manual.',
    };
  }

  // Skenario TC-09: OCR salah baca menjadi "B 1234 K3P" (format tidak valid, harus diperbaiki Petugas)
  if (lower.includes('k3p') || lower.includes('invalid')) {
    const raw = 'B 1234 K3P';
    const norm = normalizeAndValidatePlate(raw);
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Berhasil',
      platMentah: raw,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      formatValid: norm.valid,
      keyakinan: 0.72,
      keyakinanRendah: true,
      kandidat: ['B 1234 K3P', 'B 1234 KSP'],
      petunjukMasaBerlaku: '08·28',
      pesan: 'Keyakinan rendah — periksa teliti huruf dan angka sebelum konfirmasi.',
    };
  }

  if (lower.includes('multi')) {
    const raw = 'B 5678 XYZ';
    const norm = normalizeAndValidatePlate(raw);
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Berhasil',
      platMentah: raw,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      formatValid: norm.valid,
      keyakinan: 0.89,
      keyakinanRendah: false,
      kandidat: ['B 5678 XYZ', 'B 1234 KSP'],
      pesan: 'Lebih dari satu kandidat plat terdeteksi. Pilih atau edit plat lalu tekan Konfirmasi Plat.',
    };
  }

  if (lower.includes('xyz') || lower.includes('5678')) {
    const raw = 'B 5678 XYZ';
    const norm = normalizeAndValidatePlate(raw);
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Berhasil',
      platMentah: raw,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      formatValid: norm.valid,
      keyakinan: 0.93,
      keyakinanRendah: false,
      kandidat: [norm.platTampil],
      petunjukMasaBerlaku: '05·28',
      pesan: 'Usulan OCR siap diperiksa. Pastikan teks sesuai plat fisik lalu tekan Konfirmasi Plat.',
    };
  }

  if (lower.includes('unregistered') || lower.includes('9999')) {
    const raw = 'B 9999 ZZZ';
    const norm = normalizeAndValidatePlate(raw);
    return {
      mode: 'Demo',
      isDemo: true,
      status: 'Berhasil',
      platMentah: raw,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      formatValid: norm.valid,
      keyakinan: 0.91,
      keyakinanRendah: false,
      kandidat: [norm.platTampil],
      pesan: 'Usulan OCR siap diperiksa. Pastikan teks sesuai plat fisik lalu tekan Konfirmasi Plat.',
    };
  }

  // Default demo: B 1234 KSP (sesuai PRD Bagian 6.2, bukan B 1234 K3P)
  const raw = 'B 1234 KSP';
  const norm = normalizeAndValidatePlate(raw);
  return {
    mode: 'Demo',
    isDemo: true,
    status: 'Berhasil',
    platMentah: raw,
    platNormal: norm.platNormal,
    platTampil: norm.platTampil,
    formatValid: norm.valid,
    keyakinan: 0.94,
    keyakinanRendah: false,
    kandidat: [norm.platTampil],
    petunjukMasaBerlaku: '08·28',
    pesan: 'Usulan OCR (Mode Demo) siap diperiksa. Edit bila perlu lalu tekan Konfirmasi Plat.',
  };
}

async function runHttpOcr(
  buffer: Buffer,
  mimeType: string,
  originalName: string
): Promise<OcrResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.ocr.timeoutMs);

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
    formData.append('image', blob, originalName || 'plate.jpg');

    const resp = await fetch(config.ocr.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.ocr.apiKey}`,
      },
      body: formData,
      signal: controller.signal,
    });

    if (resp.status === 429) {
      return {
        mode: 'Produksi',
        isDemo: false,
        status: 'Gagal',
        platMentah: null,
        platNormal: null,
        platTampil: null,
        formatValid: false,
        keyakinan: null,
        keyakinanRendah: true,
        kandidat: [],
        pesan: 'Kuota layanan pembacaan plat tercapai. Silakan gunakan Input Manual.',
      };
    }

    if (!resp.ok) {
      return {
        mode: 'Produksi',
        isDemo: false,
        status: 'Gagal',
        platMentah: null,
        platNormal: null,
        platTampil: null,
        formatValid: false,
        keyakinan: null,
        keyakinanRendah: true,
        kandidat: [],
        pesan: 'Layanan pembacaan plat sedang bermasalah. Silakan coba lagi atau gunakan Input Manual.',
      };
    }

    const data = (await resp.json()) as {
      plate?: string;
      confidence?: number;
      candidates?: string[];
      blurry?: boolean;
      expiry_hint?: string;
    };

    if (data.blurry) {
      return {
        mode: 'Produksi',
        isDemo: false,
        status: 'Buram',
        platMentah: null,
        platNormal: null,
        platTampil: null,
        formatValid: false,
        keyakinan: data.confidence ?? 0.2,
        keyakinanRendah: true,
        kandidat: [],
        pesan: 'Foto kurang jelas. Dekatkan kamera, stabilkan, atau nyalakan flash lalu Scan Ulang.',
      };
    }

    if (!data.plate) {
      return {
        mode: 'Produksi',
        isDemo: false,
        status: 'Gagal',
        platMentah: null,
        platNormal: null,
        platTampil: null,
        formatValid: false,
        keyakinan: 0,
        keyakinanRendah: true,
        kandidat: [],
        pesan: 'Plat tidak terdeteksi pada foto. Silakan Scan Ulang atau gunakan Input Manual.',
      };
    }

    const norm = normalizeAndValidatePlate(data.plate);
    const conf = typeof data.confidence === 'number' ? data.confidence : 0.5;
    const lowConf = conf < config.ocr.confidenceThreshold;

    return {
      mode: 'Produksi',
      isDemo: false,
      status: 'Berhasil',
      platMentah: data.plate,
      platNormal: norm.platNormal,
      platTampil: norm.platTampil,
      formatValid: norm.valid,
      keyakinan: conf,
      keyakinanRendah: lowConf,
      kandidat: data.candidates?.length ? data.candidates : [norm.platTampil],
      petunjukMasaBerlaku: data.expiry_hint || null,
      pesan: lowConf
        ? 'Keyakinan rendah — periksa teliti sebelum menekan Konfirmasi Plat.'
        : 'Usulan OCR siap diperiksa. Pastikan teks sesuai plat fisik lalu tekan Konfirmasi Plat.',
    };
  } catch (err: unknown) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      mode: 'Produksi',
      isDemo: false,
      status: isAbort ? 'Timeout' : 'Gagal',
      platMentah: null,
      platNormal: null,
      platTampil: null,
      formatValid: false,
      keyakinan: null,
      keyakinanRendah: true,
      kandidat: [],
      pesan: 'Layanan pembacaan plat sedang bermasalah. Silakan coba lagi atau gunakan Input Manual.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
