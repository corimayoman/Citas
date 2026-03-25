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

const inputClass = 'w-full bg-[#13131f] border border-[#1f1f35] rounded-md px-3 py-2 text-sm text-white placeholder:text-[#3a3a5c] focus:outline-none focus:ring-1 focus:ring-[#FF0A6C] focus:border-[#FF0A6C] transition-colors';

export default function LoginPage() {
  const router = useRouter();
  const { login, isLoading } = useAuthStore();
  const [error, setError] = useState('');
  const [needsMfa, setNeedsMfa] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setError('');
    try {
      await login(data.email, data.password, data.mfaToken);
      router.push('/dashboard');
    } catch (err: any) {
      const code = err?.response?.data?.error?.code;
      if (code === 'MFA_REQUIRED') { setNeedsMfa(true); return; }
      if (code === 'EMAIL_NOT_VERIFIED') {
        setError('Verificá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.');
        return;
      }
      setError(err?.response?.data?.error?.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080810] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="inline-block mb-4">
            <span className="text-2xl font-semibold text-white tracking-tight">Gestor de Citas</span>
            <span className="text-2xl font-semibold text-[#FF0A6C]">.</span>
          </div>
          <p className="text-sm text-[#6b6b8a]">Iniciá sesión en tu cuenta</p>
        </div>

        <div className="bg-[#0d0d1a] border border-[#1f1f35] rounded-lg p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-medium text-[#a3a3b8] mb-1.5">Email</label>
              <input id="email" type="email" autoComplete="email" placeholder="tu@email.com" {...register('email')} className={inputClass} />
              {errors.email && <p className="text-[#FF0A6C] text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-medium text-[#a3a3b8] mb-1.5">Contraseña</label>
              <input id="password" type="password" autoComplete="current-password" {...register('password')} className={inputClass} />
              {errors.password && <p className="text-[#FF0A6C] text-xs mt-1">{errors.password.message}</p>}
            </div>
            {needsMfa && (
              <div>
                <label htmlFor="mfaToken" className="block text-xs font-medium text-[#a3a3b8] mb-1.5">Código MFA</label>
                <input id="mfaToken" type="text" inputMode="numeric" maxLength={6} {...register('mfaToken')} className={inputClass} />
              </div>
            )}
            {error && <div className="border border-[#FF0A6C]/30 bg-[#FF0A6C]/5 rounded-md p-3 text-xs text-[#FF3D8A]">{error}</div>}
            <Button type="submit" className="w-full mt-2" disabled={isLoading}>
              {isLoading ? 'Iniciando sesión...' : 'Iniciar sesión'}
            </Button>
          </form>
        </div>

        <p className="mt-5 text-center text-sm text-[#3a3a5c]">
          ¿No tenés cuenta?{' '}
          <Link href="/register" className="text-[#FF0A6C] hover:text-[#FF3D8A] transition-colors">Registrate</Link>
        </p>
        <p className="mt-4 text-center text-[11px] text-[#1f1f35]">
          Esta aplicación actúa como intermediario y no representa a ningún organismo público.
        </p>
      </div>
    </div>
  );
}
