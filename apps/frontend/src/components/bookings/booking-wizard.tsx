'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Check, ChevronRight } from 'lucide-react';

interface WizardProps {
  procedure: any;
}

const STEPS = ['Solicitante', 'Datos del trámite', 'Revisión', 'Pago'];

export function BookingWizard({ procedure }: WizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState('');
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [bookingId, setBookingId] = useState('');

  const { data: profilesData } = useQuery({
    queryKey: ['profiles'],
    queryFn: () => api.get('/users/me/profiles').then(r => r.data.data),
  });

  const createBooking = useMutation({
    mutationFn: () => api.post('/bookings', {
      applicantProfileId: selectedProfile,
      procedureId: procedure.id,
      formData,
    }),
    onSuccess: (res) => {
      setBookingId(res.data.data.id);
      setStep(2);
    },
  });

  const createCheckout = useMutation({
    mutationFn: () => api.post('/payments/checkout', { bookingRequestId: bookingId }),
    onSuccess: (res) => {
      window.location.href = res.data.data.url;
    },
  });

  const fields: any[] = procedure.formSchema?.fields || [];

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
        {/* Step 0: Select applicant */}
        {step === 0 && (
          <div className="space-y-4">
            <h3 className="font-medium">Selecciona el solicitante</h3>
            {profilesData?.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No tienes perfiles de solicitante.{' '}
                <button onClick={() => router.push('/profile')} className="text-primary hover:underline">
                  Crear perfil
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {profilesData?.map((p: any) => (
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
            <Button onClick={() => setStep(1)} disabled={!selectedProfile} className="w-full">
              Continuar
            </Button>
          </div>
        )}

        {/* Step 1: Form fields */}
        {step === 1 && (
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
                    {field.options?.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
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
              <Button variant="outline" onClick={() => setStep(0)}>Atrás</Button>
              <Button onClick={() => createBooking.mutate()} disabled={createBooking.isPending} className="flex-1">
                {createBooking.isPending ? 'Guardando...' : 'Continuar'}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Review */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-medium">Revisión del expediente</h3>
            <div className="bg-muted rounded-md p-4 space-y-2 text-sm">
              <p><span className="font-medium">Trámite:</span> {procedure.name}</p>
              <p><span className="font-medium">Organismo:</span> {procedure.organization?.name}</p>
              {Object.entries(formData).map(([k, v]) => (
                <p key={k}><span className="font-medium capitalize">{k}:</span> {v}</p>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
              Al continuar, autorizas a Gestor de Citas Oficiales a gestionar este trámite en tu nombre como intermediario. Esta aplicación no representa al organismo público.
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>Atrás</Button>
              <Button onClick={() => setStep(3)} className="flex-1">Ir al pago</Button>
            </div>
          </div>
        )}

        {/* Step 3: Payment */}
        {step === 3 && (
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
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)}>Atrás</Button>
              <Button
                onClick={() => createCheckout.mutate()}
                disabled={createCheckout.isPending}
                className="flex-1"
              >
                {createCheckout.isPending ? 'Redirigiendo...' : 'Pagar con Stripe'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
