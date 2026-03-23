import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

// Mock auth store — sin sesión por defecto
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

describe('Auth guard — DashboardLayout', () => {
  afterEach(() => jest.clearAllMocks());

  it('sin sesión activa, redirige a /login y no renderiza el contenido', async () => {
    (useAuthStore as unknown as jest.Mock).mockReturnValue({ user: null });

    render(
      <DashboardLayout>
        <div data-testid="protected-content">Contenido protegido</div>
      </DashboardLayout>
    );

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/login');
    });

    expect(screen.queryByTestId('protected-content')).not.toBeInTheDocument();
  });

  it('con sesión activa, renderiza el contenido del dashboard', async () => {
    (useAuthStore as unknown as jest.Mock).mockReturnValue({
      user: { userId: 'user-1', email: 'usuario@ejemplo.com', role: 'USER' },
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
  });
});
