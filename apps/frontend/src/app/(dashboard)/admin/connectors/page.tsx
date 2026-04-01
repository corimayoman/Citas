'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Activity, RefreshCw, Play, ShieldCheck } from 'lucide-react';
import { connectorStatusLabels } from '@/lib/translations';

interface Connector {
  id: string;
  name: string;
  slug: string;
  status: string;
  lastHealthCheck: string | null;
  errorRate: number | null;
  avgResponseTimeMs: number | null;
  suspendedReason: string | null;
  suspendedAt: string | null;
}

interface HealthCheckResult {
  ok: boolean;
  responseTimeMs: number;
}

interface DryRunResult {
  ok: boolean;
  slots?: { date: string; time: string }[];
  count?: number;
  error?: string;
}

const statusBadge = (status: string) => {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-100 text-emerald-700';
    case 'SUSPENDED':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-500';
  }
};

export default function AdminConnectorsPage() {
  const queryClient = useQueryClient();
  const [actionResult, setActionResult] = useState<Record<string, string>>({});

  const { data: connectors, isLoading } = useQuery<Connector[]>({
    queryKey: ['admin-connectors-health'],
    queryFn: () => api.get('/admin/connectors/health').then(r => r.data.data),
    refetchInterval: 30_000,
  });

  const reactivate = useMutation({
    mutationFn: (id: string) => api.post(`/admin/connectors/${id}/reactivate`).then(r => r.data),
    onSuccess: (_d, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin-connectors-health'] });
      setActionResult(prev => ({ ...prev, [id]: 'Reactivado ✓' }));
    },
    onError: (_e, id) => setActionResult(prev => ({ ...prev, [id]: 'Error al reactivar' })),
  });

  const healthCheck = useMutation({
    mutationFn: (id: string) => api.post<{ data: HealthCheckResult }>(`/admin/connectors/${id}/health-check`).then(r => r.data.data),
    onSuccess: (result, id) => {
      queryClient.invalidateQueries({ queryKey: ['admin-connectors-health'] });
      setActionResult(prev => ({ ...prev, [id]: result.ok ? `OK (${result.responseTimeMs}ms)` : 'FAIL' }));
    },
    onError: (_e, id) => setActionResult(prev => ({ ...prev, [id]: 'Error en health check' })),
  });

  const dryRun = useMutation({
    mutationFn: (id: string) => api.post<{ data: DryRunResult }>(`/admin/connectors/${id}/dry-run`).then(r => r.data.data),
    onSuccess: (result, id) => {
      setActionResult(prev => ({
        ...prev,
        [id]: result.ok ? `${result.count} slot(s) encontrados` : `Error: ${result.error}`,
      }));
    },
    onError: (_e, id) => setActionResult(prev => ({ ...prev, [id]: 'Error en dry run' })),
  });

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-2">
        <Activity className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-xl font-semibold text-foreground">Salud de Conectores</h2>
      </div>

      <div className="bg-card rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Conectores registrados</h3>
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-secondary rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : !connectors?.length ? (
          <p className="p-4 text-sm text-muted-foreground">No hay conectores registrados.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="p-3">Nombre</th>
                  <th className="p-3">Slug</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Último Health Check</th>
                  <th className="p-3">Error Rate</th>
                  <th className="p-3">Resp. Media</th>
                  <th className="p-3">Motivo Suspensión</th>
                  <th className="p-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {connectors.map((c) => (
                  <tr key={c.id}>
                    <td className="p-3 font-medium text-foreground">{c.name}</td>
                    <td className="p-3 text-muted-foreground">{c.slug}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>
                        {connectorStatusLabels[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.lastHealthCheck ? new Date(c.lastHealthCheck).toLocaleString() : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.errorRate != null ? `${(c.errorRate * 100).toFixed(1)}%` : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.avgResponseTimeMs != null ? `${c.avgResponseTimeMs}ms` : '—'}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">
                      {c.suspendedReason ?? '—'}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1 flex-wrap">
                        {c.status === 'SUSPENDED' && (
                          <button
                            onClick={() => reactivate.mutate(c.id)}
                            disabled={reactivate.isPending}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            <ShieldCheck className="h-3 w-3" /> Reactivar
                          </button>
                        )}
                        <button
                          onClick={() => healthCheck.mutate(c.id)}
                          disabled={healthCheck.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          <RefreshCw className="h-3 w-3" /> Health Check
                        </button>
                        <button
                          onClick={() => dryRun.mutate(c.id)}
                          disabled={dryRun.isPending}
                          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          <Play className="h-3 w-3" /> Dry Run
                        </button>
                      </div>
                      {actionResult[c.id] && (
                        <p className="text-xs text-muted-foreground mt-1">{actionResult[c.id]}</p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
