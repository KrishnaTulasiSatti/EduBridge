import { hashPassword } from '../src/modules/auth/auth.service';
import { User } from '../src/modules/auth/user.model';
import { Institution, activeKey } from '../src/modules/institutions/institution.model';
import { generateSigningKey } from '../src/modules/institutions/keys';
import { StudentRecord } from '../src/modules/records/models';

/** Test-only records for the automated tests (fictional). The app itself only creates the administrator: see src/scripts/seedData.ts. */
export const DEMO_PASSWORD = 'Demo@1234';

const INSTITUTIONS = [
  {
    code: 'KVCE-TEST',
    name: 'Krishna Valley College of Engineering (Test)',
    university: 'Coastal Technological University (Test)',
    city: 'Vijayawada',
    state: 'Andhra Pradesh',
    status: 'ACTIVE' as const,
    contact: { fullName: 'Suresh Babu', email: 'registrar@kvce.test', designation: 'Controller of Examinations' },
  },
  {
    code: 'RIS-TEST',
    name: 'Riverside Institute of Science (Test)',
    university: 'Coastal Technological University (Test)',
    city: 'Rajahmundry',
    state: 'Andhra Pradesh',
    status: 'PENDING' as const,
    contact: { fullName: 'Anita Desai', email: 'registrar@riverside.test', designation: 'Registrar' },
  },
];

export async function seedDemoData() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  let created = 0;

  const upsertUser = async (u: Record<string, unknown> & { email: string }) => {
    const res = await User.updateOne(
      { email: u.email },
      { $setOnInsert: { ...u, passwordHash, termsAcceptedAt: now } },
      { upsert: true },
    );
    created += res.upsertedCount;
    return (await User.findOne({ email: u.email }))!;
  };

  await upsertUser({ email: 'admin@eduvault.test', fullName: 'Kavya Nair', role: 'ADMIN', status: 'ACTIVE' });

  for (const def of INSTITUTIONS) {
    let inst = await Institution.findOne({ code: def.code });
    if (!inst) {
      const { contact: _contact, ...fields } = def;
      inst = await Institution.create({ ...fields, approvedAt: def.status === 'ACTIVE' ? now : undefined });
      created++;
    }
    if (inst.status === 'ACTIVE' && !activeKey(inst)) {
      inst.signingKeys.push(generateSigningKey(inst.code));
    }
    const contact = await upsertUser({
      ...def.contact,
      role: 'ISSUER',
      status: def.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING_APPROVAL',
      institution: inst._id,
    });
    inst.contact ??= contact._id;
    await inst.save();
  }

  // A student of the test college who has already activated their EduVault account.
  const kvce = (await Institution.findOne({ code: 'KVCE-TEST' }))!;
  const student = await upsertUser({ email: 'student@edubridge.test', fullName: 'Rahul Kumar', role: 'STUDENT', status: 'ACTIVE' });
  const rec = await StudentRecord.updateOne(
    { institution: kvce._id, rollNumber: '21KV1A0542' },
    {
      $setOnInsert: {
        fullName: 'Rahul Kumar',
        programme: 'B.Tech Computer Science and Engineering',
        admissionYear: 2023,
        account: student._id,
        linkedAt: now,
      },
    },
    { upsert: true },
  );
  created += rec.upsertedCount;
  return created;
}
