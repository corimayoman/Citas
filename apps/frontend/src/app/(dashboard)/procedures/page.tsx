'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { Search, Building2, Clock, Zap, Hand } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const integrationBadge = {
  OFFICIAL_API: { label: 'API Oficial', color: 'bg-emerald-100 text-emerald-700', icon: Zap },
  AUTHORIZED_INTEGRATION: { label: 'Integración autorizada', color: 'bg-blue-100 text-blue-700', icon: Zap },
  MANUAL_ASSISTED: { label: 'Asistencia manual', color: 'bg-secondary text-muted-foreground', icon: Hand },
};

export default function ProceduresPage() {
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('');
  const [category, setCategory] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['procedures', search, country, category],
    queryFn: () => api.get('/procedures', { params: { search, country, category } }).then(r => r.data),
  });

  const procedures = data?.data || [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground">Catálogo de trámites</h2>
        <p className="text-sm text-muted-foreground">Encuentra el trámite que necesitas gestionar</p>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border border-border p-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-48 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar trámite..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-border bg-input text-foreground rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
          />
        </div>
        <select
          value={country}
          onChange={e => setCountry(e.target.value)}
          className="border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todos los países</option>
          <option value="ES">España</option>
          <option value="MX">México</option>
          <option value="AR">Argentina</option>
        </select>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Todas las categorías</option>
          <option value="Empleo">Empleo</option>
          <option value="Tráfico">Tráfico</option>
          <option value="Extranjería">Extranjería</option>
          <option value="Demo">Demo</option>
        </select>
      </div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="h-4 bg-secondary rounded w-3/4 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : procedures.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Search className="h-8 w-8 mx-auto mb-2 opacity-40" />
          <p>No se encontraron trámites</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {procedures.map((proc: any) => {
            const integration = proc.connector
              ? integrationBadge[proc.connector.integrationType as keyof typeof integrationBadge]
              : integrationBadge.MANUAL_ASSISTED;
            const IntIcon = integration.icon;

            return (
              <div key={proc.id} className="bg-card rounded-lg border border-border p-4 hover:shadow-sm transition-shadow flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${integration.color}`}>
                    <IntIcon className="h-3 w-3" />
                    {integration.label}
                  </span>
                  <span className="text-xs text-muted-foreground">{proc.organization?.country}</span>
                </div>

                <h3 className="font-medium text-sm mb-1 text-foreground">{proc.name}</h3>
                <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" />
                  {proc.organization?.name}
                </p>
                {proc.description && (
                  <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{proc.description}</p>
                )}

                <div className="mt-auto flex items-center justify-between pt-3 border-t border-border">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    {proc.estimatedTime && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {proc.estimatedTime} min
                      </span>
                    )}
                    {proc.serviceFee && (
                      <span className="font-medium text-foreground">
                        {formatCurrency(Number(proc.serviceFee), proc.currency)}
                      </span>
                    )}
                  </div>
                  <Link href={`/procedures/${proc.id}`}>
                    <Button size="sm">Ver trámite</Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
