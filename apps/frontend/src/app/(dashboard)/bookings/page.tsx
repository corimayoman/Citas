'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Calendar, ChevronRight } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string }> = {
  DRAFT:                { label: 'Borrador',           color: 'bg-secondary text-muted-foreground' },
  SEARCHING:            { label: 'Buscando cita',      color: 'bg-blue-900/30 text-blue-400' },
  PRE_CONFIRMED:        { label: 'Cita encontrada',    color: 'bg-primary/10 text-primary-light' },
  PENDING_PAYMENT:      { label: 'Pendiente de pago',  color: 'bg-primary/10 text-primary-light' },
  PAID:                 { label: 'Pagado',             color: 'bg-blue-900/30 text-blue-400' },
  IN_PROGRESS:          { label: 'En gestión',         color: 'bg-blue-900/30 text-blue-400' },
  CONFIRMED:            { label: 'Confirmado',         color: 'bg-emerald-900/30 text-emerald-400' },
  COMPLETED:            { label: 'Completado',         color: 'bg-emerald-900/30 text-emerald-400' },
  ERROR:                { label: 'Error',              color: 'bg-red-900/30 text-red-400' },
  REQUIRES_USER_ACTION: { label: 'Requiere acción',    color: 'bg-primary/10 text-primary-light' },
  CANCELLED:            { label: 'Cancelado',          color: 'bg-secondary text-muted-foreground' },
  EXPIRED:              { label: 'Expirado',           color: 'bg-secondary text-muted-foreground' },
};

export default function BookingsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.get('/bookings').then(r => r.data.data),
  });

  const bookings = data?.bookings || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Mis citas y expedientes</h2>
          <p className="text-sm text-muted-foreground">{data?.total || 0} expedientes en total</p>
        </div>
        <Link href="/procedures">
          <Button size="sm">Nuevo trámite</Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg border border-border p-4 animate-pulse">
              <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-12 text-center text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No tienes expedientes aún</p>
          <Link href="/procedures" className="mt-4 inline-block">
            <Button>Buscar trámites</Button>
          </Link>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border divide-y divide-border">
          {bookings.map((booking: any) => {
            const status = statusConfig[booking.status] || { label: booking.status, color: 'bg-secondary text-muted-foreground' };
            return (
              <Link key={booking.id} href={`/bookings/${booking.id}`}
                className="flex items-center justify-between p-4 hover:bg-input transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{booking.procedure?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {booking.applicantProfile?.firstName} {booking.applicantProfile?.lastName}
                    {' · '}{formatDate(booking.createdAt)}
                    {booking.payment?.amount && ` · ${formatCurrency(Number(booking.payment.amount))}`}
                  </p>
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${status.color}`}>
                    {status.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
