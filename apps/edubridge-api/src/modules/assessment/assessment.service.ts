import { Types } from 'mongoose';
import {
  needFeatures,
  ruleBasedScore,
  type AssessmentDTO,
  type AssessmentInput,
  type DocumentReviewDTO,
  type MlOpinionDTO,
} from '@edubridge/shared';
import { Application, StudentDocument, type ApplicationDoc } from '../applications/models';
import { MlError, mlClient } from './mlClient';

const plain = <T>(v: unknown): T => JSON.parse(JSON.stringify(v ?? {})) as T;

/**
 * Builds the assessment input. If a reviewer recorded the income shown on the official portal, that
 * verified figure is used instead of the declared one (unless the certificate was rejected).
 */
export async function assessmentInput(app: ApplicationDoc): Promise<AssessmentInput> {
  const income = await StudentDocument.findOne({ application: app._id, type: 'INCOME_CERTIFICATE' });
  const review = income?.review as DocumentReviewDTO | undefined;
  const portalIncome = review?.recorded?.annualIncome;
  return {
    family: plain(app.family),
    support: plain(app.support),
    verifiedAnnualIncome: review && review.outcome !== 'REJECTED' && typeof portalIncome === 'number' ? portalIncome : undefined,
  };
}

/** Rule-based score (primary) plus the ML model's opinion (experimental, optional). */
export async function computeAssessment(app: ApplicationDoc): Promise<AssessmentDTO> {
  const input = await assessmentInput(app);
  const ruleBased = ruleBasedScore(input);
  const features = needFeatures(input);

  let ml: MlOpinionDTO;
  try {
    const p = await mlClient.predict(features);
    ml = { status: 'OK', prediction: p.prediction, probabilities: p.probabilities, model: p.model, agreesWithRules: p.prediction === ruleBased.level };
  } catch (e) {
    ml =
      e instanceof MlError && e.status === 404
        ? { status: 'NO_MODEL', message: 'No ML model has been trained yet. The rule-based score is used on its own.' }
        : { status: 'UNAVAILABLE', message: e instanceof Error ? e.message : 'The ML service could not be reached.' };
  }
  return { ruleBased, ml, features, assessedAt: new Date().toISOString() };
}

/**
 * Called when a volunteer submits their review: assesses the application and moves it to ASSESSED,
 * ready for the administrator's decision.
 */
export async function assessAfterVolunteerReview(appId: string | Types.ObjectId, actorId: string) {
  const app = await Application.findById(appId);
  if (!app || app.status !== 'VOLUNTEER_REVIEWED') return;
  const assessment = await computeAssessment(app);
  await Application.updateOne(
    { _id: app._id, status: 'VOLUNTEER_REVIEWED' },
    {
      $set: { assessment, status: 'ASSESSED' },
      $push: { history: { status: 'ASSESSED', at: new Date(), by: new Types.ObjectId(actorId), note: 'Need assessment completed' } },
    },
  );
}
