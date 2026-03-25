import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

const outfit = Outfit({ subsets: ['latin'], weight: ['400', '500', '600', '700'] });

export const metadata: Metadata = {
  title: 'Gestor de Citas Oficiales',
  description: 'Asistente para la gestión de citas en organismos públicos. No representa a ningún organismo oficial.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className={outfit.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
