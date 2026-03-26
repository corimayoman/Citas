'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

export default function CompliancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['compliance'],
    queryFn: () => api.get('/compliance/connectors').then(r => r.data.data).catch(() => []),
  });

  const connectors: any[] = Array.isArray(data) ? data : [];

  const levelColor: Record<string, string> = {
    HIGH: 'bg-emerald-900/30 text-emerald-400',
    MEDIUM: 'bg-[#FF0A6C]/10 text-[#FF3D8A]',
    LOW: 'bg-red-900/30 text-red-400',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-[#6b6b8a]" />
        <h2 className="text-xl font-semibold text-white">Compliance</h2>
      </div>

      <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35]">
        <div className="p-4 border-b border-[#1f1f35]">
          <h3 className="text-sm font-semibold text-white">Estado de conectores</h3>
        </div>
        <div className="divide-y divide-[#1f1f35]">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-[#1f1f35] rounded w-1/2" />
              </div>
            ))
          ) : connectors.length === 0 ? (
            <p className="p-4 text-sm text-[#6b6b8a]">No hay conectores registrados.</p>
          ) : (
            connectors.map((c: any) => (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {c.status === 'ACTIVE'
                      ? <CheckCircle className="h-4 w-4 text-emerald-400" />
                      : <XCircle className="h-4 w-4 text-red-400" />}
                    <p className="text-sm font-medium text-white">{c.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${levelColor[c.complianceLevel] || 'bg-[#1f1f35] text-[#6b6b8a]'}`}>
                    {c.complianceLevel}
                  </span>
                </div>
                {c.legalBasis && (
                  <p className="text-xs text-[#6b6b8a] ml-6">{c.legalBasis}</p>
                )}
                {c.notes && (
                  <div className="ml-6 flex items-start gap-1 text-xs text-[#FF3D8A] bg-[#FF0A6C]/10 rounded p-2">
                    <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{c.notes}</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
