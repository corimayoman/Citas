import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '@/lib/api';
import BookingDetailPage from '@/app/(dashboard)/bookings/[id]/page';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseBooking = {
  id: 'booking-1',
  procedure: { name: 'Trámite Demo', serviceFee: 50, currency: 'ARS', organization: { name: 'Organismo Demo' } },
  applicantProfile: { firstName: 'Juan', lastName: 'Pérez', documentType: 'DNI', documentNumber: '12345678' },
  createdAt: new Date().toISOString(),
};

describe('BookingDetailPage — estados', () => {
  afterEach(() => jest.clearAllMocks());

  it('SEARCHING: muestra spinner, no muestra botón de pago ni detalles de cita', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: { ...baseBooking, status: 'SEARCHING' } } });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByText('Buscando cita disponible'));
    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Cita confirmada')).not.toBeInTheDocument();
  });

  it('PRE_CONFIRMED: muestra botón de pago, no muestra detalles de cita', async () => {
    process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE = 'true';
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          ...baseBooking,
          status: 'PRE_CONFIRMED',
          paymentDeadline: new Date(Date.now() + 86400000).toISOString(),
        },
      },
    });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByRole('button', { name: /pagar/i }));
    expect(screen.queryByText('Cita confirmada')).not.toBeInTheDocument();
    delete process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE;
  });

  it('CONFIRMED: muestra detalles completos, no muestra botón de pago', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          ...baseBooking,
          status: 'CONFIRMED',
          appointment: {
            confirmationCode: 'DEMO-001',
            appointmentDate: new Date().toISOString(),
            appointmentTime: '10:00',
            location: 'Oficina Central',
          },
        },
      },
    });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByText('Cita confirmada'));
    expect(screen.getByText('DEMO-001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
  });

  it('COMPLETED: muestra detalles igual que CONFIRMED', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: {
        data: {
          ...baseBooking,
          status: 'COMPLETED',
          appointment: {
            confirmationCode: 'DEMO-002',
            appointmentDate: new Date().toISOString(),
            appointmentTime: '11:00',
          },
        },
      },
    });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByText('Cita confirmada'));
    expect(screen.getByText('DEMO-002')).toBeInTheDocument();
  });

  it('ERROR: muestra mensaje de error', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: { ...baseBooking, status: 'ERROR' } },
    });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByText('Error'));
  });

  it('CANCELLED: muestra estado cancelado sin acciones', async () => {
    (api.get as jest.Mock).mockResolvedValue({
      data: { data: { ...baseBooking, status: 'CANCELLED' } },
    });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByText('Cancelado'));
    expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
  });
});

describe('BookingDetailPage — invariante de pago', () => {
  it('el botón de pago aparece si y solo si el estado es PRE_CONFIRMED', async () => {
    const statuses = ['SEARCHING', 'CONFIRMED', 'COMPLETED', 'ERROR', 'CANCELLED'];

    for (const status of statuses) {
      jest.clearAllMocks();
      (api.get as jest.Mock).mockResolvedValue({
        data: { data: { ...baseBooking, status } },
      });

      const { unmount } = render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });
      await waitFor(() => expect(api.get as jest.Mock).toHaveBeenCalled());
      expect(screen.queryByRole('button', { name: /pagar/i })).not.toBeInTheDocument();
      unmount();
    }
  });
});
