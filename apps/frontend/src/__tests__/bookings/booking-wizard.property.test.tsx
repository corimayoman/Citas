/**
 * Property tests — BookingWizard
 * Task 10.4 — Property 3: El wizard nunca avanza al siguiente paso
 * si el paso actual tiene validaciones fallidas.
 * Requirement 8.5
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}));

import { api } from '@/lib/api';
import { BookingWizard } from '@/components/bookings/booking-wizard';

const mockProfile = {
  id: 'profile-1',
  firstName: 'Ana',
  lastName: 'García',
  documentType: 'DNI',
  documentNumber: '87654321',
};

const mockProcedure = {
  id: 'proc-1',
  name: 'Trámite Demo',
  organization: { name: 'Organismo Demo' },
  formSchema: { fields: [] },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Property 3: El wizard nunca avanza si el paso actual tiene validaciones fallidas
// ---------------------------------------------------------------------------

describe('Property 3 — BookingWizard: nunca avanza con validaciones fallidas', () => {

  it('paso 0: sin perfil seleccionado, el botón Continuar está deshabilitado para cualquier cantidad de perfiles disponibles', async () => {
    // Probar con 0, 1, 2 y 5 perfiles — en todos los casos, sin seleccionar, no avanza
    const profileCounts = [0, 1, 2, 5];

    for (const count of profileCounts) {
      jest.clearAllMocks();
      const profiles = Array.from({ length: count }, (_, i) => ({
        ...mockProfile,
        id: `profile-${i}`,
        firstName: `User${i}`,
      }));

      (api.get as jest.Mock).mockResolvedValue({ data: { data: profiles } });

      const { unmount } = render(<BookingWizard procedure={mockProcedure} />, { wrapper });

      await waitFor(() => expect(api.get as jest.Mock).toHaveBeenCalled());

      const btn = screen.getByRole('button', { name: /continuar/i });
      // Sin seleccionar perfil, siempre deshabilitado
      expect(btn).toBeDisabled();

      unmount();
    }
  });

  it('paso 1: sin fecha "desde", el wizard muestra error y no avanza al paso 2', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    // Paso 0: seleccionar perfil y avanzar
    await waitFor(() => screen.getByText('Ana García'));
    fireEvent.click(screen.getByText('Ana García').closest('label')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Paso 1: intentar continuar sin ninguna fecha
    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Debe mostrar error y seguir en paso 1
    expect(screen.getByText('Seleccioná un rango de fechas.')).toBeInTheDocument();
    expect(screen.getByText('Preferencias de fecha y horario')).toBeInTheDocument();
  });

  it('paso 1: con solo fecha "desde" pero sin fecha "hasta", el wizard muestra error y no avanza', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    await waitFor(() => screen.getByText('Ana García'));
    fireEvent.click(screen.getByText('Ana García').closest('label')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));

    // Solo poner fecha "desde"
    const inputs = screen.getAllByDisplayValue('');
    fireEvent.change(inputs[0], { target: { value: '2026-05-01' } });
    // "hasta" queda vacío

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByText('Seleccioná un rango de fechas.')).toBeInTheDocument();
    expect(screen.getByText('Preferencias de fecha y horario')).toBeInTheDocument();
  });

  it('paso 1: con ambas fechas completas, avanza al paso siguiente (revisión o datos)', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    await waitFor(() => screen.getByText('Ana García'));
    fireEvent.click(screen.getByText('Ana García').closest('label')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));

    const inputs = screen.getAllByDisplayValue('');
    fireEvent.change(inputs[0], { target: { value: '2026-05-01' } });
    fireEvent.change(inputs[1], { target: { value: '2026-05-31' } });

    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Sin campos de formulario, salta directo a revisión
    await waitFor(() => screen.getByText('Revisión del expediente'));
    expect(screen.queryByText('Seleccioná un rango de fechas.')).not.toBeInTheDocument();
  });

  it('el indicador de paso nunca retrocede al avanzar hacia adelante', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    // Paso 0
    await waitFor(() => screen.getByText('Ana García'));
    expect(screen.getByText('Solicitante')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Ana García').closest('label')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Paso 1
    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));
    expect(screen.getByText('Preferencias')).toBeInTheDocument();

    const inputs = screen.getAllByDisplayValue('');
    fireEvent.change(inputs[0], { target: { value: '2026-05-01' } });
    fireEvent.change(inputs[1], { target: { value: '2026-05-31' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Paso 3 (revisión)
    await waitFor(() => screen.getByText('Revisión del expediente'));
    expect(screen.getByText('Revisión')).toBeInTheDocument();
  });
});
