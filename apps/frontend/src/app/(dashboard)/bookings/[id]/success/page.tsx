'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CheckCircle, Search, Loader2, Bell } from 'lucide-react';

const TERMINAL_STATUSES = ['COMPLETED', 'CONFIRMED', 'REQUIRES_USER_ACTION', 'ERROR', 'CANCELLED', 'EXPIRED', 'PRE_CONFIRMED'];

export default function BookingSuccessPage({ params }: { params: { id: string } }) {
  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-success', params.id],
    queryFn: () => api.get(`/bookings/${params.id}`).then(r => r.data.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = booking?.status;

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-lg border p-8 text-center">

        {/* Payment received, searching for slot */}
        {(status === 'SEARCHING' || !status) && (
          <>
            <Search className="h-12 w-12 text-primary mx-auto mb-4 animate-pulse" />
            <h2 className="text-xl font-semibold mb-2">Pago recibido</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Estamos buscando la primera cita disponible dentro de tus preferencias. Te notificaremos en cuanto encontremos una.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800 text-left">
              Puedes cerrar esta página. Recibirás una notificación cuando tu cita esté lista.
            </div>
          </>
        )}

        {/* Slot found, waiting for confirmation */}
        {status === 'PRE_CONFIRMED' && (
          <>
            <Bell className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Cita encontrada!</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Hemos encontrado una cita disponible. Ve a tu expediente para ver los detalles y confirmar.
            </p>
          </>
        )}

        {/* Confirmed */}
        {(status === 'CONFIRMED' || status === 'COMPLETED') && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Cita confirmada</h2>
            <p className="text-muted-foreground text-sm mb-4">Tu cita ha sido confirmada. Revisa tu expediente para ver los detalles.</p>
          </>
        )}

        {/* Still processing */}
        {status && !TERMINAL_STATUSES.includes(status) && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Procesando...</h2>
            <p className="text-muted-foreground text-sm">Un momento...</p>
          </>
        )}

        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/bookings">
            <Button variant="outline">Ver mis expedientes</Button>
          </Link>
          <Link href="/dashboard">
            <Button>Ir al inicio</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
