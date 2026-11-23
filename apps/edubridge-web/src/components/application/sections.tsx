import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useState, type FormEventHandler, type ReactNode } from 'react';
import { useForm, type DefaultValues } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import {
  EDUCATION_LEVEL_LABELS,
  EDUCATION_LEVELS,
  educationSchema,
  EXPENSE_KEYS,
  EXPENSE_LABELS,
  familySchema,
  GENDER_LABELS,
  GENDERS,
  INDIAN_STATES,
  personalSchema,
  SPECIAL_CIRCUMSTANCE_LABELS,
  SPECIAL_CIRCUMSTANCES,
  supportSchema,
  totalExpenses,
  type ApplicationDTO,
  type StudentProfileDTO,
} from '@edubridge/shared';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/input';
import { getErrorMessage } from '@/lib/api';
import { studentApi, useAutosave, type SaveState } from '@/lib/student';
import { formatINR } from '@/lib/utils';
import { FormSection } from './StepShell';

export type ShellRender = (p: {
  children: ReactNode;
  onSubmit: FormEventHandler<HTMLFormElement>;
  saveState: SaveState;
  busy: boolean;
}) => ReactNode;

const toNumber = (v: unknown) => (v === '' || v === null || v === undefined ? undefined : Number(v));

/** Shared plumbing: zod-validated form, autosave, and a submit that saves then calls onDone. */
function useSectionForm<S extends z.ZodType<Record<string, unknown>, Record<string, unknown>>>(
  schema: S,
  defaults: unknown,
  save: (values: z.input<S>) => Promise<void>,
  onDone?: () => void,
) {
  const form = useForm<z.input<S>, unknown, z.output<S>>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(schema as any) as any,
    defaultValues: (defaults ?? {}) as DefaultValues<z.input<S>>,
    mode: 'onTouched',
  });
  const autosave = useAutosave(form, save);
  const [busy, setBusy] = useState(false);
  // Invalid fields are highlighted inline and the first one receives focus.
  const onSubmit = form.handleSubmit(async (values) => {
    setBusy(true);
    try {
      await save(values as z.input<S>);
      onDone?.();
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  });
  return { form, onSubmit, saveState: autosave.state, busy };
}

const maxDob = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 14);
  return d.toISOString().slice(0, 10);
};

/* ------------------------------------------------------------ Personal */

export function PersonalSection({
  profile,
  onSaved,
  onDone,
  shell,
}: {
  profile: StudentProfileDTO;
  onSaved: (p: StudentProfileDTO) => void;
  onDone?: () => void;
  shell: ShellRender;
}) {
  const save = useCallback(async (v: unknown) => onSaved(await studentApi.saveProfile({ personal: v })), [onSaved]);
  const { form, onSubmit, saveState, busy } = useSectionForm(personalSchema, profile.personal, save, onDone);
  const { register, formState: { errors } } = form;

  return shell({
    onSubmit,
    saveState,
    busy,
    children: (
      <div className="space-y-7">
        <FormSection title="About you">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
              <Input id="dateOfBirth" type="date" max={maxDob()} min="1975-01-01" invalid={!!errors.dateOfBirth} {...register('dateOfBirth')} />
            </Field>
            <Field label="Gender" htmlFor="gender" error={errors.gender?.message}>
              <Select id="gender" invalid={!!errors.gender} {...register('gender', { setValueAs: (v) => v || undefined })}>
                <option value="">Select</option>
                {GENDERS.map((g) => (
                  <option key={g} value={g}>
                    {GENDER_LABELS[g]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </FormSection>
        <FormSection title="Home address" description="Where your family lives. This is never shown to sponsors.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="House number and street" htmlFor="addressLine" error={errors.addressLine?.message} className="sm:col-span-2">
              <Input id="addressLine" autoComplete="street-address" invalid={!!errors.addressLine} {...register('addressLine')} />
            </Field>
            <Field label="City, town or village" htmlFor="city" error={errors.city?.message}>
              <Input id="city" autoComplete="address-level2" invalid={!!errors.city} {...register('city')} />
            </Field>
            <Field label="District" htmlFor="district" error={errors.district?.message}>
              <Input id="district" invalid={!!errors.district} {...register('district')} />
            </Field>
            <Field label="State or union territory" htmlFor="state" error={errors.state?.message}>
              <Select id="state" invalid={!!errors.state} {...register('state', { setValueAs: (v) => v || undefined })}>
                <option value="">Select</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="PIN code" htmlFor="pincode" error={errors.pincode?.message}>
              <Input id="pincode" inputMode="numeric" maxLength={6} autoComplete="postal-code" invalid={!!errors.pincode} {...register('pincode')} />
            </Field>
          </div>
        </FormSection>
      </div>
    ),
  });
}

/* ----------------------------------------------------------- Education */

export function EducationSection({
  profile,
  onSaved,
  onDone,
  shell,
}: {
  profile: StudentProfileDTO;
  onSaved: (p: StudentProfileDTO) => void;
  onDone?: () => void;
  shell: ShellRender;
}) {
  const save = useCallback(async (v: unknown) => onSaved(await studentApi.saveProfile({ education: v })), [onSaved]);
  const { form, onSubmit, saveState, busy } = useSectionForm(educationSchema, profile.education, save, onDone);
  const { register, formState: { errors } } = form;
  const years = [1, 2, 3, 4, 5, 6];

  return shell({
    onSubmit,
    saveState,
    busy,
    children: (
      <div className="space-y-7">
        <FormSection title="Institution">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="College or institution" htmlFor="institutionName" error={errors.institutionName?.message} className="sm:col-span-2">
              <Input id="institutionName" invalid={!!errors.institutionName} {...register('institutionName')} />
            </Field>
            <Field label="University or board" htmlFor="university" error={errors.university?.message} className="sm:col-span-2">
              <Input id="university" invalid={!!errors.university} {...register('university')} />
            </Field>
            <Field label="Roll or registration number" htmlFor="rollNumber" error={errors.rollNumber?.message}>
              <Input id="rollNumber" invalid={!!errors.rollNumber} {...register('rollNumber')} />
            </Field>
          </div>
        </FormSection>
        <FormSection title="Course">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Level of study" htmlFor="level" error={errors.level?.message}>
              <Select id="level" invalid={!!errors.level} {...register('level', { setValueAs: (v) => v || undefined })}>
                <option value="">Select</option>
                {EDUCATION_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {EDUCATION_LEVEL_LABELS[l]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Course" htmlFor="course" error={errors.course?.message} hint="For example B.Tech, B.Sc, MBA or Diploma">
              <Input id="course" invalid={!!errors.course} {...register('course')} />
            </Field>
            <Field label="Branch or specialisation" htmlFor="specialization" optional error={errors.specialization?.message} className="sm:col-span-2">
              <Input id="specialization" {...register('specialization')} />
            </Field>
            <Field label="Current year of study" htmlFor="currentYear" error={errors.currentYear?.message}>
              <Select id="currentYear" invalid={!!errors.currentYear} {...register('currentYear', { setValueAs: toNumber })}>
                <option value="">Select</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Course duration" htmlFor="durationYears" error={errors.durationYears?.message}>
              <Select id="durationYears" invalid={!!errors.durationYears} {...register('durationYears', { setValueAs: toNumber })}>
                <option value="">Select</option>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y} {y === 1 ? 'year' : 'years'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Percentage in your last exam" htmlFor="lastExamPercentage" error={errors.lastExamPercentage?.message} hint="Convert CGPA to a percentage if needed">
              <Input id="lastExamPercentage" type="number" inputMode="decimal" step="0.01" min={0} max={100} invalid={!!errors.lastExamPercentage} {...register('lastExamPercentage', { valueAsNumber: true })} />
            </Field>
          </div>
        </FormSection>
      </div>
    ),
  });
}

/* -------------------------------------------------------------- Family */

export function FamilySection({
  application,
  onSaved,
  onDone,
  shell,
}: {
  application: ApplicationDTO;
  onSaved: (a: ApplicationDTO) => void;
  onDone?: () => void;
  shell: ShellRender;
}) {
  const save = useCallback(async (v: unknown) => onSaved(await studentApi.saveApplication({ family: v })), [onSaved]);
  const { form, onSubmit, saveState, busy } = useSectionForm(
    familySchema,
    { circumstances: [], ...application.family },
    save,
    onDone,
  );
  const { register, watch, formState: { errors } } = form;
  const income = watch('annualFamilyIncome') as number | undefined;
  const members = watch('familyMembers') as number | undefined;
  const perMember = income && members && Number.isFinite(income) && Number.isFinite(members) && members > 0 ? Math.round(income / members) : null;

  return shell({
    onSubmit,
    saveState,
    busy,
    children: (
      <div className="space-y-7">
        <FormSection title="Household" description="Include everyone who lives with you and shares the family income.">
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Family members" htmlFor="familyMembers" error={errors.familyMembers?.message} hint="Including you">
              <Input id="familyMembers" type="number" inputMode="numeric" min={1} invalid={!!errors.familyMembers} {...register('familyMembers', { valueAsNumber: true })} />
            </Field>
            <Field label="Earning members" htmlFor="earningMembers" error={errors.earningMembers?.message}>
              <Input id="earningMembers" type="number" inputMode="numeric" min={0} invalid={!!errors.earningMembers} {...register('earningMembers', { valueAsNumber: true })} />
            </Field>
            <Field label="Members currently studying" htmlFor="dependentsStudying" error={errors.dependentsStudying?.message} hint="Including you">
              <Input id="dependentsStudying" type="number" inputMode="numeric" min={1} invalid={!!errors.dependentsStudying} {...register('dependentsStudying', { valueAsNumber: true })} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Income" description="Use the figure shown on your income certificate.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Annual family income"
              htmlFor="annualFamilyIncome"
              error={errors.annualFamilyIncome?.message}
              hint={perMember !== null ? `About ${formatINR(perMember)} per family member per year` : undefined}
            >
              <Input id="annualFamilyIncome" type="number" inputMode="numeric" min={0} prefix="₹" invalid={!!errors.annualFamilyIncome} {...register('annualFamilyIncome', { valueAsNumber: true })} />
            </Field>
            <Field label="Occupation of the main earning member" htmlFor="primaryEarnerOccupation" error={errors.primaryEarnerOccupation?.message}>
              <Input id="primaryEarnerOccupation" invalid={!!errors.primaryEarnerOccupation} {...register('primaryEarnerOccupation')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Circumstances" description="Select any that apply. This helps reviewers understand your situation.">
          <div className="grid gap-3.5 sm:grid-cols-2">
            {SPECIAL_CIRCUMSTANCES.map((c) => (
              <Checkbox key={c} id={`c-${c}`} value={c} label={SPECIAL_CIRCUMSTANCE_LABELS[c]} {...register('circumstances')} />
            ))}
          </div>
          <Field label="Anything else we should know" htmlFor="circumstancesNote" optional error={errors.circumstancesNote?.message} className="mt-6">
            <Textarea id="circumstancesNote" rows={3} {...register('circumstancesNote')} />
          </Field>
        </FormSection>
      </div>
    ),
  });
}

/* ------------------------------------------------------------- Support */

export function SupportSection({
  application,
  onSaved,
  onDone,
  shell,
}: {
  application: ApplicationDTO;
  onSaved: (a: ApplicationDTO) => void;
  onDone?: () => void;
  shell: ShellRender;
}) {
  const save = useCallback(async (v: unknown) => onSaved(await studentApi.saveApplication({ support: v })), [onSaved]);
  const { form, onSubmit, saveState, busy } = useSectionForm(supportSchema, application.support, save, onDone);
  const { register, watch, formState: { errors } } = form;

  const expenses = watch('expenses') as Record<string, number> | undefined;
  const aidRaw = watch('existingAid') as number | undefined;
  const statement = (watch('statement') as string | undefined) ?? '';
  const total = totalExpenses(expenses);
  const aid = Number.isFinite(aidRaw) ? (aidRaw as number) : 0;
  const gap = Math.max(total - aid, 0);
  const expenseErrors = errors.expenses as Record<string, { message?: string }> | undefined;

  return shell({
    onSubmit,
    saveState,
    busy,
    children: (
      <div className="space-y-7">
        <FormSection title="Education costs for this academic year" description="Enter 0 for anything that does not apply.">
          <div className="grid gap-5 sm:grid-cols-2">
            {EXPENSE_KEYS.map((k) => (
              <Field key={k} label={EXPENSE_LABELS[k]} htmlFor={`exp-${k}`} error={expenseErrors?.[k]?.message}>
                <Input id={`exp-${k}`} type="number" inputMode="numeric" min={0} prefix="₹" invalid={!!expenseErrors?.[k]} {...register(`expenses.${k}` as 'expenses', { valueAsNumber: true })} />
              </Field>
            ))}
          </div>
        </FormSection>

        <FormSection title="Support you already receive" description="Scholarships, fee waivers or other aid for the same year.">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount" htmlFor="existingAid" error={errors.existingAid?.message}>
              <Input id="existingAid" type="number" inputMode="numeric" min={0} prefix="₹" invalid={!!errors.existingAid} {...register('existingAid', { valueAsNumber: true })} />
            </Field>
            <Field label="Source" htmlFor="existingAidSource" optional={aid === 0} error={errors.existingAidSource?.message} hint="For example, a state scholarship">
              <Input id="existingAidSource" invalid={!!errors.existingAidSource} {...register('existingAidSource')} />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Your request">
          <div className="mb-6 grid overflow-hidden rounded-lg border border-border text-sm sm:grid-cols-3 sm:divide-x sm:divide-border">
            {[
              ['Total cost', formatINR(total)],
              ['Existing support', `− ${formatINR(aid)}`],
              ['Remaining need', formatINR(gap)],
            ].map(([k, v], i) => (
              <div key={k} className={i === 2 ? 'bg-primary-soft/50 px-4 py-3' : 'border-b border-border px-4 py-3 sm:border-b-0'}>
                <p className="text-[13px] text-muted-foreground">{k}</p>
                <p className="mt-0.5 font-semibold tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Amount you are requesting" htmlFor="requestedAmount" error={errors.requestedAmount?.message} hint={gap > 0 ? `Up to ${formatINR(gap)}` : undefined}>
              <Input id="requestedAmount" type="number" inputMode="numeric" min={0} prefix="₹" invalid={!!errors.requestedAmount} {...register('requestedAmount', { valueAsNumber: true })} />
            </Field>
          </div>
          <Field
            label="Why do you need this support?"
            htmlFor="statement"
            error={errors.statement?.message}
            hint={`${statement.trim().length} / 2000 characters`}
            className="mt-5"
          >
            <Textarea
              id="statement"
              rows={6}
              invalid={!!errors.statement}
              placeholder="Describe your situation in your own words: your family, your studies, and how this support would help."
              {...register('statement')}
            />
          </Field>
        </FormSection>
      </div>
    ),
  });
}
