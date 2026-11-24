import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

export function AuthLayout({ children, aside }: { children: ReactNode; aside?: { title: string; text: string } }) {
  const copy = aside ?? {
    title: 'Support that is verified, fair and accountable.',
    text: 'Students apply once. Volunteers and administrators review every application, and every sponsorship is recorded.',
  };
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden flex-col justify-between bg-[#2f5d50] p-12 text-[#f7f6f2] lg:flex">
        <Logo inverted />
        <div className="max-w-sm stagger">
          <p className="font-display text-[32px] font-medium leading-[1.2]">{copy.title}</p>
          <p className="mt-5 text-[15px] leading-relaxed text-[#f7f6f2]/70">{copy.text}</p>
        </div>
        <p className="text-[13px] text-[#f7f6f2]/50">Your information is used only to process your application.</p>
      </aside>

      <main className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-5 sm:px-8">
          <div className="lg:invisible">
            <Logo />
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-5 pb-16 pt-6 sm:items-center sm:px-8 sm:pt-0">
          <div className="w-full max-w-[400px] animate-fade-up">{children}</div>
        </div>
      </main>
    </div>
  );
}
