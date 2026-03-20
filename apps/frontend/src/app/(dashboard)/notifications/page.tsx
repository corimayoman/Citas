'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications').then(r => r.data.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Notificaciones</h2>
        <p className="text-sm text-muted-foreground">{notifications.length} notificaciones</p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-3 bg-gray-100 rounded w-1/4" />
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-muted-foreground">
          <Bell className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p>No tienes notificaciones</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border divide-y">
          {notifications.map((n: any) => (
            <div key={n.id} className={`p-4 ${!n.readAt ? 'bg-blue-50' : ''}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <p className="text-xs text-muted-foreground">{formatDate(n.createdAt)}</p>
                  {!n.readAt && <span className="w-2 h-2 rounded-full bg-blue-500" />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
