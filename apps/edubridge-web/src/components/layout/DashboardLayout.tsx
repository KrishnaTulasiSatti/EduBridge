import { LogOut, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@edubridge/shared';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/avatar';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';
import { NAVIGATION } from './navigation';
import { ThemeToggle } from './ThemeToggle';

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  if (!user) return null;

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo to="/dashboard" />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pt-4 scrollbar-thin" aria-label="Main">
        {NAVIGATION[user.role].map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/dashboard'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors',
                isActive
                  ? 'bg-surface font-medium text-foreground shadow-card ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-sunken hover:text-foreground',
              )
            }
          >
            {({ isActive }) => (
              <>
                <item.icon className={cn('size-[18px]', isActive ? 'text-primary' : 'text-subtle')} />
                <span className="flex-1">{item.label}</span>
                {item.phase && <span className="text-[11px] text-subtle">Soon</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Avatar name={user.fullName} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{user.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{ROLE_LABELS[user.role]}</p>
          </div>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-1 flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-muted-foreground transition-colors hover:bg-sunken hover:text-foreground"
        >
          <LogOut className="size-[18px] text-subtle" /> Sign out
        </button>
      </div>
    </div>
  );
}

export function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <div className="min-h-dvh">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-background lg:block">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-border bg-background animate-fade-in">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-sunken"
              aria-label="Close menu"
            >
              <X className="size-5" />
            </button>
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-sunken"
            aria-label="Open menu"
          >
            <Menu className="size-5" />
          </button>
          <Logo to="/dashboard" />
          <ThemeToggle />
        </header>

        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 lg:py-12">
          <div key={location.pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
