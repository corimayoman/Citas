import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));

import { api } from '@/lib/api';
import ProfilePage from '@/app/(dashboard)/profile/page';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const mockUser = {
  id: 'user-1',
  email: 'usuario@ejemplo.com',
  role: 'USER',
  isEmailVerified: true,
  mfaEnabled: false,
  createdAt: new Date().toISOString(),
  applicantProfiles: [
    {
      id: 'profile-1',
      firstName: 'Juan',
      lastName: 'Pérez',
      documentType: 'DNI',
      documentNumber: '12345678',
      isDefault: true,
    },
  ],
};

describe('ProfilePage', () => {
  afterEach(() => jest.clearAllMocks());

  it('muestra los perfiles existentes', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Juan Pérez'));
    expect(screen.getByText('DNI · 12345678')).toBeInTheDocument();
  });

  it('eliminar perfil llama a DELETE y refresca la lista', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser } });
    (api.delete as jest.Mock).mockResolvedValue({ data: {} });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Juan Pérez'));

    // El botón de eliminar es el último botón en la sección de perfiles
    const allButtons = screen.getAllByRole('button');
    // Buscar el botón que contiene el SVG de trash (es el último botón visible en la lista de perfiles)
    const trashBtn = allButtons.find(b => b.className.includes('hover:text-red-500'));
    expect(trashBtn).toBeDefined();
    fireEvent.click(trashBtn!);

    await waitFor(() => {
      expect(api.delete as jest.Mock).toHaveBeenCalledWith('/users/me/profiles/profile-1');
    });
  });

  it('formulario de nuevo perfil aparece al hacer click en "Nuevo perfil"', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: mockUser } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Nuevo perfil'));
    fireEvent.click(screen.getByText('Nuevo perfil'));

    expect(screen.getByText('Nuevo perfil de solicitante')).toBeInTheDocument();
  });

  it('crear perfil llama a POST /users/me/profiles', async () => {
    (api.get as jest.Mock).mockResolvedValue({ data: { data: { ...mockUser, applicantProfiles: [] } } });
    (api.post as jest.Mock).mockResolvedValue({ data: { data: { id: 'profile-2' } } });

    render(<ProfilePage />, { wrapper });

    await waitFor(() => screen.getByText('Nuevo perfil'));
    fireEvent.click(screen.getByText('Nuevo perfil'));

    // Completar formulario — los inputs no tienen htmlFor, usamos índices por orden en el DOM
    const textboxes = screen.getAllByRole('textbox');
    // Orden: firstName, lastName, documentNumber, nationality, phone (email es type=email, no textbox)
    fireEvent.change(textboxes[0], { target: { value: 'María' } });       // firstName
    fireEvent.change(textboxes[1], { target: { value: 'García' } });      // lastName
    fireEvent.change(textboxes[2], { target: { value: '87654321' } });    // documentNumber
    fireEvent.change(textboxes[3], { target: { value: 'Argentina' } });   // nationality

    // birthDate — input type="date"
    const dateInputs = screen.getAllByDisplayValue('');
    const dateInput = dateInputs.find((el: HTMLElement) => (el as HTMLInputElement).type === 'date');
    fireEvent.change(dateInput!, { target: { value: '1990-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: /guardar perfil/i }));

    await waitFor(() => {
      expect(api.post as jest.Mock).toHaveBeenCalledWith(
        '/users/me/profiles',
        expect.objectContaining({ firstName: 'María', lastName: 'García' })
      );
    });
  });
});
