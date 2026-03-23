import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

const preConfirmedBooking = {
  id: 'booking-1',
  status: 'PRE_CONFIRMED',
  procedure: { name: 'Trámite Demo', serviceFee: 50, currency: 'ARS', organization: { name: 'Organismo Demo' } },
  applicantProfile: { firstName: 'Juan', lastName: 'Pérez', documentType: 'DNI', documentNumber: '12345678' },
  createdAt: new Date().toISOString(),
  paymentDeadline: new Date(Date.now() + 86400000).toISOString(),
};

describe('Payment flow — demo mode', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE = 'true';
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_STRIPE_DEMO_MODE;
  });

  it('botón "Pagar (Demo)" llama a POST /payments/demo-checkout', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: preConfirmedBooking } });
    (api.post as jest.Mock).mockResolvedValue({ data: { data: { demo: true, paymentId: 'payment-1' } } });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByRole('button', { name: /pagar/i }));
    fireEvent.click(screen.getByRole('button', { name: /pagar/i }));

    await waitFor(() => {
      expect(api.post as jest.Mock).toHaveBeenCalledWith(
        '/payments/demo-checkout',
        { bookingRequestId: 'booking-1' }
      );
    });
  });

  it('tras pago exitoso en demo, el booking se refresca (invalidateQueries)', async () => {
    let callCount = 0;
    (api.get as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve({ data: { data: preConfirmedBooking } });
      return Promise.resolve({
        data: {
          data: {
            ...preConfirmedBooking,
            status: 'CONFIRMED',
            appointment: {
              confirmationCode: 'DEMO-001',
              appointmentDate: new Date().toISOString(),
              appointmentTime: '10:00',
            },
          },
        },
      });
    });
    (api.post as jest.Mock).mockResolvedValue({ data: { data: { demo: true, paymentId: 'payment-1' } } });

    render(<BookingDetailPage params={{ id: 'booking-1' }} />, { wrapper });

    await waitFor(() => screen.getByRole('button', { name: /pagar/i }));
    fireEvent.click(screen.getByRole('button', { name: /pagar/i }));

    await waitFor(() => {
      expect(api.get as jest.Mock).toHaveBeenCalledTimes(2);
    });
  });
});
