import { Building2, KeyRound, ShieldCheck, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo, SimulationNotice } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { buttonVariants } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { cn } from '@/lib/utils';

const steps = [
  {
    icon: Building2,
    title: 'Institutions issue',
    text: 'A registered college enters a student’s marks and issues the marksheet. EduVault signs it with the college’s private key.',
  },
  {
    icon: UserRound,
    title: 'Students hold',
    text: 'Students activate their account with a code from their college and see every marksheet issued to them.',
  },
  {
    icon: KeyRound,
    title: 'Shared only with consent',
    text: 'When a service such as EduBridge asks for a marksheet, the student sees why and decides. Each approval works once.',
  },
  {
    icon: ShieldCheck,
    title: 'Anyone can verify',
    text: 'The receiving service checks the signature with the college’s public key, so an altered marksheet is detected.',
  },
];

export default function LandingPage() {
  const { user } = useAuth();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {user ? (
              <Link to="/dashboard" className={buttonVariants({ size: 'sm' })}>
                Open EduVault
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
                  Sign in
                </Link>
                <Link to="/register" className={buttonVariants({ size: 'sm' })}>
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        <section className="max-w-3xl py-20 sm:py-28">
          <p className="text-sm font-medium text-primary-ink">Academic document locker</p>
          <h1 className="mt-4 font-display text-[40px] font-medium leading-[1.12] sm:text-[52px]">
            Marksheets issued by your college, shared only when you say so.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            EduVault keeps academic records that institutions have digitally signed. Students can share a marksheet with a service like
            EduBridge in a few clicks, and the service can confirm it is genuine without anyone checking it by hand.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link to="/register" className={buttonVariants({ size: 'lg' })}>
              Activate student account
            </Link>
            <Link to="/register" state={{ kind: 'institution' }} className={buttonVariants({ variant: 'secondary', size: 'lg' })}>
              Register an institution
            </Link>
          </div>
        </section>

        <section className="border-t border-border py-16">
          <h2 className="font-display text-[28px] font-medium">How it works</h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title}>
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-primary-soft text-primary-ink">
                    <s.icon className="size-[18px]" />
                  </span>
                  <span className="text-[13px] text-subtle">Step {i + 1}</span>
                </div>
                <p className="mt-4 font-medium">{s.title}</p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 border-t border-border py-16 md:grid-cols-2">
          <div>
            <h2 className="font-display text-[24px] font-medium">What a signature proves</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              A valid signature shows that the marksheet was issued by a registered institution and that not a single mark has changed
              since. It does not, by itself, prove that the marks the institution entered were correct.
            </p>
          </div>
          <div>
            <h2 className="font-display text-[24px] font-medium">Who can issue</h2>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              Only institutions approved by an EduVault administrator receive a signing key. Their public keys are listed in an open
              registry so that any service can check a signature.
            </p>
          </div>
        </section>
      </main>

      <footer className={cn('border-t border-border')}>
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo />
          <SimulationNotice className="max-w-xl sm:text-right" />
        </div>
      </footer>
    </div>
  );
}
