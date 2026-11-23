import { useState } from 'react';
import { toast } from 'sonner';
import {
  ML_MIN_PER_CLASS,
  ML_MIN_SAMPLES,
  NEED_FEATURE_LABELS,
  NEED_LEVEL_LABELS,
  type ModelReportDTO,
} from '@edubridge/shared';
import { DefinitionList, PageHeader, Skeleton } from '@/components/dashboard/widgets';
import { ConfusionMatrix, MeterRow } from '@/components/review/charts';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { getErrorMessage } from '@/lib/api';
import { pct, reviewApi, useModelStatus } from '@/lib/review';
import { formatDate } from '@/lib/student';
import { cn } from '@/lib/utils';

const num = (v: number) => v.toFixed(2);

function Comparison({ report }: { report: ModelReportDTO }) {
  return (
    <Card>
      <CardHeader title="Model comparison" description="Stratified 5-fold cross-validation. The model with the best macro F1 is used." />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
              <th className="px-5 py-3 font-medium">Algorithm</th>
              <th className="px-5 py-3 text-right font-medium">Accuracy</th>
              <th className="px-5 py-3 text-right font-medium">Precision</th>
              <th className="px-5 py-3 text-right font-medium">Recall</th>
              <th className="px-5 py-3 text-right font-medium">F1 (macro)</th>
            </tr>
          </thead>
          <tbody>
            {report.candidates.map((c) => (
              <tr key={c.algorithm} className={cn('border-b border-border last:border-0', c.algorithm === report.chosen && 'bg-sunken/50')}>
                <td className="px-5 py-3">
                  {c.algorithm}
                  {c.algorithm === report.chosen && (
                    <Badge tone="primary" className="ml-2">
                      In use
                    </Badge>
                  )}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">{num(c.accuracy)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{num(c.macroPrecision)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{num(c.macroRecall)}</td>
                <td className={cn('px-5 py-3 text-right tabular-nums', c.algorithm === report.chosen && 'font-semibold')}>{num(c.macroF1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ChosenModel({ report }: { report: ModelReportDTO }) {
  const chosen = report.candidates.find((c) => c.algorithm === report.chosen)!;
  return (
    <Card>
      <CardHeader title={`${report.chosen}: results per need level`} description="Rows are the levels confirmed by admins (or the synthetic labels); columns are the model’s predictions." />
      <CardBody className="grid gap-8 lg:grid-cols-[auto_minmax(0,1fr)]">
        <ConfusionMatrix labels={report.labels} matrix={chosen.confusionMatrix} />
        <table className="w-full self-start text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Level</th>
              <th className="py-2 pr-3 text-right font-medium">Precision</th>
              <th className="py-2 pr-3 text-right font-medium">Recall</th>
              <th className="py-2 pr-3 text-right font-medium">F1</th>
              <th className="py-2 text-right font-medium">Samples</th>
            </tr>
          </thead>
          <tbody>
            {report.labels.map((l) => {
              const m = chosen.perClass[l];
              if (!m) return null;
              return (
                <tr key={l} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{NEED_LEVEL_LABELS[l]}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(m.precision)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(m.recall)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{num(m.f1)}</td>
                  <td className="py-2 text-right tabular-nums">{m.support}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}

function Importance({ report }: { report: ModelReportDTO }) {
  const top = report.featureImportance.slice(0, 8);
  const max = Math.max(...top.map((f) => f.importance), 0.0001);
  return (
    <Card>
      <CardHeader title="What the model relies on" description="Share of the model’s importance per input. Only financial and family details are inputs." />
      <CardBody className="space-y-4">
        {top.map((f) => (
          <MeterRow key={f.feature} label={NEED_FEATURE_LABELS[f.feature] ?? f.feature} value={f.importance} max={max} valueText={pct(f.importance, 1)} />
        ))}
      </CardBody>
    </Card>
  );
}

function Fairness({ report }: { report: ModelReportDTO }) {
  return (
    <Card>
      <CardHeader title="Fairness check" description={`Results by ${report.fairness.attribute}, from cross-validation.`} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[13px] text-muted-foreground">
              <th className="px-5 py-3 font-medium">Group</th>
              <th className="px-5 py-3 text-right font-medium">Applications</th>
              <th className="px-5 py-3 text-right font-medium">Actually high need</th>
              <th className="px-5 py-3 text-right font-medium">Predicted high need</th>
              <th className="px-5 py-3 text-right font-medium">High-need recall</th>
              <th className="px-5 py-3 text-right font-medium">Accuracy</th>
            </tr>
          </thead>
          <tbody>
            {report.fairness.groups.map((g) => (
              <tr key={g.group} className="border-b border-border last:border-0">
                <td className="px-5 py-3">{g.group}</td>
                <td className="px-5 py-3 text-right tabular-nums">{g.count}</td>
                <td className="px-5 py-3 text-right tabular-nums">{pct(g.actualHighRate)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{pct(g.predictedHighRate)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{g.recallHigh === null ? '—' : pct(g.recallHigh)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{pct(g.accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-border px-5 py-3 text-[13px] text-muted-foreground sm:px-6">
        {report.fairness.note} Groups with very few applications give unreliable figures.
      </p>
    </Card>
  );
}

export default function ModelPage() {
  const { data, setData, error } = useModelStatus();
  const [training, setTraining] = useState<string | null>(null);

  const train = async (source: 'REVIEWED_DECISIONS' | 'SYNTHETIC_DEMO') => {
    setTraining(source);
    try {
      setData(await reviewApi.train(source));
      toast.success('Model trained and evaluated');
    } catch (e) {
      toast.error(getErrorMessage(e));
    } finally {
      setTraining(null);
    }
  };

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data)
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-60" />
        <Skeleton className="h-48" />
      </div>
    );

  const report = data.report;
  const levels = Object.entries(data.reviewedDecisions.byLevel) as [keyof typeof NEED_LEVEL_LABELS, number][];

  return (
    <>
      <PageHeader
        title="Need model"
        description="An experimental machine-learning second opinion. The rule-based score stays primary and the admin always decides."
      />
      {data.service === 'DOWN' && (
        <Alert tone="warning" title="The ML service is not running" className="mb-6">
          Start it with <code className="font-mono text-[13px]">npm run dev</code>. Assessments still work using the rule-based score alone.
        </Alert>
      )}

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Train on reviewed decisions" description="The genuine route: learn from the need levels admins confirmed." />
          <CardBody className="space-y-4">
            <DefinitionList
              className="sm:grid-cols-2"
              items={[
                ['Decided applications', data.reviewedDecisions.total],
                ['By need level', levels.length ? levels.map(([l, n]) => `${NEED_LEVEL_LABELS[l]}: ${n}`).join(' · ') : 'None yet'],
              ]}
            />
            <p className="text-[13px] text-muted-foreground">
              Needs at least {ML_MIN_SAMPLES} decided applications, with at least {ML_MIN_PER_CLASS} in every need level used.
            </p>
            <Button onClick={() => train('REVIEWED_DECISIONS')} loading={training === 'REVIEWED_DECISIONS'} disabled={!data.canTrainOnDecisions || data.service === 'DOWN' || !!training}>
              Train on decisions
            </Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Demonstration model" description="For showing the pipeline before enough real decisions exist." />
          <CardBody className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Trains on 600 synthetic applications whose labels come from a hidden, noisy process. Every prediction it makes is marked as a demonstration and must
              not be treated as a real assessment.
            </p>
            <Button variant="secondary" onClick={() => train('SYNTHETIC_DEMO')} loading={training === 'SYNTHETIC_DEMO'} disabled={data.service === 'DOWN' || !!training}>
              Train demonstration model
            </Button>
          </CardBody>
        </Card>
      </div>

      {report ? (
        <div className="space-y-6">
          <Card>
            <CardBody className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span className="font-medium">Model in use: {report.chosen}</span>
              {report.model.source === 'SYNTHETIC_DEMO' ? <Badge tone="warning">Demonstration · synthetic data</Badge> : <Badge tone="success">Trained on reviewed decisions</Badge>}
              <span className="text-muted-foreground">
                {report.model.samples} samples · macro F1 {num(report.model.macroF1)} · trained {formatDate(report.model.trainedAt, true)}
              </span>
            </CardBody>
          </Card>
          <Comparison report={report} />
          <ChosenModel report={report} />
          <div className="grid gap-6 lg:grid-cols-2">
            <Importance report={report} />
            <Fairness report={report} />
          </div>
          <p className="text-[13px] text-subtle">New predictions use this model. Use “Re-run assessment” on an application to refresh its ML opinion.</p>
        </div>
      ) : (
        data.service === 'UP' && <Alert tone="info">No model has been trained yet, so applications are assessed with the rule-based score only.</Alert>
      )}
    </>
  );
}
