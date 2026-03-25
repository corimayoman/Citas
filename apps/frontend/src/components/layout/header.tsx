'use client';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth.store';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';

export function Header() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <header className="bg-[#0a0a0a] border-b border-[#1f1f1f] px-6 py-3 flex items-center justify-end gap-3">
      <span className="text-sm text-[#737373]">{user?.email}</span>
      <span className="text-[11px] text-[#525252] border border-[#1f1f1f] px-2 py-0.5 rounded-full">
        {user?.role}
      </span>
      <button
        onClick={handleLogout}
        className="text-[#525252] hover:text-white transition-colors ml-1"
        aria-label="Cerrar sesión"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}
