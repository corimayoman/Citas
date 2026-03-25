'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { LayoutDashboard, FileText, Calendar, CreditCard, Bell, User, Settings, Shield } from 'lucide-react';

const navItems = [
  { href: '/dashboard',     label: 'Inicio',         icon: LayoutDashboard },
  { href: '/procedures',    label: 'Trámites',        icon: FileText },
  { href: '/bookings',      label: 'Mis citas',       icon: Calendar },
  { href: '/payments',      label: 'Pagos',           icon: CreditCard },
  { href: '/notifications', label: 'Notificaciones',  icon: Bell },
  { href: '/profile',       label: 'Mi perfil',       icon: User },
];

const adminItems = [
  { href: '/admin',            label: 'Administración', icon: Settings },
  { href: '/admin/compliance', label: 'Compliance',     icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'COMPLIANCE_OFFICER';

  return (
    <aside className="w-60 bg-[#0d0d1a] border-r border-[#1f1f35] flex flex-col">
      <div className="px-5 py-6 border-b border-[#1f1f35]">
        <span className="text-sm font-semibold tracking-tight text-white">Gestor de Citas</span>
        <span className="block text-xs text-[#6b6b8a] mt-0.5">Oficiales</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href
                ? 'bg-[#FF0A6C]/10 text-[#FF0A6C] border border-[#FF0A6C]/20'
                : 'text-[#6b6b8a] hover:text-white hover:bg-[#13131f]'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-5 pb-1 px-3 text-[10px] font-medium text-[#3a3a5c] uppercase tracking-widest">Admin</div>
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-[#FF0A6C]/10 text-[#FF0A6C] border border-[#FF0A6C]/20'
                    : 'text-[#6b6b8a] hover:text-white hover:bg-[#13131f]'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="px-5 py-4 border-t border-[#1f1f35]">
        <p className="text-[11px] text-[#3a3a5c] leading-relaxed">
          Intermediario independiente.<br />No representa a organismos públicos.
        </p>
      </div>
    </aside>
  );
}
