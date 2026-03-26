'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres').regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Debe incluir mayúsculas, minúsculas y números'),
  confirmPassword: z.string(),
  consent: z.boolean().refine(v => v, 'Debés aceptar los términos'),
}).refine(d => d.password === d.confirmPassword, { message: 'Las contraseñas no coinciden', path: ['confirmPassword'] });

type FormData = z.infer<typeof schema>;

const inputClass = 'w-full bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring focus:border-primary transition-colors';

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await api.post('/auth/register', { email: data.email, password: data.password, consentVersion: '1.0' });
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || 'Error al registrarse');
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="bg-card border border-border rounded-lg p-8 text-center max-w-sm w-full">
          <div className="text-primary text-3xl mb-3">✓</div>
          <h2 className="text-base font-semibold text-foreground">Cuenta creada</h2>
          <p className="text-muted-foreground text-sm mt-1">Revisá tu email para verificar tu cuenta.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-block mb-4">
            <span className="text-2xl font-semibold text-foreground tracking-tight">Gestor de Citas</span>
            <span className="text-2xl font-semibold text-primary">.</span>
          </div>
          <p className="text-sm text-muted-foreground">Crear cuenta</p>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-muted-foreground mb-1.5">Email</label>
              <input id="email" type="email" placeholder="tu@email.com" {...register('email')} className={inputClass} />
              {errors.email && <p className="text-primary text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-muted-foreground mb-1.5">Contraseña</label>
              <input id="password" type="password" {...register('password')} className={inputClass} />
              {errors.password && <p className="text-primary text-xs mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-xs font-medium text-muted-foreground mb-1.5">Confirmar contraseña</label>
              <input id="confirmPassword" type="password" {...register('confirmPassword')} className={inputClass} />
              {errors.confirmPassword && <p className="text-primary text-xs mt-1">{errors.confirmPassword.message}</p>}
            </div>
            <div className="flex items-start gap-2.5 pt-1">
              <input id="consent" type="checkbox" {...register('consent')} className="mt-0.5 accent-primary" />
              <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed">
                Acepto el tratamiento de mis datos conforme a la{' '}
                <Link href="/privacy" className="text-primary hover:text-primary-light">política de privacidad</Link>{' '}
                y los{' '}
                <Link href="/terms" className="text-primary hover:text-primary-light">términos de uso</Link>.
                Entiendo que esta aplicación actúa como intermediario.
              </label>
            </div>
            {errors.consent && <p className="text-primary text-xs">{errors.consent.message}</p>}
            {error && <div className="border border-primary/30 bg-primary/5 rounded-md p-3 text-xs text-primary-light">{error}</div>}
            <Button type="submit" className="w-full mt-2" disabled={isSubmitting}>
              {isSubmitting ? 'Creando cuenta...' : 'Crear cuenta'}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-primary hover:text-primary-light transition-colors">Iniciá sesión</Link>
        </p>
      </div>
    </div>
  );
}
