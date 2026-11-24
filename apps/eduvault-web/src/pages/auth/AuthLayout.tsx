import type { ReactNode } from 'react';
import { Logo, SimulationNotice } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function AuthLayout({ children, aside, wide }: { children: ReactNode; aside?: { title: string; text: string }; wide?: boolean }) {
  const copy = aside ?? {
    title: 'Academic records, signed at the source.',
    text: 'Institutions issue marksheets with a digital signature. Students keep them here and decide who may see them.',
  };
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between bg-[#2c4a6e] p-12 text-[#f6f6f3] lg:flex">
        <Logo inverted />
        <div className="max-w-sm">
          <p className="font-display text-[32px] font-medium leading-[1.2]">{copy.title}</p>
          <p className="mt-5 text-[15px] leading-relaxed text-[#f6f6f3]/70">{copy.text}</p>
        </div>
        <p className="max-w-sm text-[13px] leading-relaxed text-[#f6f6f3]/50">
          A simulated document locker built for the EduBridge project. Not affiliated with DigiLocker. All records are test data.
        </p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <div className="lg:invisible">
            <Logo />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:px-8 sm:pt-0">
          <div className={wide ? 'w-full max-w-[520px] animate-fade-up' : 'w-full max-w-[400px] animate-fade-up'}>
            {children}
            <SimulationNotice className="mt-10 lg:hidden" />
          </div>
        </div>
      </main>
    </div>
  );
}
