'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { User, Shield, CheckCircle, Plus, Trash2, AlertCircle, X, Bell, MessageSquare, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';

const DOCUMENT_TYPES = ['DNI', 'NIE', 'Pasaporte', 'TIE', 'Otro'];

function NotificationPreferences({ user }: { user: any }) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const channel: string = user?.notificationChannel ?? 'EMAIL';

  // Auto-migrate SMS users to EMAIL (Twilio trial limitation)
  useEffect(() => {
    if (channel === 'SMS') {
      mutation.mutate({ notificationChannel: 'EMAIL' });
    }
  }, []);

  const mutation = useMutation({
    mutationFn: (data: { notificationChannel: string; notificationPhone?: string }) =>
      api.patch('/users/me', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    },
  });

  // Auto-migrate SMS users to EMAIL (Twilio trial limitation)
  useEffect(() => {
    if (channel === 'SMS') {
      mutation.mutate({ notificationChannel: 'EMAIL' });
    }
  }, [channel]);

  const handleChannelChange = (newChannel: string) => {
    mutation.mutate({
      notificationChannel: newChannel,
      notificationPhone: newChannel === 'SMS' ? user?.notificationPhone : undefined,
    });
  };

  return (
    <div className="bg-card rounded-lg border border-border p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Preferencias de notificación</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Elegí cómo querés recibir las notificaciones sobre tus citas y pagos.
      </p>

      {/* Aviso si el usuario tiene SMS configurado — migrar a EMAIL */}
      {channel === 'SMS' && (
        <div className="flex items-start gap-2 bg-primary/10 border border-primary/30 rounded-md p-3 text-xs text-primary-light">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            Las notificaciones por SMS están temporalmente deshabilitadas. Tu canal fue cambiado a Email automáticamente.
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {/* EMAIL — única opción disponible */}
        <button
          type="button"
          onClick={() => handleChannelChange('EMAIL')}
          disabled={mutation.isPending}
          className={`flex items-center gap-3 p-4 border border-border rounded-lg text-left transition-colors ${
            channel === 'EMAIL' || channel === 'SMS'
              ? 'border-primary bg-primary/10'
              : 'hover:bg-input'
          }`}
        >
          <Mail className="h-5 w-5 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Email</p>
            <p className="text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <CheckCircle className="h-4 w-4 text-primary ml-auto" />
        </button>

        {/* SMS — deshabilitado, cuenta Twilio trial */}
        <div className="flex items-center gap-3 p-4 border border-border rounded-lg bg-input/40 opacity-50 cursor-not-allowed">
          <MessageSquare className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-muted-foreground">SMS</p>
            <p className="text-xs text-muted-foreground">No disponible temporalmente</p>
          </div>
        </div>
      </div>

      {saved && (
        <p className="text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle className="h-3.5 w-3.5" /> Preferencia guardada
        </p>
      )}
    </div>
  );
}

function NewProfileForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    firstName: '', lastName: '', documentType: 'DNI', documentNumber: '',
    nationality: '', birthDate: '', email: '', phone: '', isDefault: false,
  });
  const [error, setError] = useState('');

  const set = (k: string, v: string | boolean) => setForm(prev => ({ ...prev, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.post('/users/me/profiles', {
      ...form,
      birthDate: form.birthDate || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      onClose();
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || 'Error al crear el perfil.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.firstName || !form.lastName || !form.documentNumber || !form.nationality || !form.birthDate) {
      setError('Completa todos los campos obligatorios.');
      return;
    }
    mutation.mutate();
  };

  return (
    <form onSubmit={handleSubmit} className="border border-border rounded-lg p-5 space-y-4 bg-input/30">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground">Nuevo perfil de solicitante</p>
        <button type="button" onClick={onClose}><X className="h-4 w-4 text-muted-foreground" /></button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-900/30 border border-red-900/50 rounded-md p-3 text-xs text-red-400">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-foreground">Nombre <span className="text-red-400">*</span></label>
          <input value={form.firstName} onChange={e => set('firstName', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Apellidos <span className="text-red-400">*</span></label>
          <input value={form.lastName} onChange={e => set('lastName', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Tipo de documento <span className="text-red-400">*</span></label>
          <select value={form.documentType} onChange={e => set('documentType', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            {DOCUMENT_TYPES.map(t => <option key={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Número de documento <span className="text-red-400">*</span></label>
          <input value={form.documentNumber} onChange={e => set('documentNumber', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Nacionalidad <span className="text-red-400">*</span></label>
          <input value={form.nationality} onChange={e => set('nationality', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Fecha de nacimiento <span className="text-red-400">*</span></label>
          <input type="date" value={form.birthDate} onChange={e => set('birthDate', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Email</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div>
          <label className="text-xs font-medium text-foreground">Teléfono</label>
          <input value={form.phone} onChange={e => set('phone', e.target.value)}
            className="mt-1 w-full border border-border bg-input text-foreground rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm cursor-pointer text-foreground">
        <input type="checkbox" checked={form.isDefault} onChange={e => set('isDefault', e.target.checked)} />
        Establecer como perfil principal
      </label>

      <div className="flex gap-3 pt-1">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
        <Button type="submit" disabled={mutation.isPending} className="flex-1">
          {mutation.isPending ? 'Guardando...' : 'Guardar perfil'}
        </Button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState('');

  const { data: user, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => api.get('/users/me').then(r => r.data.data),
  });

  const deleteProfile = useMutation({
    mutationFn: (id: string) => api.delete(`/users/me/profiles/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['profile'] }),
  });

  const sendVerification = useMutation({
    mutationFn: () => api.post('/auth/send-verification'),
    onSuccess: (res) => {
      const demoToken = res.data.data.demoToken;
      if (demoToken) {
        api.get(`/auth/verify-email?token=${demoToken}`).then(() => {
          queryClient.invalidateQueries({ queryKey: ['profile'] });
          setVerifyMsg('Email verificado correctamente.');
        });
      } else {
        setVerifyMsg('Se envió un email de verificación a tu dirección.');
      }
    },
    onError: (err: any) => setVerifyMsg(err?.response?.data?.error?.message || 'Error al enviar verificación.'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="bg-card rounded-lg border border-border p-6 animate-pulse">
            <div className="h-4 bg-secondary rounded w-1/4 mb-3" />
            <div className="h-3 bg-secondary rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-xl font-semibold text-foreground">Mi perfil</h2>

      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center">
            <User className="h-5 w-5 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{user?.email}</p>
            <p className="text-xs text-muted-foreground capitalize">{user?.role?.toLowerCase().replace('_', ' ')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Email verificado</p>
            <div className="flex items-center gap-2 mt-0.5">
              <CheckCircle className={`h-3.5 w-3.5 ${user?.isEmailVerified ? 'text-emerald-400' : 'text-muted-foreground'}`} />
              <span className="text-foreground">{user?.isEmailVerified ? 'Sí' : 'No'}</span>
              {!user?.isEmailVerified && (
                <button
                  onClick={() => { setVerifyMsg(''); sendVerification.mutate(); }}
                  disabled={sendVerification.isPending}
                  className="text-xs text-primary hover:underline disabled:opacity-50"
                >
                  {sendVerification.isPending ? 'Verificando...' : 'Verificar'}
                </button>
              )}
            </div>
            {verifyMsg && <p className="text-xs text-emerald-400 mt-1">{verifyMsg}</p>}
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Autenticación 2FA</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Shield className={`h-3.5 w-3.5 ${user?.mfaEnabled ? 'text-emerald-400' : 'text-muted-foreground'}`} />
              <span className="text-foreground">{user?.mfaEnabled ? 'Activa' : 'Inactiva'}</span>
            </div>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Miembro desde</p>
            <p className="text-foreground">{formatDate(user?.createdAt)}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Consentimiento GDPR</p>
            <p className="text-foreground">{user?.consentGiven ? formatDate(user.consentDate) : 'No otorgado'}</p>
          </div>
        </div>
      </div>

      <NotificationPreferences user={user} />

      <div className="bg-card rounded-lg border border-border p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Perfiles de solicitante</h3>
          {!showForm && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo perfil
            </Button>
          )}
        </div>

        {showForm && <NewProfileForm onClose={() => setShowForm(false)} />}

        {user?.applicantProfiles?.length === 0 && !showForm ? (
          <p className="text-sm text-muted-foreground">No tienes perfiles creados.</p>
        ) : (
          <div className="space-y-2">
            {user?.applicantProfiles?.map((profile: any) => (
              <div key={profile.id} className="flex items-center justify-between p-3 rounded-md bg-input">
                <div>
                  <p className="text-sm font-medium text-foreground">{profile.firstName} {profile.lastName}</p>
                  <p className="text-xs text-muted-foreground">{profile.documentType} · {profile.documentNumber}</p>
                </div>
                <div className="flex items-center gap-2">
                  {profile.isDefault && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-900/30 text-blue-400">Principal</span>
                  )}
                  <button onClick={() => deleteProfile.mutate(profile.id)}
                    className="text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
