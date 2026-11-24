import { AppError } from '../../utils/AppError';
import { generateOtp, randomReference, safeEqual, sha256 } from '../../utils/crypto';
import { holderType, isValidPan, maskEmail, maskPan, normalizeName, normalizePan } from '../records/pan';
import { PanRecord } from '../records/record.model';
import { otpMail, sendMail } from './mailer';
import { Verification } from './verification.model';

export const OTP_TTL_MINUTES = 10;
export const MAX_OTP_ATTEMPTS = 5;
/** At most this many OTPs per PAN in OTP_WINDOW_MINUTES, so nobody can flood a holder's inbox. */
export const MAX_OTPS_PER_WINDOW = 3;
export const OTP_WINDOW_MINUTES = 15;

export interface VerifyInput {
  pan: string;
  name: string;
  dateOfBirth: string;
}

/**
 * Step 1: checks the PAN, name and date of birth against the registry. If all match, an OTP is
 * emailed to the address registered for that PAN (never one supplied by the caller).
 */
export async function startVerification(partner: string, input: VerifyInput) {
  const pan = normalizePan(input.pan);
  if (!isValidPan(pan)) return { result: 'INVALID_FORMAT' as const };

  const record = await PanRecord.findOne({ pan });
  if (!record) return { result: 'NOT_FOUND' as const };
  if (record.status !== 'ACTIVE') return { result: 'INACTIVE' as const };

  const nameMatch = normalizeName(record.fullName) === normalizeName(input.name);
  const dobMatch = record.dateOfBirth === input.dateOfBirth;
  if (!nameMatch || !dobMatch) {
    return { result: (nameMatch ? 'DOB_MISMATCH' : 'NAME_MISMATCH') as 'DOB_MISMATCH' | 'NAME_MISMATCH', nameMatch, dobMatch };
  }

  const recent = await Verification.countDocuments({
    pan,
    createdAt: { $gte: new Date(Date.now() - OTP_WINDOW_MINUTES * 60 * 1000) },
  });
  if (recent >= MAX_OTPS_PER_WINDOW) {
    throw new AppError(429, 'TOO_MANY_OTPS', `Too many codes were requested for this PAN. Try again in ${OTP_WINDOW_MINUTES} minutes.`);
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  const verification = await Verification.create({
    reference: randomReference(),
    partner,
    record: record._id,
    pan,
    otpHash: sha256(otp),
    expiresAt,
  });
  await sendMail(otpMail(record.email, otp, maskPan(pan)));

  return {
    result: 'OTP_SENT' as const,
    nameMatch: true,
    dobMatch: true,
    reference: verification.reference,
    otpSentTo: maskEmail(record.email),
    expiresAt: expiresAt.toISOString(),
  };
}

/** Step 2: checks the OTP. A reference can be confirmed once, within 10 minutes, with at most 5 tries. */
export async function confirmVerification(partner: string, reference: string, otp: string) {
  const v = await Verification.findOne({ reference, partner }).select('+otpHash');
  if (!v) throw AppError.notFound('Unknown verification reference');

  if (v.status === 'VERIFIED') return { result: 'ALREADY_USED' as const };
  if (v.status === 'FAILED') return { result: 'TOO_MANY_ATTEMPTS' as const };
  if (v.status === 'EXPIRED' || v.expiresAt < new Date()) {
    await Verification.updateOne({ _id: v._id, status: 'OTP_SENT' }, { status: 'EXPIRED' });
    return { result: 'EXPIRED' as const };
  }

  // Count the attempt atomically before comparing, so parallel guesses cannot exceed the limit.
  const counted = await Verification.findOneAndUpdate(
    { _id: v._id, status: 'OTP_SENT', attempts: { $lt: MAX_OTP_ATTEMPTS } },
    { $inc: { attempts: 1 } },
    { new: true },
  );
  if (!counted) return { result: 'TOO_MANY_ATTEMPTS' as const };

  if (!safeEqual(sha256(otp), v.otpHash)) {
    const attemptsLeft = MAX_OTP_ATTEMPTS - counted.attempts;
    if (attemptsLeft <= 0) {
      await Verification.updateOne({ _id: v._id, status: 'OTP_SENT' }, { status: 'FAILED' });
      return { result: 'TOO_MANY_ATTEMPTS' as const };
    }
    return { result: 'INVALID_OTP' as const, attemptsLeft };
  }

  const verifiedAt = new Date();
  const done = await Verification.findOneAndUpdate({ _id: v._id, status: 'OTP_SENT' }, { status: 'VERIFIED', verifiedAt });
  if (!done) return { result: 'ALREADY_USED' as const };

  const record = await PanRecord.findById(v.record);
  if (!record || record.status !== 'ACTIVE') return { result: 'INACTIVE' as const };

  return {
    result: 'VERIFIED' as const,
    reference: v.reference,
    pan: record.pan,
    fullName: record.fullName,
    holderType: holderType(record.pan),
    verifiedAt: verifiedAt.toISOString(),
  };
}
