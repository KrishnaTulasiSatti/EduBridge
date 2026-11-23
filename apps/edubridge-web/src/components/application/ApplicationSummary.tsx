import type { ReactNode } from 'react';
import {
  EDUCATION_LEVEL_LABELS,
  EXPENSE_KEYS,
  EXPENSE_LABELS,
  GENDER_LABELS,
  SPECIAL_CIRCUMSTANCE_LABELS,
  totalExpenses,
  type ApplicationDTO,
  type StudentProfileDTO,
} from '@edubridge/shared';
import { DefinitionList } from '@/components/dashboard/widgets';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDate, type SectionId } from '@/lib/student';
import { formatINR } from '@/lib/utils';

const money = (n?: number) => (typeof n === 'number' ? formatINR(n) : undefined);

function SummaryBlock({
  title,
  incomplete,
  onEdit,
  children,
}: {
  title: string;
  incomplete?: boolean;
  onEdit?: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-t border-border py-6 first:border-t-0 first:pt-0 last:pb-0">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-[15px] font-semibold">{title}</h3>
        {onEdit && (
          <Button size="sm" variant="ghost" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      {incomplete && (
        <Alert tone="warning" className="mb-4">
          This section is incomplete.
        </Alert>
      )}
      {children}
    </section>
  );
}

export function ApplicationSummary({
  profile,
  application,
  completion,
  onEdit,
}: {
  profile: StudentProfileDTO;
  application: ApplicationDTO;
  completion?: Record<SectionId, boolean>;
  onEdit?: (section: SectionId) => void;
}) {
  const p = profile.personal;
  const e = profile.education;
  const f = application.family;
  const s = application.support;
  const total = totalExpenses(s.expenses);

  return (
    <div>
      <SummaryBlock title="Personal details" incomplete={completion && !completion.personal} onEdit={onEdit && (() => onEdit('personal'))}>
        <DefinitionList
          items={[
            ['Date of birth', p.dateOfBirth ? formatDate(p.dateOfBirth) : undefined],
            ['Gender', p.gender ? GENDER_LABELS[p.gender] : undefined],
            ['Address', p.addressLine ? [p.addressLine, p.city, p.district].filter(Boolean).join(', ') : undefined],
            ['State and PIN code', p.state ? `${p.state}${p.pincode ? ` – ${p.pincode}` : ''}` : undefined],
          ]}
        />
      </SummaryBlock>

      <SummaryBlock title="Education" incomplete={completion && !completion.education} onEdit={onEdit && (() => onEdit('education'))}>
        <DefinitionList
          items={[
            ['Institution', e.institutionName],
            ['University or board', e.university],
            ['Course', e.course ? [e.course, e.specialization].filter(Boolean).join(' · ') : undefined],
            ['Level', e.level ? EDUCATION_LEVEL_LABELS[e.level] : undefined],
            ['Year of study', e.currentYear ? `Year ${e.currentYear}${e.durationYears ? ` of ${e.durationYears}` : ''}` : undefined],
            ['Roll number', e.rollNumber],
            ['Last exam', typeof e.lastExamPercentage === 'number' ? `${e.lastExamPercentage}%` : undefined],
          ]}
        />
      </SummaryBlock>

      <SummaryBlock title="Family and income" incomplete={completion && !completion.family} onEdit={onEdit && (() => onEdit('family'))}>
        <DefinitionList
          items={[
            ['Family members', f.familyMembers],
            ['Earning members', f.earningMembers],
            ['Members studying', f.dependentsStudying],
            ['Annual family income', money(f.annualFamilyIncome)],
            ['Main earner’s occupation', f.primaryEarnerOccupation],
            ['Circumstances', f.circumstances?.length ? f.circumstances.map((c) => SPECIAL_CIRCUMSTANCE_LABELS[c]).join(', ') : 'None selected'],
          ]}
        />
        {f.circumstancesNote && <p className="mt-4 whitespace-pre-line text-[15px] text-muted-foreground">{f.circumstancesNote}</p>}
      </SummaryBlock>

      <SummaryBlock title="Support requested" incomplete={completion && !completion.support} onEdit={onEdit && (() => onEdit('support'))}>
        {s.expenses && (
          <table className="mb-5 w-full text-[15px]">
            <tbody>
              {EXPENSE_KEYS.filter((k) => (s.expenses?.[k] ?? 0) > 0).map((k) => (
                <tr key={k} className="border-b border-border">
                  <td className="py-2 text-muted-foreground">{EXPENSE_LABELS[k]}</td>
                  <td className="py-2 text-right tabular-nums">{formatINR(s.expenses![k]!)}</td>
                </tr>
              ))}
              <tr className="border-b border-border">
                <td className="py-2 font-medium">Total cost</td>
                <td className="py-2 text-right font-medium tabular-nums">{formatINR(total)}</td>
              </tr>
              {(s.existingAid ?? 0) > 0 && (
                <tr className="border-b border-border">
                  <td className="py-2 text-muted-foreground">Existing support{s.existingAidSource ? ` (${s.existingAidSource})` : ''}</td>
                  <td className="py-2 text-right tabular-nums">− {formatINR(s.existingAid!)}</td>
                </tr>
              )}
              <tr>
                <td className="pt-3 font-semibold">Amount requested</td>
                <td className="pt-3 text-right font-semibold tabular-nums">{money(s.requestedAmount) ?? '—'}</td>
              </tr>
            </tbody>
          </table>
        )}
        {s.statement ? (
          <div>
            <p className="text-[13px] text-muted-foreground">Statement</p>
            <p className="mt-1 whitespace-pre-line text-[15px] leading-relaxed">{s.statement}</p>
          </div>
        ) : (
          !s.expenses && <p className="text-[15px] text-subtle">Not provided</p>
        )}
      </SummaryBlock>
    </div>
  );
}
