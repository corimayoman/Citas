'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Calendar, FileText, CreditCard, Clock } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

const statusLabels: Record<string, { label: string; color: string }> = {
  DRAFT: { label: 'Borrador', color: 'bg-[#1f1f35] text-[#6b6b8a]' },
  PENDING_PAYMENT: { label: 'Pendiente de pago', color: 'bg-[#FF0A6C]/10 text-[#FF3D8A]' },
  PAID: { label: 'Pagado', color: 'bg-blue-900/30 text-blue-400' },
  IN_PROGRESS: { label: 'En gestión', color: 'bg-blue-900/30 text-blue-400' },
  COMPLETED: { label: 'Completado', color: 'bg-emerald-900/30 text-emerald-400' },
  ERROR: { label: 'Error', color: 'bg-red-900/30 text-red-400' },
  REQUIRES_USER_ACTION: { label: 'Requiere acción', color: 'bg-[#FF0A6C]/10 text-[#FF3D8A]' },
  CANCELLED: { label: 'Cancelado', color: 'bg-[#1f1f35] text-[#6b6b8a]' },
};

export default function DashboardPage() {
  const { user } = useAuthStore();

  const { data: bookingsData } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => api.get('/bookings').then(r => r.data.data),
  });

  const bookings = bookingsData?.bookings || [];
  const stats = {
    total: bookings.length,
    completed: bookings.filter((b: any) => b.status === 'COMPLETED').length,
    inProgress: bookings.filter((b: any) => ['IN_PROGRESS', 'PAID'].includes(b.status)).length,
    pending: bookings.filter((b: any) => b.status === 'REQUIRES_USER_ACTION').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Bienvenido</h2>
        <p className="text-[#6b6b8a] text-sm">{user?.email}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total expedientes', value: stats.total, icon: FileText, color: 'text-blue-400' },
          { label: 'Completados', value: stats.completed, icon: Calendar, color: 'text-emerald-400' },
          { label: 'En gestión', value: stats.inProgress, icon: Clock, color: 'text-blue-400' },
          { label: 'Requieren acción', value: stats.pending, icon: CreditCard, color: 'text-[#FF3D8A]' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-[#6b6b8a]">{label}</span>
              <Icon className={`h-4 w-4 ${color}`} />
            </div>
            <p className="text-2xl font-semibold text-white">{value}</p>
          </div>
        ))}
      </div>

      {/* Recent bookings */}
      <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35]">
        <div className="p-4 border-b border-[#1f1f35] flex items-center justify-between">
          <h3 className="font-medium text-white">Expedientes recientes</h3>
          <Link href="/bookings">
            <Button variant="ghost" size="sm">Ver todos</Button>
          </Link>
        </div>

        {bookings.length === 0 ? (
          <div className="p-8 text-center text-[#6b6b8a]">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No tienes expedientes aún</p>
            <Link href="/procedures" className="mt-3 inline-block">
              <Button size="sm">Buscar trámites</Button>
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[#1f1f35]">
            {bookings.slice(0, 5).map((booking: any) => {
              const status = statusLabels[booking.status] || { label: booking.status, color: 'bg-[#1f1f35] text-[#6b6b8a]' };
              return (
                <Link key={booking.id} href={`/bookings/${booking.id}`} className="flex items-center justify-between p-4 hover:bg-[#13131f] transition-colors">
                  <div>
                    <p className="text-sm font-medium text-white">{booking.procedure?.name}</p>
                    <p className="text-xs text-[#6b6b8a]">
                      {booking.applicantProfile?.firstName} {booking.applicantProfile?.lastName} · {formatDate(booking.createdAt)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${status.color}`}>{status.label}</span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] p-4">
        <h3 className="font-medium mb-3 text-white">Acciones rápidas</h3>
        <div className="flex gap-3 flex-wrap">
          <Link href="/procedures"><Button variant="outline" size="sm">Nuevo trámite</Button></Link>
          <Link href="/profile"><Button variant="outline" size="sm">Gestionar perfiles</Button></Link>
          <Link href="/payments"><Button variant="outline" size="sm">Ver pagos</Button></Link>
        </div>
      </div>
    </div>
  );
}
