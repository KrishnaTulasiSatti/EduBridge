import { connectDB, disconnectDB } from '../config/db';
import { PanRecord } from '../modules/records/record.model';

/** Test PAN holders. All OTPs go to one inbox so sponsor sign-up can be tried end to end. */
const EMAIL = 'krishnatulasi500@gmail.com';

const RECORDS = [
  { pan: 'ABCPR1234K', fullName: 'Ravi Kumar Reddy', dateOfBirth: '1985-04-12', mobile: '9876543210' },
  { pan: 'BDKPS5678L', fullName: 'Sneha Sharma', dateOfBirth: '1990-08-23', mobile: '9123456780' },
  { pan: 'CEMPN2468M', fullName: 'Arjun Nair', dateOfBirth: '1978-01-05', mobile: '9988776655' },
  { pan: 'DFRPP1357N', fullName: 'Priya Patel', dateOfBirth: '1992-11-30', mobile: '9012345678' },
  { pan: 'EGTPV9753P', fullName: 'Vikram Verma', dateOfBirth: '1982-06-17', mobile: '9765432109' },
];

async function main() {
  await connectDB();
  for (const r of RECORDS) {
    if (await PanRecord.exists({ pan: r.pan })) {
      console.log(`skip   ${r.pan}  (already exists)`);
      continue;
    }
    await PanRecord.create({ ...r, email: EMAIL });
    console.log(`added  ${r.pan}  ${r.fullName}`);
  }
  await disconnectDB();
}

main().catch(async (e) => {
  console.error(e);
  await disconnectDB();
  process.exit(1);
});
