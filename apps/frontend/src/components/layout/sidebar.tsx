'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth.store';
import { LayoutDashboard, FileText, Calendar, CreditCard, Bell, User, Settings, Shield, Activity } from 'lucide-react';

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
  { href: '/compliance',       label: 'Cumplimiento',   icon: Shield },
  { href: '/admin/connectors', label: 'Conectores',     icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'COMPLIANCE_OFFICER';

  return (
    <aside className="w-60 bg-card border-r border-border flex flex-col">
      <div className="px-5 py-6 border-b border-border">
        <span className="text-sm font-semibold tracking-tight text-foreground">Gestor de Citas</span>
        <span className="block text-xs text-muted-foreground mt-0.5">Oficiales</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
              pathname === href
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'text-muted-foreground hover:text-foreground hover:bg-input'
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}

        {isAdmin && (
          <>
            <div className="pt-5 pb-1 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-widest">Admin</div>
            {adminItems.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                  pathname.startsWith(href)
                    ? 'bg-primary/10 text-primary border border-primary/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-input'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="px-5 py-4 border-t border-border">
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Intermediario independiente.<br />No representa a organismos públicos.
        </p>
      </div>
    </aside>
  );
}
