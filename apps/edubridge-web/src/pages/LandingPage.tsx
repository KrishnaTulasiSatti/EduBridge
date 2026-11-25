import { ArrowRight, Check, FileCheck2, HandHeart, Lock, ScrollText, UserRoundCheck } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { BridgeArt } from '@/components/landing/BridgeArt';
import { Navbar } from '@/components/landing/Navbar';
import { Reveal } from '@/components/motion/Reveal';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Section({ id, className, children }: { id?: string; className?: string; children: ReactNode }) {
  return (
    <section id={id} className={cn('scroll-mt-16 px-5 py-20 sm:px-8 lg:py-28', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

function Heading({ eyebrow, title, text, className }: { eyebrow?: string; title: string; text?: string; className?: string }) {
  return (
    <Reveal className={cn('max-w-2xl', className)}>
      {eyebrow && <p className="text-sm font-medium text-primary-ink">{eyebrow}</p>}
      <h2 className="mt-2 font-display text-[34px] font-medium leading-[1.15] text-balance sm:text-[40px]">{title}</h2>
      {text && <p className="mt-4 text-[17px] leading-relaxed text-muted-foreground text-pretty">{text}</p>}
    </Reveal>
  );
}

const steps = [
  { title: 'Apply', text: 'Students fill in one structured application covering their studies, family and finances.' },
  { title: 'Submit documents', text: 'A marksheet, an income certificate, a college ID card and a fee receipt, each checked by the most reliable method available.' },
  { title: 'Volunteer review', text: 'A trained volunteer compares the documents with the application and notes anything that does not match.' },
  { title: 'Need assessment', text: 'A transparent scoring model estimates financial need and shows the factors behind the estimate.' },
  { title: 'Administrator decision', text: 'An administrator looks at everything together and decides on eligibility, recording the reason.' },
  { title: 'Sponsorship', text: 'Approved students are shown to sponsors whose preferences match. A sponsor connects with a student and they arrange the support together.' },
];

const verification = [
  {
    doc: 'Academic marksheet',
    how: 'Digitally signed record fetched from the issuing institution through EduVault, after the student gives consent.',
    who: 'Automatic signature check',
  },
  {
    doc: 'Income certificate',
    how: 'Certificate looked up on the official AP Seva portal and checked against the application.',
    who: 'Volunteer, confirmed by an administrator',
  },
  {
    doc: 'College ID card',
    how: 'Current enrolment confirmed with the institution.',
    who: 'Volunteer, confirmed by an administrator',
  },
  {
    doc: 'College fee receipt',
    how: 'Receipt amount matched with the tuition fee in the application.',
    who: 'Automatic amount check, then a volunteer',
  },
];

const principles = [
  {
    icon: UserRoundCheck,
    title: 'People make the decisions',
    text: 'The assessment model helps estimate need. Only an administrator can approve a student, and they must record why.',
  },
  {
    icon: Lock,
    title: 'Private by default',
    text: 'Sponsors see an anonymised profile. Only a sponsor who connects with a student sees their name and contact details. Documents are never shown.',
  },
  {
    icon: FileCheck2,
    title: 'Consent before sharing',
    text: 'Documents are fetched from EduVault only after the student approves the specific request.',
  },
  {
    icon: ScrollText,
    title: 'Nothing goes unrecorded',
    text: 'Applications, verifications, decisions and sponsorships are kept in a permanent audit trail.',
  },
];

const faqs = [
  {
    q: 'Does it cost anything to apply?',
    a: 'No. Applying is free, and no one at EduBridge will ever ask a student for money to process an application.',
  },
  {
    q: 'Who can apply?',
    a: 'Students enrolled in a diploma, undergraduate, postgraduate or doctoral programme who need financial support to continue their studies.',
  },

  {
    q: 'What can sponsors see about me?',
    a: 'Sponsors see your course, year, state, the kind of support you need and how much of it is still unfunded. They see your name and contact details only after they connect with you. They never see your documents.',
  },
  {
    q: 'How is financial need assessed?',
    a: 'Factors such as income per family member, the number of earning members, education costs and existing scholarships are combined into a score. The score is a recommendation; an administrator makes the decision.',
  },
  {
    q: 'As a sponsor, how do I support a student?',
    a: 'Choose an approved student and connect with them, saying how much you intend to give. You then see their name, email and phone number and arrange the support directly. EduBridge does not handle money.',
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <Navbar />
      <main>
        {/* Hero */}
        <section className="px-5 pb-16 pt-14 sm:px-8 lg:pb-24 lg:pt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div className="stagger">
              <p className="text-sm font-medium text-primary-ink">Where verified need meets willing support</p>
              <h1 className="mt-4 font-display text-[36px] font-medium leading-[1.08] text-balance min-[400px]:text-[42px] sm:text-[54px] lg:text-[60px]">
                Helping deserving students continue their education.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground text-pretty">
                EduBridge connects students facing financial hardship with people who want to help. Every application is verified,
                and every contribution is recorded.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register?role=STUDENT" className={buttonVariants({ size: 'lg' })}>
                  Apply for support
                </Link>
                <Link to="/register?role=SPONSOR" className={buttonVariants({ size: 'lg', variant: 'secondary' })}>
                  Become a sponsor
                </Link>
              </div>
              <p className="mt-5 text-sm text-subtle">Free for students.</p>
            </div>
            <div className="hidden sm:block">
              <BridgeArt className="mx-auto w-full max-w-[480px]" />
            </div>
          </div>
        </section>

        {/* Pillars */}
        <section className="border-y border-border bg-surface px-5 sm:px-8">
          <div className="mx-auto grid max-w-6xl divide-y divide-border md:grid-cols-3 md:divide-x md:divide-y-0">
            {[
              ['Checked at the source', 'Documents are verified with issuing institutions and official portals, not taken at face value.'],
              ['Decided by people', 'Volunteers review every application and an administrator makes each final decision.'],
              ['Accounted for', 'Promised support never exceeds a student’s approved need, and every connection is recorded.'],
            ].map(([t, d], i) => (
              <Reveal key={t} delay={i * 90} className="py-8 md:px-8 md:first:pl-0 md:last:pr-0">
                <p className="font-display text-xl font-medium">{t}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{d}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* How it works */}
        <Section id="how-it-works">
          <Heading
            eyebrow="How it works"
            title="From application to sponsorship, one clear path"
            text="Students can follow their application at every stage. Nothing moves forward without a person looking at it."
          />
          <ol className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {steps.map((s, i) => (
              <Reveal as="li" key={s.title} delay={(i % 3) * 90} className="group border-t border-border-strong pt-5">
                <span className="font-display text-[15px] text-subtle transition-colors duration-300 group-hover:text-primary-ink">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="mt-2 text-[17px] font-semibold">{s.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.text}</p>
              </Reveal>
            ))}
          </ol>
        </Section>

        {/* Students & sponsors */}
        <section className="px-5 pb-20 sm:px-8 lg:pb-28">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            <Reveal id="students" className="scroll-mt-20 rounded-2xl border border-border bg-surface p-6 transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-pop min-[400px]:p-8 sm:p-10">
              <p className="text-sm font-medium text-primary-ink">For students</p>
              <h3 className="mt-2 font-display text-[28px] font-medium leading-tight">Ask for help, with dignity</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                One application, reviewed fairly. You can see where it stands at any time, and your personal details are never shared
                with sponsors.
              </p>
              <p className="mt-7 text-sm font-semibold">Keep these ready</p>
              <ul className="mt-3 space-y-2.5">
                {['Your latest marksheet', 'Income certificate and its certificate number', 'College ID card and your roll number', 'Your latest college fee receipt'].map((t) => (
                  <li key={t} className="flex gap-2.5 text-[15px] text-muted-foreground">
                    <Check className="mt-1 size-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
              <Link to="/register?role=STUDENT" className={cn(buttonVariants(), 'mt-8')}>
                Start an application
              </Link>
            </Reveal>

            <Reveal id="sponsors" delay={90} className="scroll-mt-20 rounded-2xl border border-border bg-surface p-6 transition-[border-color,box-shadow] duration-300 hover:border-border-strong hover:shadow-pop min-[400px]:p-8 sm:p-10">
              <p className="text-sm font-medium text-primary-ink">For sponsors</p>
              <h3 className="mt-2 font-display text-[28px] font-medium leading-tight">Give with confidence</h3>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
                Connect with students whose documents have been verified and whose need has been reviewed, and support them
                directly.
              </p>
              <p className="mt-7 text-sm font-semibold">What you can do</p>
              <ul className="mt-3 space-y-2.5">
                {[
                  'Choose by level of study and type of support',
                  'Support a student’s full need or part of it',
                  'Contact the students you connect with directly',
                ].map((t) => (
                  <li key={t} className="flex gap-2.5 text-[15px] text-muted-foreground">
                    <Check className="mt-1 size-4 shrink-0 text-primary" /> {t}
                  </li>
                ))}
              </ul>
              <Link to="/register?role=SPONSOR" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-8')}>
                Become a sponsor
              </Link>
            </Reveal>
          </div>
          <Reveal className="mx-auto mt-6 flex max-w-6xl flex-col gap-5 rounded-2xl border border-primary/25 bg-primary-soft px-6 py-6 min-[400px]:px-8 sm:flex-row sm:items-center sm:justify-between sm:px-10">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground">
                <HandHeart className="size-5" />
              </span>
              <div>
                <p className="font-display text-[22px] font-medium leading-tight">Want to help verify applications?</p>
                <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                  Volunteers check student documents so that sponsors can give with confidence.
                </p>
              </div>
            </div>
            <Link to="/register?role=VOLUNTEER" className={cn(buttonVariants(), 'group shrink-0')}>
              Volunteer with EduBridge <ArrowRight className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </Reveal>
        </section>

        {/* Verification */}
        <Section id="verification" className="border-y border-border bg-surface">
          <Heading
            eyebrow="Verification"
            title="How documents are verified"
            text="Each document is checked using the most reliable method available for it."
          />
          <Reveal className="mt-12 overflow-hidden rounded-xl border border-border">
            <table className="w-full text-left text-[15px]">
              <thead className="hidden bg-sunken text-sm text-muted-foreground md:table-header-group">
                <tr>
                  <th className="px-6 py-3.5 font-medium">Document</th>
                  <th className="px-6 py-3.5 font-medium">How it is checked</th>
                  <th className="px-6 py-3.5 font-medium">Checked by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {verification.map((v) => (
                  <tr key={v.doc} className="block px-5 py-5 transition-colors hover:bg-sunken/60 sm:px-6 md:table-row md:p-0">
                    <td className="block font-semibold md:table-cell md:w-[22%] md:px-6 md:py-5 md:align-top">{v.doc}</td>
                    <td className="mt-1 block leading-relaxed text-muted-foreground md:table-cell md:px-6 md:py-5 md:align-top">{v.how}</td>
                    <td className="mt-2 block text-sm text-muted-foreground md:table-cell md:w-[26%] md:px-6 md:py-5 md:align-top md:text-[15px]">
                      {v.who}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Reveal>
          <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">
            Every check is recorded with who made it and when, so a decision can always be traced back to the documents behind it.
          </p>
        </Section>

        {/* Principles */}
        <Section>
          <Heading eyebrow="Our principles" title="Trust is built in, not added on" />
          <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {principles.map((p, i) => (
              <Reveal key={p.title} delay={(i % 2) * 90} className="group flex gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary-ink transition-transform duration-300 group-hover:-translate-y-0.5">
                  <p.icon className="size-5" />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold">{p.title}</h3>
                  <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{p.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>

        {/* FAQ */}
        <Section id="faq" className="pt-0 lg:pt-0">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <Heading eyebrow="Questions" title="Frequently asked questions" />
            <Reveal className="divide-y divide-border border-y border-border">
              {faqs.map((f) => (
                <details key={f.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-[16px] font-medium transition-colors hover:text-primary-ink">
                    {f.q}
                    <span className="relative size-4 shrink-0 text-muted-foreground" aria-hidden>
                      <span className="absolute left-0 top-1/2 h-px w-4 bg-current" />
                      <span className="absolute left-1/2 top-0 h-4 w-px bg-current transition-transform duration-300 group-open:rotate-90 group-open:scale-y-0" />
                    </span>
                  </summary>
                  <p className="pb-5 pr-4 text-[15px] leading-relaxed text-muted-foreground sm:pr-10">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </Section>

        {/* Closing */}
        <section className="px-5 pb-20 sm:px-8 lg:pb-28">
          <Reveal className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 rounded-2xl bg-[#2f5d50] px-6 py-10 text-[#f7f6f2] min-[400px]:px-8 sm:px-12 sm:py-12 lg:flex-row lg:items-center">
            <div>
              <h2 className="font-display text-[32px] font-medium leading-tight">Ready to begin?</h2>
              <p className="mt-2 text-[17px] text-[#f7f6f2]/75">It takes a couple of minutes to create an account.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link to="/register?role=STUDENT" className={cn(buttonVariants({ size: 'lg' }), 'bg-[#f7f6f2] text-[#234a3f] hover:bg-white')}>
                Apply for support
              </Link>
              <Link
                to="/register?role=SPONSOR"
                className={cn(buttonVariants({ size: 'lg' }), 'border border-[#f7f6f2]/35 bg-transparent text-[#f7f6f2] hover:bg-white/10')}
              >
                Become a sponsor
              </Link>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border px-5 sm:px-8">
        <div className="mx-auto grid max-w-6xl gap-10 py-14 md:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
              An educational sponsorship platform built on verification, fair assessment and transparent tracking.
            </p>
          </div>
          <div>
            <p className="text-sm font-semibold">Platform</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#how-it-works" className="hover:text-foreground">How it works</a></li>
              <li><a href="#students" className="hover:text-foreground">For students</a></li>
              <li><a href="#sponsors" className="hover:text-foreground">For sponsors</a></li>
              <li><Link to="/register?role=VOLUNTEER" className="hover:text-foreground">Volunteer</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold">Trust</p>
            <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
              <li><a href="#verification" className="hover:text-foreground">Verification</a></li>
              <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
              <li><Link to="/terms" className="hover:text-foreground">Terms and privacy</Link></li>
              <li><Link to="/login" className="hover:text-foreground">Sign in</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto max-w-6xl border-t border-border py-6 text-center text-[13px] text-subtle">
          <p>© {new Date().getFullYear()} EduBridge. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
