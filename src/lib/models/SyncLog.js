import mongoose from 'mongoose';

// Idempotency marker for the offline→cloud sync queue. Each row is keyed by
// the local SQLite sync_queue job id: if a marker for a job already exists,
// that job has already been applied to MongoDB and must NOT be re-applied,
// even if the local queue still (or again) contains it — e.g. because the
// desktop app crashed between committing this marker and deleting the local
// queue row. See syncEngine.js processSyncQueue().
const SyncLogSchema = new mongoose.Schema({
  _id: { type: Number }, // local sync_queue.id — not a generated ObjectId
  collectionName: { type: String },
  documentId: { type: String },
  action: { type: String },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });

export default mongoose.models.SyncLog || mongoose.model('SyncLog', SyncLogSchema);
