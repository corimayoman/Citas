'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, FileText, CreditCard, User, CheckCircle, AlertCircle, Clock, XCircle, RefreshCw, Search, Bell } from 'lucide-react';

function PreConfirmedPayment({ bookingId, procedure, paymentDeadline }: { bookingId: string; procedure: any; paymentDeadline?: string }) {
  const queryClient = useQueryClient();
  const isDemoMode = process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE === 'true';
  const [error, setError] = useState('');

  const checkout = useMutation({
    mutationFn: () => isDemoMode
      ? api.post('/payments/demo-checkout', { bookingRequestId: bookingId })
      : api.post('/payments/checkout', { bookingRequestId: bookingId }),
    onSuccess: (res) => {
      if (isDemoMode) queryClient.invalidateQueries({ queryKey: ['booking', bookingId] });
      else window.location.href = res.data.data.url;
    },
    onError: (err: any) => setError(err?.response?.data?.error?.message || 'Error al procesar el pago.'),
  });

  return (
    <div className="bg-primary/5 border border-primary/30 rounded-lg p-5 space-y-3">
      <div className="flex items-start gap-2">
        <Bell className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">¡Encontramos una cita disponible!</p>
          <p className="text-xs text-muted-foreground mt-1">
            Realizá el pago para confirmarla y recibir la fecha, hora y lugar exactos.
            {paymentDeadline && ` Tenés hasta el ${formatDate(paymentDeadline)} para pagar.`}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between text-sm border-t border-primary/20 pt-3">
        <span className="text-muted-foreground">Gestión: {procedure?.name}</span>
        <span className="font-semibold text-foreground">
          {procedure?.serviceFee ? `${procedure.serviceFee} ${procedure.currency}` : 'Gratuito'}
        </span>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <Button onClick={() => checkout.mutate()} disabled={checkout.isPending} className="w-full">
        {checkout.isPending ? 'Procesando...' : isDemoMode ? 'Pagar y confirmar cita (Demo)' : 'Pagar con Stripe'}
      </Button>
    </div>
  );
}

function RetryExecution({ bookingId }: { bookingId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => api.post(`/bookings/${bookingId}/execute`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['booking', bookingId] }),
  });
  return (
    <div className="bg-card border border-border rounded-lg p-5 flex items-center justify-between">
      <p className="text-sm text-muted-foreground">La gestión no pudo completarse automáticamente.</p>
      <Button size="sm" variant="outline" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
        <RefreshCw className={`h-3.5 w-3.5 mr-1 ${mutation.isPending ? 'animate-spin' : ''}`} />
        {mutation.isPending ? 'Procesando...' : 'Reintentar'}
      </Button>
    </div>
  );
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  DRAFT:                { label: 'Borrador',          color: 'bg-secondary text-muted-foreground',        icon: FileText },
  SEARCHING:            { label: 'Buscando cita',     color: 'bg-blue-100 text-blue-700',        icon: Search },
  PRE_CONFIRMED:        { label: 'Cita disponible',   color: 'bg-primary/10 text-primary-light',     icon: Bell },
  PENDING_PAYMENT:      { label: 'Pendiente de pago', color: 'bg-primary/10 text-primary-light',     icon: CreditCard },
  PAID:                 { label: 'Pagado',            color: 'bg-blue-100 text-blue-700',        icon: CreditCard },
  IN_PROGRESS:          { label: 'En gestión',        color: 'bg-blue-100 text-blue-700',        icon: Clock },
  CONFIRMED:            { label: 'Confirmado',        color: 'bg-emerald-100 text-emerald-700',  icon: CheckCircle },
  COMPLETED:            { label: 'Completado',        color: 'bg-emerald-100 text-emerald-700',  icon: CheckCircle },
  ERROR:                { label: 'Error',             color: 'bg-red-100 text-red-700',          icon: XCircle },
  REQUIRES_USER_ACTION: { label: 'Requiere acción',   color: 'bg-primary/10 text-primary-light',     icon: AlertCircle },
  CANCELLED:            { label: 'Cancelado',         color: 'bg-secondary text-muted-foreground',        icon: XCircle },
  EXPIRED:              { label: 'Expirado',          color: 'bg-secondary text-muted-foreground',        icon: XCircle },
};

const card = 'bg-card rounded-lg border border-border p-6';

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking', params.id],
    queryFn: () => api.get(`/bookings/${params.id}`).then(r => r.data.data),
    refetchInterval: (query) => query.state.data?.status === 'SEARCHING' ? 3000 : false,
  });

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className={`${card} animate-pulse`}>
            <div className="h-4 bg-secondary rounded w-1/3 mb-3" />
            <div className="h-3 bg-secondary rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (!booking) return <div className="text-muted-foreground text-sm">Expediente no encontrado.</div>;

  const status = statusConfig[booking.status] || { label: booking.status, color: 'bg-secondary text-muted-foreground', icon: FileText };
  const StatusIcon = status.icon;
  const isConfirmed = ['CONFIRMED', 'COMPLETED'].includes(booking.status);

  return (
    <div className="max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-1" /> Volver
      </Button>

      <div className={card}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">{booking.procedure?.name}</h2>
            <p className="text-sm text-muted-foreground mt-0.5">{booking.procedure?.organization?.name}</p>
          </div>
          <span className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${status.color}`}>
            <StatusIcon className="h-3.5 w-3.5" />{status.label}
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm border-t border-border pt-4">
          <div><p className="text-xs text-muted-foreground">Creado</p><p className="text-foreground">{formatDate(booking.createdAt)}</p></div>
          {booking.completedAt && <div><p className="text-xs text-muted-foreground">Completado</p><p className="text-foreground">{formatDate(booking.completedAt)}</p></div>}
          {booking.preferredDateFrom && (
            <div>
              <p className="text-xs text-muted-foreground">Fechas preferidas</p>
              <p className="text-foreground">{formatDate(booking.preferredDateFrom)} — {formatDate(booking.preferredDateTo)}</p>
            </div>
          )}
          {booking.preferredTimeSlot && (
            <div><p className="text-xs text-muted-foreground">Horario</p><p className="text-foreground">{booking.preferredTimeSlot === 'morning' ? 'Mañana' : 'Tarde'}</p></div>
          )}
          {booking.paymentDeadline && booking.status === 'PRE_CONFIRMED' && (
            <div><p className="text-xs text-muted-foreground">Pagar antes de</p><p className="text-primary-light font-medium">{formatDate(booking.paymentDeadline)}</p></div>
          )}
          {booking.externalRef && (
            <div><p className="text-xs text-muted-foreground">Referencia</p><p className="font-mono text-xs text-foreground">{booking.externalRef}</p></div>
          )}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <User className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">Solicitante</h3>
        </div>
        <p className="text-sm font-medium text-foreground">{booking.applicantProfile?.firstName} {booking.applicantProfile?.lastName}</p>
        <p className="text-xs text-muted-foreground">{booking.applicantProfile?.documentType} · {booking.applicantProfile?.documentNumber}</p>
      </div>

      {booking.appointment && isConfirmed && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Cita confirmada</h3>
          </div>
          <div className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Código:</span> <span className="font-mono font-medium text-primary">{booking.appointment.confirmationCode}</span></p>
            <p><span className="text-muted-foreground">Fecha:</span> <span className="text-foreground">{formatDate(booking.appointment.appointmentDate)}</span></p>
            <p><span className="text-muted-foreground">Hora:</span> <span className="text-foreground">{booking.appointment.appointmentTime}</span></p>
            {booking.appointment.location && <p><span className="text-muted-foreground">Lugar:</span> <span className="text-foreground">{booking.appointment.location}</span></p>}
            {booking.appointment.instructions && <p className="text-muted-foreground text-xs mt-2">{booking.appointment.instructions}</p>}
          </div>
        </div>
      )}

      {booking.payment && (
        <div className={card}>
          <div className="flex items-center gap-2 mb-3">
            <CreditCard className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold text-foreground">Pago</h3>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{booking.payment.description || 'Gestión del trámite'}</span>
            <span className="font-semibold text-foreground">{formatCurrency(Number(booking.payment.amount), booking.payment.currency)}</span>
          </div>
          {booking.payment.paidAt && <p className="text-xs text-muted-foreground mt-1">Pagado el {formatDate(booking.payment.paidAt)}</p>}
        </div>
      )}

      {booking.status === 'SEARCHING' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-5 flex items-start gap-3">
          <Search className="h-4 w-4 text-blue-600 mt-0.5 shrink-0 animate-pulse" />
          <div>
            <p className="text-sm font-medium text-foreground">Buscando cita disponible</p>
            <p className="text-xs text-muted-foreground mt-1">Estamos buscando la primera cita disponible. Esta página se actualiza automáticamente.</p>
          </div>
        </div>
      )}

      {booking.status === 'PRE_CONFIRMED' && (
        <PreConfirmedPayment bookingId={params.id} procedure={booking.procedure} paymentDeadline={booking.paymentDeadline} />
      )}

      {booking.status === 'ERROR' && booking.payment?.status === 'PAID' && (
        <RetryExecution bookingId={params.id} />
      )}

      {booking.status === 'REQUIRES_USER_ACTION' && booking.procedure?.connector?.baseUrl && (
        <div className="bg-primary/5 border border-primary/30 rounded-lg p-5">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Acción requerida</p>
              <p className="text-xs text-muted-foreground mt-1">Tus datos están listos. Completá la reserva en el portal oficial.</p>
              <a href={booking.procedure.connector.baseUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" variant="outline" className="mt-3">Ir al portal oficial</Button>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
