'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      setStatus('error');
      setMessage('Token de verificación no encontrado.');
      return;
    }

    api.get(`/auth/verify-email?token=${token}`)
      .then(() => {
        setStatus('success');
        setTimeout(() => router.push('/login'), 3000);
      })
      .catch((err: any) => {
        setStatus('error');
        setMessage(err?.response?.data?.error?.message || 'El enlace es inválido o ya expiró.');
      });
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl border p-8 max-w-md w-full text-center space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
            <p className="text-gray-600">Verificando tu email...</p>
          </>
        )}
        {status === 'success' && (
          <>
            <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Email verificado</h1>
            <p className="text-gray-500 text-sm">Tu cuenta está activa. Redirigiendo al login...</p>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-10 w-10 text-red-500 mx-auto" />
            <h1 className="text-xl font-semibold text-gray-900">Error de verificación</h1>
            <p className="text-gray-500 text-sm">{message}</p>
            <a href="/login" className="inline-block mt-2 text-sm text-blue-600 hover:underline">
              Ir al login
            </a>
          </>
        )}
      </div>
    </div>
  );
}


export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Cargando...</p>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}
