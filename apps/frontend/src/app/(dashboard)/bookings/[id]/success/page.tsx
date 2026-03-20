'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { CheckCircle, Loader2 } from 'lucide-react';

export default function BookingSuccessPage({ params }: { params: { id: string } }) {
  const { data: booking, isLoading } = useQuery({
    queryKey: ['booking-success', params.id],
    queryFn: () => api.get(`/bookings/${params.id}`).then(r => r.data.data),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'CONFIRMED' || status === 'COMPLETED' ? false : 2000;
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConfirmed = booking?.status === 'CONFIRMED' || booking?.status === 'COMPLETED';

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="bg-white rounded-lg border p-8 text-center">
        {isConfirmed ? (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">¡Cita confirmada!</h2>
            <p className="text-muted-foreground text-sm mb-4">
              Tu pago fue procesado y tu cita está confirmada. Revisá tu expediente para ver la fecha, hora y lugar.
            </p>
          </>
        ) : (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Procesando pago...</h2>
            <p className="text-muted-foreground text-sm mb-4">Un momento, estamos confirmando tu cita.</p>
          </>
        )}

        <div className="mt-6 flex gap-3 justify-center">
          <Link href="/bookings">
            <Button variant="outline">Ver mis expedientes</Button>
          </Link>
          <Link href={`/bookings/${params.id}`}>
            <Button>Ver mi cita</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
