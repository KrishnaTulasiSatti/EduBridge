import type { AccountStatus, Role } from '@edubridge/shared';
import { Application } from '../applications/models';
import { User } from '../auth/user.model';
import { sendMail, track } from './mailer';
import { buildEmail, inr } from './template';

/**
 * Email notifications. Each function sends in the background and never throws, so a mail problem
 * can never break the action that triggered it.
 */

type Person = { fullName: string; email: string; phone?: string | null };

function safely(label: string, fn: () => Promise<void>) {
  track(fn(), `Could not prepare the "${label}" email:`);
}

const contactLines = (p: Person): [string, string | undefined][] => [
  ['Name', p.fullName],
  ['Email', p.email],
  ['Phone', p.phone ? `+91 ${p.phone}` : undefined],
];

async function activeUsers(role: Role) {
  return User.find({ role, status: 'ACTIVE' }).select('fullName email').lean();
}

/* ---------------------------------------------------------------- Accounts */

export function welcome(user: Person & { role: Role; status: string }) {
  safely('welcome', async () => {
    const byRole: Record<Role, { paragraphs: string[]; button?: { label: string; path: string } }> = {
      STUDENT: {
        paragraphs: [
          'Welcome to EduBridge. Your student account is ready.',
          'Start your application when you are ready. Your answers are saved as you go, so you can finish it in more than one sitting. You will need your latest marksheet, your family income certificate and your college ID card.',
        ],
        button: { label: 'Start your application', path: '/dashboard/application' },
      },
      SPONSOR: {
        paragraphs: [
          'Welcome to EduBridge, and thank you for choosing to support a student’s education. Your PAN has been verified.',
          'Set your budget and preferences, and we will suggest approved students who match them.',
        ],
        button: { label: 'Set your preferences', path: '/dashboard/preferences' },
      },
      VOLUNTEER: {
        paragraphs: [
          'Thank you for offering to volunteer with EduBridge.',
          'Volunteers handle sensitive student documents, so an administrator reviews every volunteer account first. We will email you as soon as yours is approved.',
        ],
      },
      ADMIN: { paragraphs: ['Your EduBridge administrator account is ready.'] },
    };
    const c = byRole[user.role];
    sendMail(buildEmail({ to: user.email, subject: 'Welcome to EduBridge', name: user.fullName, ...c }));
  });
}

/** Tells administrators that a volunteer is waiting for approval. */
export function volunteerWaiting(volunteer: Person) {
  safely('volunteer waiting', async () => {
    for (const admin of await activeUsers('ADMIN')) {
      sendMail(
        buildEmail({
          to: admin.email,
          subject: `New volunteer waiting for approval: ${volunteer.fullName}`,
          name: admin.fullName,
          paragraphs: ['A new volunteer has registered and is waiting for your approval before they can verify applications.'],
          details: [
            ['Name', volunteer.fullName],
            ['Email', volunteer.email],
          ],
          button: { label: 'Review volunteers', path: '/dashboard/users' },
        }),
      );
    }
  });
}

export function accountStatusChanged(user: Person & { role: Role }, from: AccountStatus, to: AccountStatus, reason?: string) {
  if (from === to) return;
  safely('account status', async () => {
    if (to === 'ACTIVE') {
      const approved = from === 'PENDING_APPROVAL';
      sendMail(
        buildEmail({
          to: user.email,
          subject: approved ? 'Your EduBridge volunteer account is approved' : 'Your EduBridge account is active again',
          name: user.fullName,
          paragraphs: approved
            ? ['Good news: an administrator has approved your volunteer account. You can now sign in and start verifying applications.']
            : ['An administrator has reactivated your EduBridge account. You can sign in again.'],
          button: approved ? { label: 'Open the verification queue', path: '/dashboard/queue' } : { label: 'Sign in', path: '/login' },
        }),
      );
    } else if (to === 'SUSPENDED') {
      sendMail(
        buildEmail({
          to: user.email,
          subject: 'Your EduBridge account has been suspended',
          name: user.fullName,
          paragraphs: ['An administrator has suspended your EduBridge account, so you can no longer sign in.', 'If you think this is a mistake, please reply to this email.'],
          details: [['Reason', reason]],
        }),
      );
    }
  });
}

/* ------------------------------------------------------------ Applications */

async function studentOf(applicationId: unknown) {
  const app = await Application.findById(applicationId).select('student applicationNumber').lean();
  if (!app) return null;
  const student = await User.findById(app.student).select('fullName email').lean();
  return student ? { app, student } : null;
}

export function applicationSubmitted(applicationId: unknown) {
  safely('application submitted', async () => {
    const found = await studentOf(applicationId);
    if (!found) return;
    sendMail(
      buildEmail({
        to: found.student.email,
        subject: 'We received your application',
        name: found.student.fullName,
        paragraphs: [
          'Thank you. Your application has been submitted and is now waiting for a volunteer to verify your documents.',
          'We will email you when verification starts and again when a decision is made.',
        ],
        button: { label: 'Track your application', path: '/dashboard/application' },
      }),
    );

    // Volunteers get one email when the queue goes from empty to waiting, not one per application.
    const waiting = await Application.countDocuments({ status: 'SUBMITTED', 'assignment.volunteer': { $exists: false } });
    if (waiting !== 1) return;
    for (const v of await activeUsers('VOLUNTEER')) {
      sendMail(
        buildEmail({
          to: v.email,
          subject: 'New applications are waiting for verification',
          name: v.fullName,
          paragraphs: ['There are applications waiting in the verification queue. Thank you for helping students get a fair, careful check.'],
          button: { label: 'Open the verification queue', path: '/dashboard/queue' },
          footnote: 'You get this email when the queue goes from empty to waiting, not for every application.',
        }),
      );
    }
  });
}

export function verificationStarted(applicationId: unknown) {
  safely('verification started', async () => {
    const found = await studentOf(applicationId);
    if (!found) return;
    sendMail(
      buildEmail({
        to: found.student.email,
        subject: 'Verification has started for your application',
        name: found.student.fullName,
        paragraphs: [
          'A volunteer has started checking your documents. You do not need to do anything now.',
          'If something needs clarifying, the EduBridge team may contact you.',
        ],
        button: { label: 'Track your application', path: '/dashboard/application' },
      }),
    );
  });
}

export function decisionMade(applicationId: unknown, decision: 'APPROVED' | 'ON_HOLD' | 'REJECTED', approvedAmount: number | undefined, messageToStudent: string | undefined) {
  safely('decision', async () => {
    const found = await studentOf(applicationId);
    if (!found) return;
    const quote = messageToStudent ? { from: 'the EduBridge team', text: messageToStudent } : undefined;
    const content = {
      APPROVED: {
        subject: 'Your application has been approved',
        paragraphs: [
          `Congratulations! Your application has been approved for sponsorship of up to ${inr(approvedAmount ?? 0)}.`,
          'Your anonymised profile is now shown to sponsors. A sponsor who connects with you will see your name, email and phone number and will contact you directly.',
        ],
        button: { label: 'Go to Sponsorship', path: '/dashboard/sponsorships' },
      },
      ON_HOLD: {
        subject: 'Your application is on hold',
        paragraphs: ['Your application has been put on hold for now. This is not a final decision.', 'The EduBridge team may contact you if they need more information.'],
        button: { label: 'View your application', path: '/dashboard/application' },
      },
      REJECTED: {
        subject: 'An update on your application',
        paragraphs: ['Thank you for applying. After a careful review, we are not able to approve your application this time.'],
        button: { label: 'View your application', path: '/dashboard/application' },
      },
    }[decision];
    sendMail(buildEmail({ to: found.student.email, name: found.student.fullName, quote, ...content }));
  });
}

/* ------------------------------------------------------------ Connections */

interface ConnectionInfo {
  reference: string;
  amount: number;
  sponsor: unknown;
  student: unknown;
  sponsorName: string;
  messageToStudent?: string | null;
}

async function people(c: ConnectionInfo) {
  const [sponsor, student] = await Promise.all([
    User.findById(c.sponsor).select('fullName email phone').lean(),
    User.findById(c.student).select('fullName email phone').lean(),
  ]);
  return sponsor && student ? { sponsor, student } : null;
}

export function connected(c: ConnectionInfo) {
  safely('connected', async () => {
    const p = await people(c);
    if (!p) return;
    sendMail(
      buildEmail({
        to: p.student.email,
        subject: `${c.sponsorName} wants to support your education`,
        name: p.student.fullName,
        paragraphs: [
          `${c.sponsorName} has connected with you on EduBridge and intends to give ${inr(c.amount)} towards your education.`,
          'They can see your name, email and phone number, and will contact you to arrange the support. You can also contact them:',
        ],
        details: contactLines({ ...p.sponsor, fullName: c.sponsorName }),
        quote: c.messageToStudent ? { from: c.sponsorName, text: c.messageToStudent } : undefined,
        button: { label: 'View your sponsors', path: '/dashboard/sponsorships' },
        footnote: 'EduBridge does not handle money. Never pay anyone to receive sponsorship, and never share an OTP or password.',
      }),
    );
    sendMail(
      buildEmail({
        to: p.sponsor.email,
        subject: `You are connected with ${p.student.fullName}`,
        name: p.sponsor.fullName,
        paragraphs: [
          `Thank you. You are now connected with ${p.student.fullName} and have promised ${inr(c.amount)} towards their education.`,
          'Please contact them to arrange the support. Their details:',
        ],
        details: [...contactLines(p.student), ['Reference', c.reference]],
        button: { label: 'My sponsorships', path: '/dashboard/sponsorships' },
        footnote: 'Please keep the student’s contact details private and use them only to arrange this support.',
      }),
    );
  });
}

export function connectionEnded(c: ConnectionInfo, endedBy: 'SPONSOR' | 'ADMIN') {
  safely('connection ended', async () => {
    const p = await people(c);
    if (!p) return;
    const byWhom = endedBy === 'SPONSOR' ? 'by the sponsor' : 'by an EduBridge administrator';
    sendMail(
      buildEmail({
        to: p.student.email,
        subject: `Your connection with ${c.sponsorName} has ended`,
        name: p.student.fullName,
        paragraphs: [
          `Your connection with ${c.sponsorName} (${inr(c.amount)} promised) was ended ${byWhom}. You no longer share contact details through EduBridge.`,
          'If your profile is still shown to sponsors, other sponsors can connect with you.',
        ],
        button: { label: 'View your sponsors', path: '/dashboard/sponsorships' },
      }),
    );
    sendMail(
      buildEmail({
        to: p.sponsor.email,
        subject: `Your connection ${c.reference} has ended`,
        name: p.sponsor.fullName,
        paragraphs: [
          `Your connection with ${p.student.fullName} (${inr(c.amount)} promised) was ended ${byWhom}. The amount is available in your budget again.`,
          'Please stop using the student’s contact details for EduBridge sponsorship.',
        ],
        button: { label: 'Find students', path: '/dashboard/discover' },
      }),
    );
  });
}
