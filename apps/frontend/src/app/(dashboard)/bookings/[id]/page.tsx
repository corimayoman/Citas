'use client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, CreditCard, User, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw } from 'lucide-react';

function RetryExecution({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId}/execute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
  });
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-5 flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-red-800">Error en la gestión</p>
        <p className="text-xs text-red-600 mt-0.5">El pago fue procesado. Podés reintentar la ejecución.</p>
      </div>
      <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${mutation.isPending ? 'animate-spin' : ''}`} />
        {mutation.isPending ? 'Reintentando...' : 'Reintentar'}
      </Button>
    </div>
  );
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT:                { label: 'Borrador',           color: 'bg-gray-100 text-gray-700',    icon: FileText },
  PENDING_PAYMENT:      { label: 'Pendiente de pago',  color: 'bg-yellow-100 text-yellow-700', icon: CreditCard },
  PAID:                 { label: 'Pagado',              color: 'bg-blue-100 text-blue-700',    icon: CreditCard },
  IN_PROGRESS:          { label: 'En gestión',          color: 'bg-indigo-100 text-indigo-700', icon: Clock },
  COMPLETED:            { label: 'Completado',          color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  ERROR:                { label: 'Error',               color: 'bg-red-100 text-red-700',      icon: XCircle },
  REQUIRES_USER_ACTION: { label: 'Requiere acción',     color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  CANCELLED:            { label: 'Cancelado',           color: 'bg-gray-100 text-gray-500',    icon: XCircle },
};

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', params.id],
    queryFn: () => api.get(`/bookings/${params.id}`).then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/3 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!booking) return <div className="text-muted-foreground text-sm">Expediente no encontrado.</div>;

  const status = statusConfig[booking.status] || { label: booking.status, color: 'bg-gray-100 text-gray-700', icon: FileText };
  const StatusIcon = status.icon;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Volver
        </Button>
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{booking.procedure?.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{booking.procedure?.organization?.name}</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${status.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />
            {status.label}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t pt-4">
          <div>
            <p className="text-xs text-muted-foreground">Creado</p>
            <p>{formatDate(booking.createdAt)}</p>
          </div>
          {booking.completedAt && (
            <div>
              <p className="text-xs text-muted-foreground">Completado</p>
              <p>{formatDate(booking.completedAt)}</p>
            </div>
          )}
          {booking.externalRef && (
            <div>
              <p className="text-xs text-muted-foreground">Referencia externa</p>
              <p className="font-mono text-xs">{booking.externalRef}</p>
            </div>
          )}
        </div>
      </div>

      {/* Applicant */}
      <div className="bg-white rounded-lg border p-6">
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Solicitante</h3>
        </div>
        <p className="text-sm font-medium">{booking.applicantProfile?.firstName} {booking.applicantProfile?.lastName}</p>
        <p className="text-xs text-muted-foreground">{booking.applicantProfile?.documentType} · {booking.applicantProfile?.documentNumber}</p>
      </div>

      {/* Appointment */}
      {booking.appointment && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Cita confirmada</h3>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Código:</span> <span className="font-mono font-medium">{booking.appointment.confirmationCode}</span></p>
            <p><span className="text-muted-foreground">Fecha:</span> {formatDate(booking.appointment.appointmentDate)}</p>
            <p><span className="text-muted-foreground">Hora:</span> {booking.appointment.appointmentTime}</p>
            {booking.appointment.location && <p><span className="text-muted-foreground">Lugar:</span> {booking.appointment.location}</p>}
            {booking.appointment.instructions && (
              <p className="text-muted-foreground text-xs mt-2">{booking.appointment.instructions}</p>
            )}
          </div>
        </div>
      )}

      {/* Payment */}
      {booking.payment && (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Pago</h3>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{booking.payment.description || 'Gestión del trámite'}</span>
            <span className="font-semibold">{formatCurrency(Number(booking.payment.amount), booking.payment.currency)}</span>
          </div>
          {booking.payment.paidAt && (
            <p className="text-xs text-muted-foreground mt-1">Pagado el {formatDate(booking.payment.paidAt)}</p>
          )}
        </div>
      )}

      {/* Error with payment done — allow retry */}
      {booking.status === 'ERROR' && booking.payment?.status === 'PAID' && (
        <RetryExecution bookingId={params.id} />
      )}

      {/* Manual action required */}
      {booking.status === 'REQUIRES_USER_ACTION' && booking.procedure?.connector?.baseUrl && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">Acción requerida</p>
              <p className="text-xs text-amber-700 mt-1">Tus datos están listos. Completa la reserva en el portal oficial.</p>
              <a href={booking.procedure.connector.baseUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="mt-3">Ir al portal oficial</Button>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Draft — go to payment */}
      {booking.status === 'DRAFT' && (
        <div className="bg-white rounded-lg border p-5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Expediente en borrador</p>
            <p className="text-xs text-muted-foreground mt-0.5">Completa el pago para iniciar la gestión.</p>
          </div>
          <Link href={`/procedures/${booking.procedure?.id}`}>
            <Button size="sm">Continuar</Button>
          </Link>
        </div>
      )}
    </div>
  );
}
