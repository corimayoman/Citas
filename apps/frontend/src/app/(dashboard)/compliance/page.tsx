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
    HIGH: 'bg-green-100 text-green-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    LOW: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Compliance</h2>
      </div>

      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="text-sm font-semibold">Estado de conectores</h3>
        </div>
        <div className="divide-y">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))
          ) : connectors.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No hay conectores registrados.</p>
          ) : (
            connectors.map((c: any) => (
              <div key={c.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {c.status === 'ACTIVE'
                      ? <CheckCircle className="h-4 w-4 text-green-500" />
                      : <XCircle className="h-4 w-4 text-red-500" />}
                    <p className="text-sm font-medium">{c.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${levelColor[c.complianceLevel] || 'bg-gray-100 text-gray-600'}`}>
                    {c.complianceLevel}
                  </span>
                </div>
                {c.legalBasis && (
                  <p className="text-xs text-muted-foreground ml-6">{c.legalBasis}</p>
                )}
                {c.notes && (
                  <div className="ml-6 flex items-start gap-1 text-xs text-amber-700 bg-amber-50 rounded p-2">
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
