'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Building2, FileText, Activity } from 'lucide-react';

export default function AdminPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/admin/stats').then(r => r.data.data).catch(() => null),
  });

  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get('/admin/users').then(r => r.data.data).catch(() => ({ users: [] })),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <h2 className="text-xl font-semibold text-white">Administración</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Usuarios', value: data?.totalUsers ?? '—', icon: Users },
          { label: 'Organizaciones', value: data?.totalOrganizations ?? '—', icon: Building2 },
          { label: 'Trámites', value: data?.totalProcedures ?? '—', icon: FileText },
          { label: 'Reservas', value: data?.totalBookings ?? '—', icon: Activity },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35] p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4 text-[#6b6b8a]" />
              <p className="text-xs text-[#6b6b8a]">{label}</p>
            </div>
            <p className="text-2xl font-semibold text-white">{isLoading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Users table */}
      <div className="bg-[#0d0d1a] rounded-lg border border-[#1f1f35]">
        <div className="p-4 border-b border-[#1f1f35]">
          <h3 className="text-sm font-semibold text-white">Usuarios</h3>
        </div>
        <div className="divide-y divide-[#1f1f35]">
          {usersLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-[#1f1f35] rounded w-1/3" />
              </div>
            ))
          ) : users?.users?.length === 0 ? (
            <p className="p-4 text-sm text-[#6b6b8a]">No hay usuarios.</p>
          ) : (
            users?.users?.map((u: any) => (
              <div key={u.id} className="p-4 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-white">{u.email}</p>
                  <p className="text-xs text-[#6b6b8a]">{u.role} · {u.isEmailVerified ? 'Verificado' : 'Sin verificar'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive !== false ? 'bg-emerald-900/30 text-emerald-400' : 'bg-[#1f1f35] text-[#6b6b8a]'}`}>
                  {u.isActive !== false ? 'Activo' : 'Inactivo'}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
