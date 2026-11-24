import mongoose from 'mongoose';
import { Application } from '../applications/models';
import { SponsorProfile, Sponsorship } from './models';
import { syncFundingStatus } from './sponsorship.service';

/**
 * One-time update from the old payment flow (pledge → send money → received → certificates) to
 * connections. Safe to run on every start: it does nothing once the data is converted.
 *  - Active pledges and payments become CONNECTED; cancelled ones become ENDED.
 *  - Promised totals are recomputed from active connections.
 *  - Stored bank accounts and certificates are deleted, as they are no longer used.
 */
export async function migrateToConnections() {
  const sponsorships = Sponsorship.collection;
  const legacy =
    (await sponsorships.countDocuments({ status: { $in: ['PLEDGED', 'SENT', 'CONFIRMED', 'CANCELLED'] } })) +
    (await Application.collection.countDocuments({ $or: [{ 'funding.pledged': { $exists: true } }, { 'funding.confirmed': { $exists: true } }] }));
  const db = mongoose.connection.db!;
  const oldCollections = (await db.listCollections({ name: { $in: ['bankaccounts', 'certificates'] } }, { nameOnly: true }).toArray()).map((c) => c.name);
  if (!legacy && !oldCollections.length) return;

  const unsetPayment = { payment: '', confirmation: '', expiresAt: '', showNameToStudent: '' };
  const connected = await sponsorships.updateMany(
    { status: { $in: ['PLEDGED', 'SENT', 'CONFIRMED'] } },
    { $set: { status: 'CONNECTED', active: true }, $unset: unsetPayment },
  );
  const ended = await sponsorships.updateMany({ status: 'CANCELLED' }, { $set: { status: 'ENDED' }, $unset: { ...unsetPayment, active: '', 'cancellation.wasConfirmed': '' } });
  await sponsorships.dropIndex('status_1_expiresAt_1').catch(() => undefined);

  // Recompute totals from active connections.
  const byApp = await Sponsorship.aggregate<{ _id: unknown; sum: number }>([{ $match: { status: 'CONNECTED' } }, { $group: { _id: '$application', sum: { $sum: '$amount' } } }]);
  const bySponsor = await Sponsorship.aggregate<{ _id: unknown; sum: number }>([{ $match: { status: 'CONNECTED' } }, { $group: { _id: '$sponsor', sum: { $sum: '$amount' } } }]);
  const promisedBy = new Map(byApp.map((r) => [String(r._id), r.sum]));

  const apps = await Application.collection.find({ funding: { $exists: true } }, { projection: { _id: 1 } }).toArray();
  for (const a of apps) {
    await Application.collection.updateOne({ _id: a._id }, { $set: { funding: { promised: promisedBy.get(String(a._id)) ?? 0 } } });
    await syncFundingStatus(a._id, undefined);
  }
  await SponsorProfile.collection.updateMany({}, { $set: { committed: 0 }, $unset: { confirmed: '', showNameToStudents: '' } });
  for (const s of bySponsor) await SponsorProfile.collection.updateOne({ user: s._id as mongoose.Types.ObjectId }, { $set: { committed: s.sum } });

  for (const name of oldCollections) await db.dropCollection(name);

  console.log(
    `ℹ️  Converted sponsorships to connections: ${connected.modifiedCount} active, ${ended.modifiedCount} ended, ` +
      `${apps.length} application totals recomputed${oldCollections.length ? `, removed ${oldCollections.join(' and ')}` : ''}.`,
  );
}
