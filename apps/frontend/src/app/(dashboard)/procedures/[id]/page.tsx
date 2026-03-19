'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { BookingWizard } from '@/components/bookings/booking-wizard';
import { Building2, Clock, FileText, AlertCircle } from 'lucide-react';

export default function ProcedureDetailPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useQuery({
    queryKey: ['procedure', params.id],
    queryFn: () => api.get(`/procedures/${params.id}`).then(r => r.data.data),
  });

  if (isLoading) return <div className="animate-pulse space-y-4"><div className="h-8 bg-gray-200 rounded w-1/2" /></div>;
  if (!data) return <div>Trámite no encontrado</div>;

  const isManual = !data.connector || data.connector.integrationType === 'MANUAL_ASSISTED';

  return (
    <div className="max-w-3xl space-y-6">
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold">{data.name}</h2>
            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
              <Building2 className="h-3 w-3" />
              {data.organization?.name}
            </p>
          </div>
          {data.serviceFee && (
            <div className="text-right">
              <p className="text-lg font-semibold">{formatCurrency(Number(data.serviceFee), data.currency)}</p>
              <p className="text-xs text-muted-foreground">Coste del servicio</p>
            </div>
          )}
        </div>

        {data.description && <p className="text-sm text-muted-foreground mb-4">{data.description}</p>}

        <div className="flex flex-wrap gap-4 text-sm">
          {data.estimatedTime && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Clock className="h-4 w-4" />
              Tiempo estimado: {data.estimatedTime} min
            </span>
          )}
          {data.slaHours && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <FileText className="h-4 w-4" />
              SLA: {data.slaHours}h
            </span>
          )}
        </div>

        {isManual && (
          <div className="mt-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Este trámite se gestiona en modo asistido. Prepararemos todos tus datos y te guiaremos para completarlo manualmente en el portal oficial.
            </span>
          </div>
        )}

        {data.legalBasis && (
          <p className="mt-3 text-xs text-muted-foreground">Base legal: {data.legalBasis}</p>
        )}
      </div>

      {data.requirements?.length > 0 && (
        <div className="bg-white rounded-lg border p-6">
          <h3 className="font-medium mb-3">Documentación requerida</h3>
          <ul className="space-y-2">
            {data.requirements.map((req: any) => (
              <li key={req.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${req.isRequired ? 'bg-red-400' : 'bg-gray-300'}`} />
                <span>
                  {req.name}
                  {!req.isRequired && <span className="text-muted-foreground ml-1">(opcional)</span>}
                  {req.description && <span className="block text-xs text-muted-foreground">{req.description}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <BookingWizard procedure={data} />
    </div>
  );
}
