import { useEffect, useState } from 'react';
import { ScrollText } from 'lucide-react';
import { apiFetch, formatWib } from '../lib/api';

interface AuditRow {
  id: string;
  waktu: string;
  pelaku_nama: string;
  entitas: string;
  id_entitas: string;
  aksi: string;
  nilai_sebelum: string | null;
  nilai_sesudah: string | null;
  alamat_ip: string | null;
}

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [entitas, setEntitas] = useState('');
  const [pelaku, setPelaku] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const p = new URLSearchParams();
    if (entitas) p.set('entitas', entitas);
    if (pelaku.trim()) p.set('pelaku', pelaku.trim());
    setLoading(true);
    apiFetch<{ items: AuditRow[] }>(`/api/audit-logs?${p.toString()}`)
      .then((res) => setLogs(res.items))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [entitas, pelaku]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-navy-900 flex items-center gap-2">
          <ScrollText className="w-5 h-5 text-brand-700" />
          Log Audit (Append-Only)
        </h1>
        <p className="text-xs text-slate-500">
          Catatan audit bersifat permanen (append-only) dan tidak dapat diubah atau dihapus melalui aplikasi.
        </p>
      </div>

      <div className="card p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <input
          type="search"
          value={pelaku}
          onChange={(e) => setPelaku(e.target.value)}
          placeholder="Cari nama pelaku..."
          className="input-field"
        />
        <select value={entitas} onChange={(e) => setEntitas(e.target.value)} className="input-field">
          <option value="">Semua Entitas</option>
          <option value="inspeksi">inspeksi</option>
          <option value="penangguhan_akses">penangguhan_akses</option>
          <option value="bukti_foto">bukti_foto</option>
          <option value="ekspor_log">ekspor_log</option>
          <option value="parameter_pemeriksaan">parameter_pemeriksaan</option>
          <option value="kendaraan">kendaraan</option>
          <option value="karyawan">karyawan</option>
          <option value="pengguna">pengguna</option>
          <option value="akses">akses (403)</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        {loading ? (
          <div className="p-6 text-center text-sm text-slate-500">Memuat log audit...</div>
        ) : logs.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">Tidak ada catatan audit yang cocok.</div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-navy-900 text-white">
                <th className="py-3 px-4">Waktu</th>
                <th className="py-3 px-4">Pelaku</th>
                <th className="py-3 px-4">Entitas & Aksi</th>
                <th className="py-3 px-4">Detail Perubahan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 align-top">
                  <td className="py-3 px-4 whitespace-nowrap text-slate-600">{formatWib(l.waktu)}</td>
                  <td className="py-3 px-4 font-semibold text-navy-900">{l.pelaku_nama}</td>
                  <td className="py-3 px-4">
                    <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                      {l.entitas}
                    </span>
                    <p className="font-bold text-navy-900 mt-1">{l.aksi}</p>
                  </td>
                  <td className="py-3 px-4 max-w-md">
                    {l.nilai_sesudah && (
                      <pre className="text-[11px] bg-surface p-2 rounded-lg overflow-x-auto text-slate-700 whitespace-pre-wrap break-all">
                        {l.nilai_sesudah}
                      </pre>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
