import type { Request } from 'express';
import { Types, type PipelineStage } from 'mongoose';
import { z } from 'zod';
import {
  GENDER_LABELS,
  ML_MIN_PER_CLASS,
  ML_MIN_SAMPLES,
  NEED_LEVELS,
  type AssessmentDTO,
  type DecisionDTO,
  type DecisionInput,
  type DocumentReviewDTO,
  type EnrolmentCheckDTO,
  type ModelStatusDTO,
  type NeedFeatures,
  type NeedLevel,
  type ReviewQueueItemDTO,
  type VerificationCheck,
} from '@edubridge/shared';
import { AppError } from '../../utils/AppError';
import { Application, StudentDocument } from '../applications/models';
import { AUDIT_ACTIONS, audit } from '../audit/audit.service';
import { User } from '../auth/user.model';
import { detail as verificationDetail } from '../verification/verification.service';
import { computeAssessment } from './assessment.service';
import { MlError, mlClient, toAppError, type TrainingSample } from './mlClient';

type Actor = { id: string; role: 'ADMIN' | 'STUDENT' | 'VOLUNTEER' | 'SPONSOR' };
type Plain = Record<string, unknown>;

// VOLUNTEER_REVIEWED normally becomes ASSESSED at once; it is included so an application is never stranded
// if that step did not run (the assessment is then computed when the admin re-runs it or decides).
const AWAITING = ['VOLUNTEER_REVIEWED', 'ASSESSED'];
const DECIDABLE = [...AWAITING, 'ON_HOLD'];
const DECIDED = ['APPROVED', 'REJECTED', 'PARTIALLY_FUNDED', 'FULLY_FUNDED'];

async function findApplication(id: string) {
  if (!Types.ObjectId.isValid(id)) throw AppError.notFound('Application not found');
  const app = await Application.findById(id);
  if (!app || app.status === 'DRAFT') throw AppError.notFound('Application not found');
  return app;
}

/* ------------------------------------------------------------ Queue */

const queueQuery = z.object({
  tab: z.enum(['awaiting', 'on_hold', 'decided']).default('awaiting'),
  search: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
});

/** Mismatched checks across a document's EduVault, enrolment and manual results. */
function mismatchCount(d: Plain) {
  const lists: VerificationCheck[][] = [
    d.source === 'EDUVAULT' ? ((d.verification as { checks?: VerificationCheck[] })?.checks ?? []) : [],
    (d.enrolmentCheck as EnrolmentCheckDTO | undefined)?.checks ?? [],
    (d.review as DocumentReviewDTO | undefined)?.checks ?? [],
  ];
  return lists.flat().filter((c) => !c.match).length;
}

export async function queue(query: unknown) {
  const q = queueQuery.parse(query);
  const status = q.tab === 'awaiting' ? { $in: AWAITING } : q.tab === 'on_hold' ? 'ON_HOLD' : { $in: DECIDED };
  // Awaiting and on hold: highest need first. Decided: most recent first.
  const sort: Record<string, 1 | -1> = q.tab === 'decided' ? { 'decision.at': -1 } : { 'assessment.ruleBased.score': -1, submittedAt: 1 };

  const pipeline: PipelineStage[] = [
    { $match: { status } },
    { $lookup: { from: 'users', localField: 'student', foreignField: '_id', as: 'student', pipeline: [{ $project: { fullName: 1 } }] } },
    { $unwind: '$student' },
  ];
  if (q.search) {
    const rx = new RegExp(q.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    pipeline.push({ $match: { $or: [{ applicationNumber: rx }, { 'student.fullName': rx }, { 'profileSnapshot.education.institutionName': rx }] } });
  }
  pipeline.push(
    { $sort: sort },
    {
      $facet: {
        items: [
          { $skip: (q.page - 1) * q.limit },
          { $limit: q.limit },
          {
            $lookup: {
              from: 'studentdocuments',
              localField: '_id',
              foreignField: 'application',
              as: 'docs',
              pipeline: [{ $project: { status: 1, source: 1, verification: 1, enrolmentCheck: 1, review: 1 } }],
            },
          },
        ],
        total: [{ $count: 'n' }],
      },
    },
  );

  const [res] = await Application.aggregate(pipeline);
  const [awaiting, onHold] = await Promise.all([Application.countDocuments({ status: { $in: AWAITING } }), Application.countDocuments({ status: 'ON_HOLD' })]);
  const items: ReviewQueueItemDTO[] = res.items.map((a: Plain & { student: Plain; docs: Plain[]; assessment?: AssessmentDTO; decision?: Plain; volunteerReview?: Plain; profileSnapshot?: { education?: Plain }; support?: Plain }) => ({
    id: String(a._id),
    applicationNumber: a.applicationNumber as string,
    studentName: a.student.fullName as string,
    institutionName: a.profileSnapshot?.education?.institutionName as string | undefined,
    course: a.profileSnapshot?.education?.course as string | undefined,
    status: a.status as string,
    requestedAmount: a.support?.requestedAmount as number | undefined,
    score: a.assessment?.ruleBased.score,
    level: a.assessment?.ruleBased.level,
    mlPrediction: a.assessment?.ml.prediction,
    mlSource: a.assessment?.ml.model?.source,
    recommendation: a.volunteerReview?.recommendation as string | undefined,
    documentsVerified: a.docs.filter((d) => d.status === 'VERIFIED').length,
    documentsTotal: a.docs.length,
    inconsistencies: a.docs.reduce((n, d) => n + mismatchCount(d), 0),
    decision: a.decision?.decision as ReviewQueueItemDTO['decision'],
    decidedAt: a.decision?.at ? new Date(a.decision.at as string).toISOString() : undefined,
    assessedAt: a.assessment?.assessedAt,
  }));
  return { items, total: res.total[0]?.n ?? 0, page: q.page, limit: q.limit, counts: { awaiting, onHold } };
}

/* ----------------------------------------------------------- Detail */

export async function detail(user: Actor, id: string) {
  const app = await findApplication(id);
  const base = await verificationDetail(user, id);
  let decision: DecisionDTO | undefined;
  if (app.decision) {
    const by = await User.findById(app.decision.by).select('fullName role');
    decision = {
      decision: app.decision.decision,
      needLevel: app.decision.needLevel,
      approvedAmount: app.decision.approvedAmount ?? undefined,
      reason: app.decision.reason,
      messageToStudent: app.decision.messageToStudent ?? undefined,
      by: { id: String(app.decision.by), name: by?.fullName ?? 'Former user', role: by?.role },
      at: app.decision.at.toISOString(),
    };
  }
  return {
    ...base,
    assessment: (app.assessment as AssessmentDTO | undefined) ?? undefined,
    decision,
    canDecide: DECIDABLE.includes(app.status),
  };
}

/* ------------------------------------------------------ Re-assess */

export async function reassess(user: Actor, id: string, req: Request) {
  const app = await findApplication(id);
  if (!DECIDABLE.includes(app.status)) {
    throw AppError.conflict('Only applications waiting for a decision can be re-assessed');
  }
  const assessment = await computeAssessment(app);
  app.set('assessment', assessment);
  if (app.status === 'VOLUNTEER_REVIEWED') {
    app.status = 'ASSESSED';
    app.history.push({ status: 'ASSESSED', at: new Date(), by: new Types.ObjectId(user.id), note: 'Need assessment completed' });
  }
  await app.save();
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.ASSESSMENT_RUN,
    resourceType: 'Application',
    resourceId: app.id,
    metadata: { applicationNumber: app.applicationNumber, score: assessment.ruleBased.score, level: assessment.ruleBased.level, ml: assessment.ml.prediction ?? assessment.ml.status },
    req,
  });
  return detail(user, id);
}

/* ------------------------------------------------------- Decision */

export async function decide(user: Actor, id: string, input: DecisionInput, req: Request) {
  const app = await findApplication(id);
  if (!DECIDABLE.includes(app.status)) {
    throw AppError.conflict(DECIDED.includes(app.status) ? 'A final decision has already been made for this application' : 'This application is not ready for a decision yet');
  }
  const requested = app.support?.requestedAmount ?? 0;
  if (input.decision === 'APPROVED' && input.approvedAmount! > requested) {
    throw AppError.badRequest(`The approved amount cannot be more than the ₹${requested.toLocaleString('en-IN')} requested`, {
      approvedAmount: ['More than the amount requested'],
    });
  }

  let assessment = app.assessment as AssessmentDTO | undefined;
  if (!assessment) {
    assessment = await computeAssessment(app);
    app.set('assessment', assessment);
  }
  const now = new Date();
  app.set('decision', {
    decision: input.decision,
    needLevel: input.needLevel,
    approvedAmount: input.decision === 'APPROVED' ? input.approvedAmount : undefined,
    reason: input.reason,
    messageToStudent: input.messageToStudent || undefined,
    by: new Types.ObjectId(user.id),
    at: now,
    features: assessment.features,
    ruleScore: assessment.ruleBased.score,
  });
  const previous = app.status;
  app.status = input.decision;
  app.history.push({
    status: input.decision,
    at: now,
    by: new Types.ObjectId(user.id),
    // History notes are visible to the student, so only the message meant for them goes here.
    note: input.messageToStudent || undefined,
  });
  await app.save();

  // Aadhaar was only needed to verify the income certificate. Delete it once the decision is final.
  if (input.decision !== 'ON_HOLD') {
    await StudentDocument.updateOne({ application: app._id, type: 'INCOME_CERTIFICATE' }, { $unset: { aadhaarEncrypted: 1 } });
  }

  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.APPLICATION_DECIDED,
    resourceType: 'Application',
    resourceId: app.id,
    metadata: {
      applicationNumber: app.applicationNumber,
      from: previous,
      decision: input.decision,
      needLevel: input.needLevel,
      approvedAmount: input.approvedAmount,
      ruleScore: assessment.ruleBased.score,
      ruleLevel: assessment.ruleBased.level,
      mlPrediction: assessment.ml.prediction,
      agreedWithRules: input.needLevel === assessment.ruleBased.level,
    },
    req,
  });
  return detail(user, id);
}

/* ---------------------------------------------------------- Model */

async function decisionSamples(): Promise<TrainingSample[]> {
  const apps = await Application.find({ 'decision.features': { $exists: true } }).select('decision profileSnapshot.personal.gender').lean();
  return apps.map((a) => {
    const gender = (a.profileSnapshot as { personal?: { gender?: keyof typeof GENDER_LABELS } } | undefined)?.personal?.gender;
    return {
      features: a.decision!.features as NeedFeatures,
      label: a.decision!.needLevel as NeedLevel,
      group: gender ? GENDER_LABELS[gender] : 'Not stated',
    };
  });
}

export async function modelStatus(): Promise<ModelStatusDTO> {
  const samples = await decisionSamples();
  const byLevel = Object.fromEntries(NEED_LEVELS.map((l) => [l, samples.filter((s) => s.label === l).length]).filter(([, n]) => n)) as ModelStatusDTO['reviewedDecisions']['byLevel'];
  const present = Object.values(byLevel);
  const canTrainOnDecisions = samples.length >= ML_MIN_SAMPLES && present.length >= 2 && present.every((n) => (n ?? 0) >= ML_MIN_PER_CLASS);

  let service: ModelStatusDTO['service'] = 'UP';
  let report: ModelStatusDTO['report'];
  try {
    report = await mlClient.report();
  } catch (e) {
    if (!(e instanceof MlError && e.status === 404)) service = 'DOWN';
  }
  return { service, report, reviewedDecisions: { total: samples.length, byLevel }, canTrainOnDecisions };
}

export async function trainModel(user: Actor, source: 'REVIEWED_DECISIONS' | 'SYNTHETIC_DEMO', req: Request) {
  let report;
  try {
    if (source === 'SYNTHETIC_DEMO') report = await mlClient.trainSynthetic();
    else {
      const samples = await decisionSamples();
      if (samples.length < ML_MIN_SAMPLES) {
        throw AppError.badRequest(`At least ${ML_MIN_SAMPLES} decided applications are needed to train on real decisions; there are ${samples.length}.`);
      }
      report = await mlClient.train(samples);
    }
  } catch (e) {
    throw toAppError(e);
  }
  await audit({
    actorId: user.id,
    actorRole: user.role,
    action: AUDIT_ACTIONS.MODEL_TRAINED,
    resourceType: 'MlModel',
    resourceId: report.model.modelId,
    metadata: { source, algorithm: report.chosen, samples: report.model.samples, macroF1: report.model.macroF1 },
    req,
  });
  return modelStatus();
}
