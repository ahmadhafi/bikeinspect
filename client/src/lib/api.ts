const PLATE_REGEX = /^([A-Z]{1,2})\s*(\d{1,4})\s*([A-Z]{0,3})$/;

export const BASE_PATH = (import.meta.env.BASE_URL || '/').replace(/\/+$/, '');

export function apiUrl(path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${BASE_PATH}${normalized}`;
}

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(message: string, status: number, data: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');
  if (!(options.body instanceof FormData) && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let resp: Response;
  try {
    resp = await fetch(apiUrl(url), {
      ...options,
      credentials: 'include',
      headers,
    });
  } catch {
    throw new ApiError('Tidak ada koneksi ke server. Draf lokal Anda tetap tersimpan.', 0);
  }

  const contentType = resp.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await resp.json() : {};

  if (!resp.ok) {
    throw new ApiError(
      (data as { error?: string }).error || `Terjadi galat pada server (${resp.status}).`,
      resp.status,
      data as Record<string, unknown>
    );
  }

  return data as T;
}

export function validatePlateClient(raw: string): { valid: boolean; formatted: string; error?: string } {
  const cleaned = raw
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const compact = cleaned.replace(/\s+/g, '');
  const m = compact.match(PLATE_REGEX);
  if (!m) {
    return {
      valid: false,
      formatted: cleaned,
      error: 'Format plat tidak valid. Periksa huruf dan angka (contoh: B 1234 KSP).',
    };
  }
  const [, area, digits, suffix] = m;
  return {
    valid: true,
    formatted: suffix ? `${area} ${digits} ${suffix}` : `${area} ${digits}`,
  };
}

export function formatWib(iso: string | null | undefined): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return (
    new Intl.DateTimeFormat('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d) + ' WIB'
  );
}

/**
 * Mengecilkan gambar di klien ke sisi terpanjang <= 1600 px sebelum unggah (PRD 12.2).
 */
export async function resizeImageFile(file: File, maxSide = 1600): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (width <= maxSide && height <= maxSide) {
        resolve(file);
        return;
      }
      const scale = maxSide / Math.max(width, height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.85
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

// Draf lokal di localStorage (FR-INS-14, NFR-19)
const DRAFT_PREFIX = 'sik_draft_';

export function saveLocalDraft(inspectionId: string, data: unknown) {
  try {
    localStorage.setItem(`${DRAFT_PREFIX}${inspectionId}`, JSON.stringify({ updatedAt: new Date().toISOString(), data }));
  } catch {
    // abaikan jika kuota penuh
  }
}

export function loadLocalDraft<T>(inspectionId: string): { updatedAt: string; data: T } | null {
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${inspectionId}`);
    if (!raw) return null;
    return JSON.parse(raw) as { updatedAt: string; data: T };
  } catch {
    return null;
  }
}

export function clearLocalDraft(inspectionId: string) {
  try {
    localStorage.removeItem(`${DRAFT_PREFIX}${inspectionId}`);
  } catch {
    // ignore
  }
}

export function clearAllLocalDrafts() {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(DRAFT_PREFIX));
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
