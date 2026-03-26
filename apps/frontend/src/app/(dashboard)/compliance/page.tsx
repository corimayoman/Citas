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
    HIGH: 'bg-emerald-100 text-emerald-700',
    MEDIUM: 'bg-primary/10 text-primary-light',
    LOW: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">Compliance</h2>
      </div>

      <div className="bg-card rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Estado de conectores</h3>
        </div>
        <div className="divide-y divide-border">
          {isLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-secondary rounded w-1/2" />
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
                      ? <CheckCircle className="h-4 w-4 text-emerald-600" />
                      : <XCircle className="h-4 w-4 text-red-600" />}
                    <p className="text-sm font-medium text-foreground">{c.name}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${levelColor[c.complianceLevel] || 'bg-secondary text-muted-foreground'}`}>
                    {c.complianceLevel}
                  </span>
                </div>
                {c.legalBasis && (
                  <p className="text-xs text-muted-foreground ml-6">{c.legalBasis}</p>
                )}
                {c.notes && (
                  <div className="ml-6 flex items-start gap-1 text-xs text-primary-light bg-primary/10 rounded p-2">
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
