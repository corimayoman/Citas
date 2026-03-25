'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { LogOut } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-[#080810] border-b border-[#1f1f35] px-6 py-3 flex items-center justify-end gap-3">
      <span className="text-sm text-[#6b6b8a]">{user?.email}</span>
      <span className="text-[11px] text-[#3a3a5c] border border-[#1f1f35] px-2 py-0.5 rounded-full">{user?.role}</span>
      <button onClick={handleLogout} className="text-[#3a3a5c] hover:text-[#FF0A6C] transition-colors ml-1" aria-label="Cerrar sesión">
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}
