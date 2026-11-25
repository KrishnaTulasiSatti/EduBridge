import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { TermsContent } from '@/components/legal/TermsContent';

export default function TermsPage() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-border bg-surface px-5 sm:px-8">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between">
          <Link to="/" aria-label="EduBridge home">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-8 animate-fade-up">
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Home
        </Link>
        <h1 className="mt-6 font-display text-[36px] font-medium leading-tight">Terms and Privacy Policy</h1>
        <div className="mt-8 rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8">
          <TermsContent />
        </div>
      </main>
    </div>
  );
}
