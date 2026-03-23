import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

// Mock api
jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

import { api } from '@/lib/api';
import { BookingWizard } from '@/components/bookings/booking-wizard';

const mockProcedure = {
  id: 'proc-1',
  name: 'Trámite Demo',
  organization: { name: 'Organismo Demo' },
  formSchema: { fields: [] },
};

const mockProfile = {
  id: 'profile-1',
  firstName: 'Juan',
  lastName: 'Pérez',
  documentType: 'DNI',
  documentNumber: '12345678',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeAll(() => {});
afterEach(() => {
  jest.clearAllMocks();
});
afterAll(() => {});

describe('BookingWizard', () => {
  it('sin perfil creado, el botón Continuar está deshabilitado', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    await waitFor(() => {
      expect(screen.queryByText('Crear perfil')).toBeInTheDocument();
    });

    const btn = screen.getByRole('button', { name: /continuar/i });
    expect(btn).toBeDisabled();
  });

  it('con perfil, sin rango de fechas, el botón Continuar del paso 1 está deshabilitado', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    // Seleccionar perfil
    await waitFor(() => screen.getByText('Juan Pérez'));
    fireEvent.click(screen.getByText('Juan Pérez').closest('label')!);

    // Avanzar al paso 1
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // En paso 1, intentar continuar sin fechas
    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByText('Seleccioná un rango de fechas.')).toBeInTheDocument();
  });

  it('submit exitoso llama a POST /bookings con los datos correctos', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: [mockProfile] } });
    (api.post as jest.Mock).mockResolvedValue({ data: { data: { id: 'booking-1', status: 'SEARCHING' } } });

    render(<BookingWizard procedure={mockProcedure} />, { wrapper });

    // Paso 0: seleccionar perfil
    await waitFor(() => screen.getByText('Juan Pérez'));
    fireEvent.click(screen.getByText('Juan Pérez').closest('label')!);
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Paso 1: ingresar fechas
    await waitFor(() => screen.getByText('Preferencias de fecha y horario'));
    const inputs = screen.getAllByDisplayValue('');
    fireEvent.change(inputs[0], { target: { value: '2026-04-01' } });
    fireEvent.change(inputs[1], { target: { value: '2026-04-30' } });
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Paso 3 (sin campos de formulario): revisión
    await waitFor(() => screen.getByText('Revisión del expediente'));
    fireEvent.click(screen.getByRole('button', { name: /confirmar y buscar cita/i }));

    await waitFor(() => {
      expect(api.post as jest.Mock).toHaveBeenCalledWith('/bookings', expect.objectContaining({
        applicantProfileId: 'profile-1',
        procedureId: 'proc-1',
      }));
    });
  });
});
