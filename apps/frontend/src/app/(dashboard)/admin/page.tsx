'use client';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Users, Building2, FileText, Activity, RotateCcw } from 'lucide-react';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [resetStatus, setResetStatus] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
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
      <h2 className="text-xl font-semibold text-foreground">Administración</h2>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Usuarios', value: data?.totalUsers ?? '—', icon: Users },
          { label: 'Organizaciones', value: data?.totalOrganizations ?? '—', icon: Building2 },
          { label: 'Trámites', value: data?.totalProcedures ?? '—', icon: FileText },
          { label: 'Reservas', value: data?.totalBookings ?? '—', icon: Activity },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-card rounded-lg border border-border p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">{label}</p>
            </div>
            <p className="text-2xl font-semibold text-foreground">{isLoading ? '—' : value}</p>
          </div>
        ))}
      </div>

      {/* Reset & Seed */}
      <div className="bg-card rounded-lg border border-border p-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Reset & Seed</p>
          <p className="text-xs text-muted-foreground">Borra todos los datos y recarga los datos iniciales (usuarios, trámites, conectores).</p>
        </div>
        <button
          onClick={async () => {
            if (!confirm('¿Estás seguro? Esto borrará TODOS los datos y los reemplazará con los datos de seed.')) return;
            setResetting(true);
            setResetStatus(null);
            try {
              await api.post('/admin/reset-and-seed');
              setResetStatus('Reset completado. Recargando...');
              queryClient.invalidateQueries();
              setTimeout(() => window.location.reload(), 1500);
            } catch (err: any) {
              setResetStatus(err?.response?.data?.error || 'Error al ejecutar reset');
            } finally {
              setResetting(false);
            }
          }}
          disabled={resetting}
          className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
        >
          <RotateCcw className={`h-3 w-3 ${resetting ? 'animate-spin' : ''}`} /> {resetting ? 'Ejecutando...' : 'Reset & Seed'}
        </button>
      </div>
      {resetStatus && <p className="text-xs text-muted-foreground">{resetStatus}</p>}

      {/* Users table */}
      <div className="bg-card rounded-lg border border-border">
        <div className="p-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Usuarios</h3>
        </div>
        <div className="divide-y divide-border">
          {usersLoading ? (
            [...Array(3)].map((_, i) => (
              <div key={i} className="p-4 animate-pulse">
                <div className="h-3 bg-secondary rounded w-1/3" />
              </div>
            ))
          ) : users?.users?.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No hay usuarios.</p>
          ) : (
            users?.users?.map((u: any) => (
              <div key={u.id} className="p-4 flex items-center justify-between text-sm">
                <div>
                  <p className="font-medium text-foreground">{u.email}</p>
                  <p className="text-xs text-muted-foreground">{u.role} · {u.isEmailVerified ? 'Verificado' : 'Sin verificar'}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${u.isActive !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-secondary text-muted-foreground'}`}>
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
