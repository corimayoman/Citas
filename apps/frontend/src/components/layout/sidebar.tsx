'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import {
  LayoutDashboard, FileText, Calendar, CreditCard,
  Bell, User, Settings, Shield
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  { href: '/procedures', label: 'Trámites', icon: FileText },
  { href: '/bookings', label: 'Mis citas', icon: Calendar },
  { href: '/payments', label: 'Pagos', icon: CreditCard },
  { href: '/notifications', label: 'Notificaciones', icon: Bell },
  { href: '/profile', label: 'Mi perfil', icon: User },
];

const adminItems = [
  { href: '/admin', label: 'Administración', icon: Settings },
  { href: '/admin/compliance', label: 'Compliance', icon: Shield },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'COMPLIANCE_OFFICER';

  return (
    <aside className="w-64 bg-white border-r flex flex-col">
      <div className="p-6 border-b">
        <h1 className="font-semibold text-sm text-foreground leading-tight">
          Gestor de Citas<br />
          <span className="text-muted-foreground font-normal">Oficiales</span>
        </h1>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-4 pb-1 px-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Admin
            </div>
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t">
        <p className="text-xs text-muted-foreground">
          Intermediario independiente. No representa a organismos públicos.
        </p>
      </div>
    </aside>
  );
}
