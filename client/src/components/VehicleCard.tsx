import { Bike, Building2, IdCard, User } from 'lucide-react';
import { VehicleAccessBadge } from './StatusBadges';

interface VehicleCardProps {
  platTampil: string;
  merekTipe: string;
  tahun: number;
  warna: string;
  namaKaryawan: string;
  nik: string;
  departemen: string;
  statusAkses: 'Aktif' | 'Ditangguhkan Sementara' | string;
  compact?: boolean;
}

export function VehicleCard({
  platTampil,
  merekTipe,
  tahun,
  warna,
  namaKaryawan,
  nik,
  departemen,
  statusAkses,
  compact = false,
}: VehicleCardProps) {
  return (
    <div className="card overflow-hidden">
      <div className="bg-navy-900 text-white px-4 py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-brand-700/90 flex items-center justify-center shrink-0">
            <Bike className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-extrabold tracking-wide text-base">{platTampil}</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/15 text-emerald-200">
                Roda Dua
              </span>
            </div>
            <p className="text-xs text-slate-200 truncate">{merekTipe}</p>
          </div>
        </div>
        <VehicleAccessBadge status={statusAkses} />
      </div>

      <div className={`p-4 ${compact ? 'space-y-2.5' : 'space-y-3'}`}>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="bg-surface rounded-xl p-2.5">
            <span className="text-slate-500 block">Merek/Tipe</span>
            <span className="font-semibold text-navy-900">{merekTipe}</span>
          </div>
          <div className="bg-surface rounded-xl p-2.5">
            <span className="text-slate-500 block">Tahun</span>
            <span className="font-semibold text-navy-900">{tahun}</span>
          </div>
          <div className="bg-surface rounded-xl p-2.5">
            <span className="text-slate-500 block">Warna</span>
            <span className="font-semibold text-navy-900">{warna}</span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-navy-900 truncate">{namaKaryawan}</p>
              <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <IdCard className="w-3.5 h-3.5" />
                  NIK: {nik}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5" />
                  {departemen}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
