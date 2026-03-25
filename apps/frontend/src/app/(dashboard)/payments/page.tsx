'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate, formatCurrency } from '@/lib/utils';
import { CreditCard } from 'lucide-react';

const statusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pendiente', color: 'bg-[#FF0A6C]/10 text-[#FF3D8A]' },
  COMPLETED: { label: 'Completado', color: 'bg-emerald-900/30 text-emerald-400' },
  FAILED: { label: 'Fallido', color: 'bg-red-900/30 text-red-400' },
  REFUNDED: { label: 'Reembolsado', color: 'bg-[#1f1f35] text-[#6b6b8a]' },
};

export default function PaymentsPage() {
  const { data: payments = [], isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => api.get('/payments').then(r => r.data.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Pagos</h2>
        <p className="text-sm text-[#6b6b8a]">{payments.length} transacciones</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] p-4 animate-pulse">
              <div className="h-4 bg-[#1f1f35] rounded w-1/3 mb-2" />
              <div className="h-3 bg-[#1f1f35] rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : payments.length === 0 ? (
        <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] p-12 text-center text-[#6b6b8a]">
          <CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No tienes pagos registrados</p>
        </div>
      ) : (
        <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] divide-y divide-[#1f1f35]">
          {payments.map((payment: any) => {
            const status = statusConfig[payment.status] || { label: payment.status, color: 'bg-[#1f1f35] text-[#6b6b8a]' };
            return (
              <div key={payment.id} className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium text-white">{payment.bookingRequest?.procedure?.name || 'Trámite'}</p>
                  <p className="text-xs text-[#6b6b8a]">{formatDate(payment.createdAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${status.color}`}>{status.label}</span>
                  <span className="text-sm font-semibold text-white">{formatCurrency(Number(payment.amount))}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
