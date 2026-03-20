'use client';
import { useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const TERMINAL_STATUSES = ['COMPLETED', 'REQUIRES_USER_ACTION', 'ERROR', 'CANCELLED'];

export default function BookingSuccessPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams();
  const isDemo = searchParams.get('demo') === 'true';

  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-success', params.id],
    queryFn: () => api.get(`/bookings/${params.id}`).then(r => r.data.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && TERMINAL_STATUSES.includes(status) ? false : 2000;
    },
  });

  const execute = useMutation({
    mutationFn: () => api.post(`/bookings/${params.id}/execute`),
  });

  useEffect(() => {
    // Only trigger execute from this page if NOT coming from demo flow
    // (demo flow already called execute before redirecting here)
    if (!isDemo && booking?.status === 'PAID' && !execute.isPending && !execute.isSuccess) {
      execute.mutate();
    }
  }, [booking?.status, isDemo]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const status = booking?.status;
  const isCompleted = status === 'COMPLETED';
  const isManual = status === 'REQUIRES_USER_ACTION';
  const isError = status === 'ERROR';
  const isProcessing = !status || !TERMINAL_STATUSES.includes(status);

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-lg border p-8 text-center">
        {isCompleted && (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Cita confirmada</h2>
            <p className="text-muted-foreground text-sm mb-4">Tu cita ha sido reservada correctamente.</p>
            {booking?.appointment && (
              <div className="bg-muted rounded-md p-4 text-left text-sm space-y-2">
                <p><span className="font-medium">Código:</span> {booking.appointment.confirmationCode}</p>
                <p><span className="font-medium">Fecha:</span> {booking.appointment.appointmentDate}</p>
                <p><span className="font-medium">Hora:</span> {booking.appointment.appointmentTime}</p>
                {booking.appointment.location && <p><span className="font-medium">Lugar:</span> {booking.appointment.location}</p>}
                {booking.appointment.instructions && <p className="text-muted-foreground">{booking.appointment.instructions}</p>}
              </div>
            )}
          </>
        )}

        {isManual && (
          <>
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Acción requerida</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Este trámite requiere completarse manualmente en el portal oficial. Hemos preparado todos tus datos.
            </p>
            {booking?.procedure?.connector?.baseUrl && (
              <a href={booking.procedure.connector.baseUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full mb-3">Ir al portal oficial</Button>
              </a>
            )}
          </>
        )}

        {isError && (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Error en la gestión</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Ha ocurrido un error. Nuestro equipo revisará el expediente y te contactará.
            </p>
          </>
        )}

        {!isCompleted && !isManual && !isError && isProcessing && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Procesando tu gestión</h2>
            <p className="text-muted-foreground text-sm">Estamos gestionando tu cita...</p>
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
