import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  EDUCATION_LEVELS,
  EDUCATION_LEVEL_LABELS,
  EXPENSE_KEYS,
  EXPENSE_LABELS,
  INDIAN_STATES,
  SPECIAL_CIRCUMSTANCES,
  SPECIAL_CIRCUMSTANCE_LABELS,
  sponsorPreferencesSchema,
  type SponsorPreferences,
} from '@edubridge/shared';
import { DefinitionList, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Checkbox, Field, Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage, getFieldErrors } from '@/lib/api';
import { sponsorApi, useLoad } from '@/lib/sponsorship';
import { cn, formatINR } from '@/lib/utils';

function Toggle<T extends string>({ options, labels, value, onChange }: { options: readonly T[]; labels: Record<T, string>; value: T[]; onChange: (v: T[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o);
        return (
          <button
            key={o}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
            className={cn(
              'cursor-pointer rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors',
              on ? 'border-primary bg-primary-soft text-primary-ink' : 'border-border-strong text-muted-foreground hover:border-subtle hover:text-foreground',
            )}
          >
            {labels[o]}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-4 border-b border-border px-5 py-6 last:border-0 sm:px-6 md:grid-cols-[240px_1fr] md:gap-8">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

const STATE_LABELS = Object.fromEntries(INDIAN_STATES.map((s) => [s, s])) as Record<(typeof INDIAN_STATES)[number], string>;

export default function PreferencesPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: profile, loading, error, setData } = useLoad(() => sponsorApi.preferences());
  const [form, setForm] = useState<SponsorPreferences & { budgetText: string }>({
    displayName: user!.fullName,
    budget: 0,
    budgetText: '',
    levels: [],
    categories: [],
    states: [],
    circumstances: [],
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [showStates, setShowStates] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({ ...profile, budgetText: profile.budget.toLocaleString('en-IN') });
      if (profile.states.length) setShowStates(true);
    }
  }, [profile]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k === 'budgetText' ? 'budget' : k]: '' }));
  };

  const save = async () => {
    const { budgetText, ...rest } = form;
    const body = { ...rest, budget: budgetText.trim() ? Number(budgetText.replace(/,/g, '')) : Number.NaN };
    const parsed = sponsorPreferencesSchema.safeParse(body);
    if (!parsed.success) {
      const fe: Record<string, string> = {};
      for (const i of parsed.error.issues) fe[String(i.path[0])] ??= i.message;
      setErrors(fe);
      return;
    }
    setBusy(true);
    try {
      const first = !profile;
      const saved = await sponsorApi.savePreferences(parsed.data);
      setData(saved);
      toast.success('Preferences saved');
      if (first) navigate('/dashboard/discover');
    } catch (e) {
      const f = getFieldErrors(e);
      if (f) setErrors(Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v[0]])));
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (loading && !profile) return <Skeleton className="h-96" />;

  return (
    <>
      <PageHeader
        title="Preferences"
        description="Your budget and the students you would most like to support. Students are ranked for you using these; you can still support anyone shown."
      />
      {!profile && (
        <Alert tone="info" className="mb-6" title="Set your preferences to start">
          Once you save a budget, you will see approved students ranked by how well they match.
        </Alert>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_300px]">
        <Card>
          <Section title="Budget" description="The total you would like to give this academic year. The amounts you promise when connecting with students are counted against it.">
            <Field label="Total budget" htmlFor="budget" error={errors.budget} hint={profile ? `${formatINR(profile.committed)} already committed` : undefined}>
              <Input
                id="budget"
                prefix="₹"
                inputMode="numeric"
                value={form.budgetText}
                invalid={!!errors.budget}
                onChange={(e) => set('budgetText', e.target.value.replace(/[^\d,]/g, ''))}
                className="max-w-60"
              />
            </Field>
          </Section>

          <Section title="Level of study" description="Leave all unselected to consider every level.">
            <Toggle options={EDUCATION_LEVELS} labels={EDUCATION_LEVEL_LABELS} value={form.levels} onChange={(v) => set('levels', v)} />
          </Section>

          <Section title="Type of support" description="Costs you would prefer your money to go towards. Students whose costs are mostly in these rank higher.">
            <Toggle options={EXPENSE_KEYS} labels={EXPENSE_LABELS} value={form.categories} onChange={(v) => set('categories', v)} />
          </Section>

          <Section title="Circumstances" description="Optionally prioritise students facing particular circumstances.">
            <Toggle options={SPECIAL_CIRCUMSTANCES} labels={SPECIAL_CIRCUMSTANCE_LABELS} value={form.circumstances} onChange={(v) => set('circumstances', v)} />
          </Section>

          <Section title="States" description="Optionally prefer students studying in particular states.">
            {!showStates ? (
              <Button variant="secondary" size="sm" onClick={() => setShowStates(true)}>
                Choose states
              </Button>
            ) : (
              <>
                <div className="max-h-64 overflow-y-auto rounded-lg border border-border p-3">
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {INDIAN_STATES.map((s) => (
                      <Checkbox
                        key={s}
                        id={`st-${s}`}
                        label={STATE_LABELS[s]}
                        checked={form.states.includes(s)}
                        onChange={(e) => set('states', e.target.checked ? [...form.states, s] : form.states.filter((x) => x !== s))}
                      />
                    ))}
                  </div>
                </div>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  {form.states.length ? `${form.states.length} selected` : 'None selected: every state is considered.'}
                  {form.states.length > 0 && (
                    <button type="button" className="ml-2 cursor-pointer text-primary-ink hover:underline" onClick={() => set('states', [])}>
                      Clear
                    </button>
                  )}
                </p>
              </>
            )}
          </Section>

          <Section title="Your name" description="Shown to the students you connect with, together with your email and phone number.">
            <div className="space-y-4">
              <Field label="Name to show" htmlFor="displayName" error={errors.displayName} hint="An organisation name is fine.">
                <Input id="displayName" value={form.displayName} invalid={!!errors.displayName} onChange={(e) => set('displayName', e.target.value)} className="max-w-80" />
              </Field>
            </div>
          </Section>

          <div className="flex justify-end border-t border-border px-5 py-4 sm:px-6">
            <Button onClick={save} loading={busy}>
              {profile ? 'Save preferences' : 'Save and find students'}
            </Button>
          </div>
        </Card>

        {profile && (
          <Card>
            <CardHeader title="Your budget" />
            <CardBody>
              <DefinitionList
                className="sm:grid-cols-1"
                items={[
                  ['Total', formatINR(profile.budget)],
                  ['Promised', formatINR(profile.committed)],
                  ['Available', <span className="font-medium">{formatINR(profile.available)}</span>],
                ]}
              />
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}
