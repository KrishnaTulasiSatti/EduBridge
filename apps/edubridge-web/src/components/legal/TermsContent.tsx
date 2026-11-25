/** Bump this when the terms change in a way users should see again. */
export const TERMS_UPDATED = '25 November 2026';

const sections: { title: string; points: string[] }[] = [
  {
    title: '1. About EduBridge',
    points: [
      'EduBridge connects students who need financial help for their education with sponsors who want to help.',
      'EduBridge verifies applications and introduces students to sponsors. It does not collect, hold or transfer money.',
      'Any support is arranged directly between the sponsor and the student.',
    ],
  },
  {
    title: '2. Your account',
    points: [
      'You must give your real name, a working email address and a valid mobile number.',
      'Keep your password private. You are responsible for what is done with your account.',
      'You are signed out when you close the tab or after 30 minutes without activity.',
      'Volunteer accounts become active only after an administrator approves them.',
    ],
  },
  {
    title: '3. Students',
    points: [
      'Everything in your application, and every document you share or upload, must be true and your own.',
      'False information or altered documents will lead to rejection and may lead to your account being suspended.',
      'Your documents are checked by volunteers and administrators, and with your institution or official portals.',
      'If your application is approved, sponsors can see an anonymised profile: course, year, state and the support you need.',
      'When a sponsor connects with you, your name, email and mobile number are shared with that sponsor, and theirs with you.',
      'An approval is not a promise of money. Support depends on sponsors.',
    ],
  },
  {
    title: '4. Sponsors',
    points: [
      'Sponsors must verify their PAN when they sign up. One PAN can be linked to one account.',
      'Use a student’s contact details only to arrange support for their education. Do not share them with anyone else.',
      'Never ask a student for money, documents or personal favours.',
      'An administrator can end a connection if these rules are broken.',
    ],
  },
  {
    title: '5. Volunteers',
    points: [
      'Volunteers see private student documents. Use them only to verify the application you are working on.',
      'Do not download, copy, share or keep any student information outside EduBridge.',
      'Record honestly what you checked. The final decision is always made by an administrator.',
    ],
  },
  {
    title: '6. Privacy: what we collect',
    points: [
      'Account details: name, email, mobile number and role.',
      'Student details: personal, education, family and income details, the support requested, and documents.',
      'Aadhaar number (students): used only to find the income certificate on the AP Seva portal. It is stored encrypted and deleted once a final decision is made.',
      'PAN (sponsors): stored encrypted and used only to confirm identity.',
    ],
  },
  {
    title: '7. Privacy: how it is used and kept',
    points: [
      'Your information is used only to verify, assess and connect applications. It is never sold or used for advertising.',
      'Important actions, such as document checks, decisions and connections, are recorded so they can be traced later.',
      'Documents of applications that are not approved are deleted 180 days after the decision.',
      'Emails are sent about your account and your application. You can ask an administrator to close your account.',
    ],
  },
  {
    title: '8. Changes and contact',
    points: [
      'These terms may change. If they change in an important way, you will be asked to accept them again.',
      'For any question about these terms or your data, contact the EduBridge administrator.',
    ],
  },
];

export function TermsContent() {
  return (
    <div className="space-y-6 text-[14px] leading-relaxed">
      <p className="text-muted-foreground">
        Please read these terms before creating an account. Last updated {TERMS_UPDATED}.
      </p>
      {sections.map((s) => (
        <section key={s.title}>
          <h3 className="text-[15px] font-semibold text-foreground">{s.title}</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-muted-foreground marker:text-subtle">
            {s.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
