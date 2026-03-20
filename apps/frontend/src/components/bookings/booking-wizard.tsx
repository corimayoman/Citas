'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronRight, AlertCircle, Sun, Sunset } from 'lucide-react';

interface WizardProps {
  procedure: any;
}

const STEPS = ['Solicitante', 'Preferencias', 'Datos', 'Revisión', 'Pago'];

export function BookingWizard({ procedure }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [bookingId, setBookingId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Date preferences
  const [preferredDateFrom, setPreferredDateFrom] = useState('');
  const [preferredDateTo, setPreferredDateTo] = useState('');
  const [preferredTimeSlot, setPreferredTimeSlot] = useState<'morning' | 'afternoon' | ''>('');

  const { data: profilesData, isLoading: profilesLoading } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.get('/users/me/profiles').then(r => r.data.data),
  });

  const profiles: any[] = Array.isArray(profilesData) ? profilesData : [];

  const buildFormDataFromProfile = (profile: any): Record<string, string> => {
    const data: Record<string, string> = {};
    const fields: any[] = procedure.formSchema?.fields || [];
    fields.forEach((field: any) => {
      const key = field.name?.toLowerCase();
      if (key?.includes('nombre') || key?.includes('firstname') || key === 'name') data[field.name] = profile.firstName;
      else if (key?.includes('apellido') || key?.includes('lastname') || key?.includes('surname')) data[field.name] = profile.lastName;
      else if (key?.includes('fullname') || key?.includes('nombrecompleto')) data[field.name] = `${profile.firstName} ${profile.lastName}`;
      else if (key?.includes('document') || key === 'dni' || key === 'nie' || key === 'passport') data[field.name] = profile.documentNumber;
      else if (key?.includes('nationality') || key?.includes('nacionalidad')) data[field.name] = profile.nationality;
      else if (key?.includes('birth') || key?.includes('nacimiento')) data[field.name] = profile.birthDate ? new Date(profile.birthDate).toISOString().split('T')[0] : '';
      else if (key === 'email') data[field.name] = profile.email || '';
      else if (key?.includes('phone') || key?.includes('telefono')) data[field.name] = profile.phone || '';
    });
    return data;
  };

  const handleContinueFromStep0 = () => {
    setErrorMsg('');
    if (!selectedProfile) return;
    setStep(1);
  };

  const handleContinueFromStep1 = () => {
    setErrorMsg('');
    if (!preferredDateFrom || !preferredDateTo) {
      setErrorMsg('Selecciona un rango de fechas.');
      return;
    }
    const profile = profiles.find(p => p.id === selectedProfile);
    if (profile) setFormData(buildFormDataFromProfile(profile));
    const fields: any[] = procedure.formSchema?.fields || [];
    if (fields.length === 0) {
      createBooking.mutate();
    } else {
      setStep(2);
    }
  };

  const createBooking = useMutation({
    mutationFn: () => api.post('/bookings', {
      applicantProfileId: selectedProfile,
      procedureId: procedure.id,
      formData,
      preferredDateFrom: preferredDateFrom || undefined,
      preferredDateTo: preferredDateTo || undefined,
      preferredTimeSlot: preferredTimeSlot || undefined,
    }),
    onSuccess: (res) => {
      setErrorMsg('');
      setBookingId(res.data.data.id);
      setStep(3);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Error al crear el expediente. Intenta de nuevo.';
      setErrorMsg(msg);
    },
  });

  const isDemoMode = process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE === 'true';

  const createCheckout = useMutation({
    mutationFn: () => isDemoMode
      ? api.post('/payments/demo-checkout', { bookingRequestId: bookingId })
      : api.post('/payments/checkout', { bookingRequestId: bookingId }),
    onSuccess: (res) => {
      if (isDemoMode) {
        router.push(`/bookings/${bookingId}/success?demo=true`);
      } else {
        window.location.href = res.data.data.url;
      }
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Error al iniciar el pago. Intenta de nuevo.';
      setErrorMsg(msg);
    },
  });

  const fields: any[] = procedure.formSchema?.fields || [];
  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="bg-white rounded-lg border">
      {/* Progress */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={cn(
                'h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium',
                i < step ? 'bg-primary text-white' :
                i === step ? 'bg-primary text-white' :
                'bg-secondary text-muted-foreground'
              )}>
                {i < step ? <Check className="h-3 w-3" /> : i + 1}
              </div>
              <span className={cn('text-xs hidden sm:block', i === step ? 'font-medium' : 'text-muted-foreground')}>
                {label}
              </span>
              {i < STEPS.length - 1 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        {errorMsg && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700 mb-4">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Step 0: Select applicant */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-medium">Selecciona el solicitante</h3>
            {profilesLoading ? (
              <div className="space-y-2">
                {[...Array(2)].map((_, i) => <div key={i} className="h-14 bg-muted rounded-md animate-pulse" />)}
              </div>
            ) : profiles.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No tienes perfiles de solicitante.{' '}
                <button onClick={() => router.push('/profile')} className="text-primary hover:underline">Crear perfil</button>
              </div>
            ) : (
              <div className="space-y-2">
                {profiles.map((p: any) => (
                  <label key={p.id} className={cn(
                    'flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors',
                    selectedProfile === p.id ? 'border-primary bg-accent' : 'hover:bg-muted'
                  )}>
                    <input type="radio" name="profile" value={p.id}
                      checked={selectedProfile === p.id}
                      onChange={() => setSelectedProfile(p.id)}
                      className="sr-only"
                    />
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-medium">
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{p.firstName} {p.lastName}</p>
                      <p className="text-xs text-muted-foreground">{p.documentType}: {p.documentNumber}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}
            <Button onClick={handleContinueFromStep0} disabled={!selectedProfile || profilesLoading} className="w-full">
              Continuar
            </Button>
          </div>
        )}

        {/* Step 1: Date preferences */}
        {step === 1 && (
          <div className="space-y-5">
            <h3 className="font-medium">Preferencias de fecha y horario</h3>
            <p className="text-sm text-muted-foreground">
              Indica en qué rango de fechas y horario prefieres tu cita. Buscaremos la primera disponible dentro de tus preferencias.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Desde <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  min={today}
                  value={preferredDateFrom}
                  onChange={e => setPreferredDateFrom(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Hasta <span className="text-destructive">*</span></label>
                <input
                  type="date"
                  min={preferredDateFrom || today}
                  value={preferredDateTo}
                  onChange={e => setPreferredDateTo(e.target.value)}
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Horario preferido</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: '', label: 'Sin preferencia', icon: null },
                  { value: 'morning', label: 'Mañana', sublabel: 'Antes de las 14:00', icon: Sun },
                  { value: 'afternoon', label: 'Tarde', sublabel: 'Después de las 14:00', icon: Sunset },
                ].map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPreferredTimeSlot(opt.value as any)}
                    className={cn(
                      'flex flex-col items-center gap-1 p-3 border rounded-md text-sm transition-colors',
                      preferredTimeSlot === opt.value ? 'border-primary bg-accent text-primary' : 'hover:bg-muted'
                    )}
                  >
                    {opt.icon && <opt.icon className="h-4 w-4" />}
                    <span className="font-medium">{opt.label}</span>
                    {opt.sublabel && <span className="text-xs text-muted-foreground">{opt.sublabel}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setErrorMsg(''); setStep(0); }}>Atrás</Button>
              <Button onClick={handleContinueFromStep1} className="flex-1">Continuar</Button>
            </div>
          </div>
        )}

        {/* Step 2: Form fields */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium">Datos del trámite</h3>
            {fields.map((field: any) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-1">
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </label>
                {field.type === 'textarea' ? (
                  <textarea
                    value={formData[field.name] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                    rows={3}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                ) : field.type === 'select' ? (
                  <select
                    value={formData[field.name] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Seleccionar...</option>
                    {field.options?.map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={field.type || 'text'}
                    value={formData[field.name] || ''}
                    onChange={e => setFormData(prev => ({ ...prev, [field.name]: e.target.value }))}
                    className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                )}
              </div>
            ))}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setErrorMsg(''); setStep(1); }}>Atrás</Button>
              <Button onClick={() => createBooking.mutate()} disabled={createBooking.isPending} className="flex-1">
                {createBooking.isPending ? 'Guardando...' : 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-medium">Revisión del expediente</h3>
            <div className="bg-muted rounded-md p-4 space-y-2 text-sm">
              <p><span className="font-medium">Trámite:</span> {procedure.name}</p>
              <p><span className="font-medium">Organismo:</span> {procedure.organization?.name}</p>
              {preferredDateFrom && <p><span className="font-medium">Fechas preferidas:</span> {preferredDateFrom} — {preferredDateTo}</p>}
              {preferredTimeSlot && <p><span className="font-medium">Horario:</span> {preferredTimeSlot === 'morning' ? 'Mañana (antes de las 14:00)' : 'Tarde (después de las 14:00)'}</p>}
              {Object.entries(formData).map(([k, v]) => (
                <p key={k}><span className="font-medium capitalize">{k}:</span> {v}</p>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
              Al continuar, autorizas a Gestor de Citas Oficiales a gestionar este trámite en tu nombre. Una vez realizado el pago, buscaremos la primera cita disponible dentro de tus preferencias y te notificaremos.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setErrorMsg(''); setStep(fields.length > 0 ? 2 : 1); }}>Atrás</Button>
              <Button onClick={() => { setErrorMsg(''); setStep(4); }} className="flex-1">Ir al pago</Button>
            </div>
          </div>
        )}

        {/* Step 4: Payment */}
        {step === 4 && (
          <div className="space-y-4">
            <h3 className="font-medium">Pago del servicio</h3>
            <div className="border rounded-md p-4">
              <div className="flex justify-between text-sm mb-2">
                <span>Gestión: {procedure.name}</span>
                <span className="font-medium">
                  {procedure.serviceFee ? `${procedure.serviceFee} ${procedure.currency}` : 'Gratuito'}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>Total</span>
                <span>{procedure.serviceFee ? `${procedure.serviceFee} ${procedure.currency}` : '0,00 EUR'}</span>
              </div>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-800">
              Tras el pago, buscaremos tu cita en segundo plano. Recibirás una notificación cuando encontremos una disponible dentro de tus preferencias.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setErrorMsg(''); setStep(3); }}>Atrás</Button>
              <Button
                onClick={() => createCheckout.mutate()}
                disabled={createCheckout.isPending}
                className="flex-1"
              >
                {createCheckout.isPending ? 'Procesando...' : isDemoMode ? 'Confirmar pago (Demo)' : 'Pagar con Stripe'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
