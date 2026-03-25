/**
 * Tests — NotificationPreferences (profile/page.tsx)
 * Verifica el comportamiento post-deshabilitación de SMS (cuenta Twilio trial).
 * Ref: MOCKS.md #23
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), patch: jest.fn() },
}));

import { api } from '@/lib/api';
import ProfilePage from '@/app/(dashboard)/profile/page';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockUser(overrides = {}) {
  return {
    id: 'user-1',
    email: 'usuario@ejemplo.com',
    role: 'USER',
    isEmailVerified: true,
    mfaEnabled: false,
    createdAt: new Date().toISOString(),
    applicantProfiles: [],
    notificationChannel: 'EMAIL',
    notificationPhone: null,
    ...overrides,
  };
}

afterEach(() => jest.clearAllMocks());

describe('NotificationPreferences — SMS deshabilitado en UI', () => {
  it('muestra la opción Email disponible', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser() } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Email'));
    expect(screen.getByText('Email')).toBeInTheDocument();
  });

  it('muestra SMS como "No disponible temporalmente"', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser() } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('SMS'));
    expect(screen.getByText('No disponible temporalmente')).toBeInTheDocument();
  });

  it('el contenedor de SMS tiene cursor-not-allowed (está deshabilitado)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser() } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('No disponible temporalmente'));

    // Subir hasta el div con las clases de estilo (flex items-center gap-3 p-4 ...)
    const smsLabel = screen.getByText('No disponible temporalmente');
    const smsRow = smsLabel.closest('[class*="cursor-not-allowed"]');
    expect(smsRow).not.toBeNull();
  });

  it('usuario con canal EMAIL: no llama a PATCH al montar', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser({ notificationChannel: 'EMAIL' }) } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Email'));

    expect(api.patch as jest.Mock).not.toHaveBeenCalled();
  });

  it('usuario con canal SMS: auto-migra a EMAIL llamando a PATCH al montar', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser({ notificationChannel: 'SMS' }) } });
    (api.patch as jest.Mock).mockResolvedValue({ data: { data: mockUser({ notificationChannel: 'EMAIL' }) } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => {
      expect(api.patch as jest.Mock).toHaveBeenCalledWith(
        '/users/me',
        expect.objectContaining({ notificationChannel: 'EMAIL' })
      );
    });
  });

  it('usuario con canal SMS: muestra aviso de migración automática', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser({ notificationChannel: 'SMS' }) } });
    (api.patch as jest.Mock).mockResolvedValue({ data: { data: {} } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() =>
      screen.getByText(/Las notificaciones por SMS están temporalmente deshabilitadas/i)
    );
  });
});
