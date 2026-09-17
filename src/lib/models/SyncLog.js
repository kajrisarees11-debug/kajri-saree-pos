import mongoose from 'mongoose';

// Idempotency marker for the offline→cloud sync queue. Each row is keyed by
// `${deviceId}:${sync_queue.id}` — the local SQLite job id ALONE isn't
// enough, since it's an autoincrement counter that starts independently at
// 1 on every install; two desktop terminals sharing one MongoDB cluster
// would otherwise collide on job id and one terminal's marker would make a
// completely different terminal's job look already-applied. If a marker for
// a job already exists, that job has already been applied to MongoDB and
// must NOT be re-applied, even if the local queue still (or again) contains
// it — e.g. because the desktop app crashed between committing this marker
// and deleting the local queue row. See syncEngine.js processSyncQueue().
const SyncLogSchema = new mongoose.Schema({
  _id: { type: String }, // `${deviceId}:${sync_queue.id}` — not a generated ObjectId
  collectionName: { type: String },
  documentId: { type: String },
  action: { type: String },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });

export default mongoose.models.SyncLog || mongoose.model('SyncLog', SyncLogSchema);
