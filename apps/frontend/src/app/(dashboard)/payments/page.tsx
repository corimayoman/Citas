'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CreditCard } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'bg-yellow-100 text-yellow-700' },
  COMPLETED: { label: 'Completado', color: 'bg-green-100 text-green-700' },
  FAILED: { label: 'Fallido', color: 'bg-red-100 text-red-700' },
  REFUNDED: { label: 'Reembolsado', color: 'bg-gray-100 text-gray-600' },
};

export default function PaymentsPage() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then(r => r.data.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Pagos</h2>
        <p className="text-sm text-muted-foreground">{payments.length} transacciones</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-muted-foreground">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No tienes pagos registrados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {payments.map((payment: any) => {
            const status = statusConfig[payment.status] || { label: payment.status, color: 'bg-gray-100 text-gray-600' };
            return (
              <div key={payment.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">{payment.bookingRequest?.procedure?.name || 'Trámite'}</p>
                  <p className="text-xs text-muted-foreground">{formatDate(payment.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  <span className="text-sm font-semibold">{formatCurrency(Number(payment.amount))}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
