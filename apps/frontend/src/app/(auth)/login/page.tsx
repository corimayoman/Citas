'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

const schema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
  mfaToken: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [error, setError] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await login(data.email, data.password, data.mfaToken);
      router.push('/dashboard');
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'MFA_REQUIRED') { setNeedsMfa(true); return; }
      if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Debés verificar tu email antes de iniciar sesión. Revisá tu bandeja de entrada.');
        return;
      }
      setError(err?.response?.data?.error?.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted px-4">
      <div className="w-full max-w-md bg-white rounded-lg shadow-sm border p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-foreground">Gestor de Citas Oficiales</h1>
          <p className="text-sm text-muted-foreground mt-1">Inicia sesión en tu cuenta</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              {...register('email')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.email && <p className="text-destructive text-xs mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">Contraseña</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              {...register('password')}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {errors.password && <p className="text-destructive text-xs mt-1">{errors.password.message}</p>}
          </div>

          {needsMfa && (
            <div>
              <label htmlFor="mfaToken" className="block text-sm font-medium mb-1">Código de verificación (MFA)</label>
              <input
                id="mfaToken"
                type="text"
                inputMode="numeric"
                maxLength={6}
                {...register('mfaToken')}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
          </Button>
        </form>

        <div className="mt-6 text-center text-sm text-muted-foreground space-y-2">
          <p>
            ¿No tienes cuenta?{' '}
            <Link href="/register" className="text-primary hover:underline">Regístrate</Link>
          </p>
          <p className="text-xs border-t pt-4 mt-4">
            Esta aplicación actúa como asistente/intermediario y no representa a ningún organismo público.
          </p>
        </div>
      </div>
    </div>
  );
}
