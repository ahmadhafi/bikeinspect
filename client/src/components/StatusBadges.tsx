import {
  AlertCircle,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  Clock,
  MailCheck,
  MailWarning,
  MinusCircle,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import { formatWib } from '../lib/api';
import type { ItemStatus } from '../types';

export function ItemStatusBadge({ status }: { status: ItemStatus }) {
  switch (status) {
    case 'Sesuai':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Sesuai</span>
        </span>
      );
    case 'Tidak Sesuai':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-100">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Tidak Sesuai</span>
        </span>
      );
    case 'Tidak Berlaku':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
          <MinusCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Tidak Berlaku</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
          <Circle className="w-3.5 h-3.5 shrink-0" />
          <span>Belum Diperiksa</span>
        </span>
      );
  }
}

export function InspectionResultBadge({ hasil }: { hasil: string | null }) {
  if (hasil === 'Sesuai Seluruhnya') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Sesuai Seluruhnya</span>
      </span>
    );
  }
  if (hasil === 'Ada Temuan') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-100">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        <span>Ada Temuan</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <span>Draf</span>
    </span>
  );
}

export function FollowUpStatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'Tidak Perlu':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
          <MinusCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Tidak Perlu</span>
        </span>
      );
    case 'Menunggu Tindak Lanjut PIC':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Menunggu Tindak Lanjut PIC</span>
        </span>
      );
    case 'Dalam Proses':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
          <RefreshCw className="w-3.5 h-3.5 shrink-0" />
          <span>Dalam Proses</span>
        </span>
      );
    case 'Menunggu Inspeksi Ulang':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-800 border border-purple-200">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Menunggu Inspeksi Ulang</span>
        </span>
      );
    case 'Selesai':
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Selesai</span>
        </span>
      );
    default:
      return <span className="text-xs text-slate-600">{status}</span>;
  }
}

export function ManualWarningBadge({
  status,
  jumlah,
}: {
  status: 'Belum Dicatat' | 'Sudah Dicatat' | string;
  jumlah?: number;
}) {
  if (status === 'Sudah Dicatat') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-800 border border-blue-200">
        <MailCheck className="w-3.5 h-3.5 shrink-0" />
        <span>Sudah Dicatat{jumlah && jumlah > 1 ? ` (${jumlah}x)` : ''}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600">
      <MailWarning className="w-3.5 h-3.5 shrink-0" />
      <span>Belum Dicatat</span>
    </span>
  );
}

export function VehicleAccessBadge({ status }: { status: string }) {
  if (status === 'Ditangguhkan Sementara') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-danger-50 text-danger-700 border border-danger-100">
        <Ban className="w-3.5 h-3.5 shrink-0" />
        <span>Ditangguhkan Sementara</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-brand-50 text-brand-700 border border-brand-100">
      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
      <span>Aktif</span>
    </span>
  );
}

/**
 * Kartu bersyarat penangguhan akses kendaraan (FR-SAV-05, FR-FUP-05, BR-13, AC-22).
 * Hanya dirender bila penangguhan aktif sudah tercatat oleh PIC di database.
 */
export function SuspensionBanner({
  alasan,
  berlakuEfektifPada,
}: {
  alasan: string;
  berlakuEfektifPada: string;
}) {
  return (
    <div className="rounded-[16px] bg-danger-50 border border-red-200 p-4 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-danger-100 text-danger-700 flex items-center justify-center shrink-0 mt-0.5">
        <ShieldAlert className="w-5 h-5" />
      </div>
      <div className="space-y-1 text-sm">
        <p className="font-bold text-danger-700">Akses Kendaraan Ditangguhkan Sementara</p>
        <p className="text-red-900">{alasan}</p>
        <p className="text-xs text-red-800">
          Berlaku efektif: <span className="font-semibold">{formatWib(berlakuEfektifPada)}</span>
        </p>
        <p className="text-xs text-red-800/90 bg-white/70 rounded-lg px-2.5 py-1.5 border border-red-200/80 mt-1.5">
          Catatan sistem: Status ini dicatat di sistem oleh PIC dan <strong>tidak memblokir gerbang fisik secara otomatis</strong>. Hanya berlaku untuk kendaraan ini, bukan seluruh akses kerja karyawan.
        </p>
      </div>
    </div>
  );
}
