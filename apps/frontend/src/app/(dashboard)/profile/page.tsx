'use client';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, Shield, CheckCircle } from 'lucide-react';

export default function ProfilePage() {
  const { data: user, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/users/me').then(r => r.data.data),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border p-6 animate-pulse">
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-3" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-semibold">Mi perfil</h2>

      {/* Account info */}
      <div className="bg-white rounded-lg border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium">{user?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase().replace('_', ' ')}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-2 border-t text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Email verificado</p>
            <div className="flex items-center gap-1 mt-0.5">
              <CheckCircle className={`h-3.5 w-3.5 ${user?.isEmailVerified ? 'text-green-500' : 'text-gray-300'}`} />
              <span>{user?.isEmailVerified ? 'Sí' : 'No'}</span>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Autenticación 2FA</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className={`h-3.5 w-3.5 ${user?.mfaEnabled ? 'text-green-500' : 'text-gray-300'}`} />
              <span>{user?.mfaEnabled ? 'Activa' : 'Inactiva'}</span>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Miembro desde</p>
            <p>{formatDate(user?.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Consentimiento GDPR</p>
            <p>{user?.consentGiven ? formatDate(user.consentDate) : 'No otorgado'}</p>
          </div>
        </div>
      </div>

      {/* Applicant profiles */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-sm font-semibold mb-4">Perfiles de solicitante</h3>
        {user?.applicantProfiles?.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tienes perfiles creados.</p>
        ) : (
          <div className="space-y-3">
            {user?.applicantProfiles?.map((profile: any) => (
              <div key={profile.id} className="flex items-center justify-between p-3 rounded-md bg-muted">
                <div>
                  <p className="text-sm font-medium">{profile.firstName} {profile.lastName}</p>
                  <p className="text-xs text-muted-foreground">{profile.documentType} · {profile.documentNumber}</p>
                </div>
                {profile.isDefault && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Principal</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
