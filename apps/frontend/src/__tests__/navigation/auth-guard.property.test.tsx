/**
 * Property tests — Auth Guard (DashboardLayout)
 * Task 10.10 — Property 5: Ninguna ruta del dashboard es accesible sin sesión activa
 * Requirement 8.9
 *
 * Verifica que el guard se comporta correctamente para cualquier combinación
 * de estado de sesión (null, undefined, objeto parcial) y cualquier contenido
 * que se intente renderizar dentro del layout protegido.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('@/store/auth.store', () => ({
  useAuthStore: jest.fn(),
}));

jest.mock('@/components/layout/sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

jest.mock('@/components/layout/header', () => ({
  Header: () => <div data-testid="header" />,
}));

import { useAuthStore } from '@/store/auth.store';
import DashboardLayout from '@/app/(dashboard)/layout';

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Property 5: Sin sesión activa, el contenido protegido NUNCA es accesible
// ---------------------------------------------------------------------------

describe('Property 5 — Auth guard: sin sesión, el contenido nunca es accesible', () => {

  // Distintas formas de "no tener sesión"
  const unauthenticatedStates = [
    { label: 'user: null', state: { user: null } },
    { label: 'user: undefined', state: { user: undefined } },
    { label: 'store vacío {}', state: {} },
  ];

  it.each(unauthenticatedStates)(
    '$label → redirige a /login y no renderiza contenido protegido',
    async ({ state }) => {
      (useAuthStore as unknown as jest.Mock).mockReturnValue(state);

      render(
        <DashboardLayout>
          <div data-testid="protected-content">Contenido protegido</div>
        </DashboardLayout>
      );

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });

      expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
    }
  );

  // Distintos contenidos protegidos — ninguno debe ser accesible sin sesión
  const protectedContents = [
    <div key="1" data-testid="page-bookings">Mis citas</div>,
    <div key="2" data-testid="page-profile">Mi perfil</div>,
    <div key="3" data-testid="page-payments">Pagos</div>,
    <div key="4" data-testid="page-admin">Panel admin</div>,
  ];

  it.each(protectedContents)(
    'contenido "%s" no es accesible sin sesión',
    async (content) => {
      jest.clearAllMocks();
      (useAuthStore as unknown as jest.Mock).mockReturnValue({ user: null });

      const { unmount } = render(
        <DashboardLayout>{content}</DashboardLayout>
      );

      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/login'));

      // El contenido específico de la página no debe estar en el DOM
      const testId = (content as React.ReactElement).props['data-testid'];
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();

      unmount();
    }
  );

  // ---------------------------------------------------------------------------
  // Contraparte: con sesión activa, el contenido SÍ es accesible
  // ---------------------------------------------------------------------------

  const authenticatedRoles = ['USER', 'OPERATOR', 'ADMIN', 'COMPLIANCE_OFFICER'] as const;

  it.each(authenticatedRoles)(
    'rol %s con sesión activa → renderiza el contenido protegido',
    async (role) => {
      jest.clearAllMocks();
      (useAuthStore as unknown as jest.Mock).mockReturnValue({
        user: { userId: `user-${role}`, email: `${role.toLowerCase()}@example.com`, role },
      });

      render(
        <DashboardLayout>
          <div data-testid="protected-content">Contenido protegido</div>
        </DashboardLayout>
      );

      await waitFor(() => {
        expect(screen.getByTestId('protected-content')).toBeInTheDocument();
      });

      expect(mockPush).not.toHaveBeenCalledWith('/login');
    }
  );
});
