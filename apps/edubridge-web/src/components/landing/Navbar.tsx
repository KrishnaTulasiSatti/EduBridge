import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const links = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#students', label: 'For students' },
  { href: '#sponsors', label: 'For sponsors' },
  { href: '#verification', label: 'Verification' },
  { href: '#faq', label: 'FAQ' },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b bg-background/95 backdrop-blur-sm transition-colors',
        scrolled || open ? 'border-border' : 'border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
        <Logo />
        <div className="hidden items-center gap-7 lg:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </a>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {user ? (
            <Link to="/dashboard" className={cn(buttonVariants({ size: 'sm' }), 'ml-1 hidden sm:inline-flex')}>
              Open dashboard
            </Link>
          ) : (
            <>
              <Link to="/login" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
                Sign in
              </Link>
              <Link to="/register" className={cn(buttonVariants({ size: 'sm' }), 'ml-1 hidden sm:inline-flex')}>
                Create account
              </Link>
            </>
          )}
          <button
            type="button"
            className="grid size-9 cursor-pointer place-items-center rounded-lg text-muted-foreground hover:bg-sunken lg:hidden"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div className="border-t border-border px-5 pb-5 pt-2 lg:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2.5 text-[15px] text-muted-foreground hover:text-foreground">
              {l.label}
            </a>
          ))}
          <div className="mt-3 grid grid-cols-2 gap-2">
            {user ? (
              <Link to="/dashboard" className={cn(buttonVariants(), 'col-span-2')}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'secondary' })}>
                  Sign in
                </Link>
                <Link to="/register" className={buttonVariants()}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
