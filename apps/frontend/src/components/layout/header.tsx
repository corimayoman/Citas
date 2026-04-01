'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { roleLabels } from '@/lib/translations';
import { LogOut } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-background border-b border-border px-6 py-3 flex items-center justify-end gap-3">
      <span className="text-sm text-muted-foreground">{user?.email}</span>
      <span className="text-[11px] text-muted-foreground border border-border px-2 py-0.5 rounded-full">{roleLabels[user?.role ?? ''] ?? user?.role}</span>
      <button onClick={handleLogout} className="text-muted-foreground hover:text-primary transition-colors ml-1" aria-label="Cerrar sesión">
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}
