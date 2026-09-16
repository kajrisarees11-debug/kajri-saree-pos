import dbConnect from '@/lib/db';
import sqliteDb from '@/lib/sqlite';

// Import all Mongoose models
import Product from '@/lib/models/Product';
import POSCustomer from '@/lib/models/POSCustomer';
import Supplier from '@/lib/models/Supplier';
import POSInvoice from '@/lib/models/POSInvoice';
import Expense from '@/lib/models/Expense';
import Purchase from '@/lib/models/Purchase';
import Ledger from '@/lib/models/Ledger';
import SyncLog from '@/lib/models/SyncLog';

const modelMap = {
  'products': Product,
  'customers': POSCustomer,
  'suppliers': Supplier,
  'invoices': POSInvoice,
  'expenses': Expense,
  'purchases': Purchase,
  'ledgers': Ledger
};

/**
 * SQLite stores arrays (like invoice items, product images) as JSON strings.
 * Before sending to Mongoose, any string fields that look like JSON arrays/objects
 * must be parsed back into their native form, otherwise Mongoose throws a CastError.
 */
function deserializePayload(payload) {
  const JSON_STRING_FIELDS = ['items', 'images'];
  const result = { ...payload };
  for (const field of JSON_STRING_FIELDS) {
    if (typeof result[field] === 'string') {
      try {
        result[field] = JSON.parse(result[field]);
      } catch {
        // leave as-is if not valid JSON
      }
    }
  }
  return result;
}

let isSyncing = false;

/**
 * Pushes all pending local changes in SQLite's sync_queue to MongoDB.
 *
 * Idempotent by design: each job is applied to MongoDB and marked "applied"
 * (via a SyncLog document keyed by the job's local id) inside a single Mongo
 * transaction. If the desktop app crashes/loses power between that
 * transaction committing and the local `DELETE FROM sync_queue` running, the
 * job gets retried on the next sync — but the SyncLog marker check means it's
 * skipped rather than re-applied, so a stock/balance $inc can never be
 * double-counted from a retried job.
 */
export async function processSyncQueue() {
  if (isSyncing) return { status: 'already_syncing' };
  isSyncing = true;

  try {
    const queue = sqliteDb.prepare('SELECT * FROM sync_queue ORDER BY id ASC').all();
    if (queue.length === 0) {
      isSyncing = false;
      return { status: 'idle', processed: 0, stuck: 0 };
    }

    await dbConnect();
    const mongoose = (await import('mongoose')).default;
    let processedCount = 0;
    const stuckJobs = [];

    for (const job of queue) {
      const Model = modelMap[job.collectionName];
      if (!Model) {
        console.warn(`[Sync Engine] Unknown collection: ${job.collectionName}`);
        sqliteDb.prepare('DELETE FROM sync_queue WHERE id = ?').run(job.id);
        continue;
      }

      try {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const alreadyApplied = await SyncLog.findById(job.id).session(session);
            if (alreadyApplied) return; // exactly-once guard — see module docblock

            if (job.action === 'INSERT') {
              const payload = deserializePayload(JSON.parse(job.payload));
              // Upsert to prevent duplicate key errors on retries
              await Model.findByIdAndUpdate(job.documentId, payload, { upsert: true, setDefaultsOnInsert: true, session });
            } else if (job.action === 'UPDATE') {
              const payload = deserializePayload(JSON.parse(job.payload));
              await Model.findByIdAndUpdate(job.documentId, payload, { session });
            } else if (job.action === 'DELETE') {
              await Model.findByIdAndDelete(job.documentId, { session });
            }

            await SyncLog.create([{
              _id: job.id, collectionName: job.collectionName, documentId: job.documentId, action: job.action,
            }], { session });
          });
        } finally {
          await session.endSession();
        }

        // Successfully pushed to cloud (or already had been) — safe to drop locally.
        sqliteDb.prepare('DELETE FROM sync_queue WHERE id = ?').run(job.id);
        processedCount++;
      } catch (err) {
        console.error(`[Sync Engine] Error processing job ${job.id} (${job.action} ${job.collectionName}#${job.documentId}):`, err);
        // Left in the queue to retry later — no data was written to Mongo for
        // this job (the transaction above didn't commit), so retrying is safe.
        stuckJobs.push({ id: job.id, collectionName: job.collectionName, documentId: job.documentId, action: job.action, error: err.message });
      }
    }

    if (stuckJobs.length > 0) {
      console.error(`[Sync Engine] ${stuckJobs.length} job(s) still stuck in the queue after this run:`, stuckJobs);
    }
    console.log(`[Sync Engine] Successfully pushed ${processedCount} changes to cloud.`);
    isSyncing = false;
    return { status: 'success', processed: processedCount, stuck: stuckJobs.length, stuckJobs: stuckJobs.length > 0 ? stuckJobs : undefined };
  } catch (error) {
    console.error('[Sync Engine] Critical failure:', error);
    isSyncing = false;
    return { status: 'error', error: error.message };
  }
}

// ─── Downsync: pull remote (MongoDB) changes down into local SQLite ───────────
//
// Each entry describes how to read the cursor (from the corresponding SQLite
// table's own MAX(updatedAt)) and how to upsert a batch of remote docs back
// into that table. Covers every syncable collection — not just products —
// so changes made on the web dashboard (e.g. a payment recorded against a
// customer, a supplier update) actually reach the desktop app.
const DOWNSYNC_TABLES = [
  {
    name: 'products', Model: Product, table: 'products',
    columns: ['_id', 'name', 'sku', 'barcode', 'description', 'price', 'purchasePrice', 'stock', 'minStock', 'categoryId', 'subCategory', 'supplierId', 'images', 'fabric', 'colour', 'sareeType', 'brand', 'design', 'status', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.name, r.sku, r.barcode, r.description, r.price, r.purchasePrice,
      r.stock, r.minStock, r.categoryId?.toString(), r.subCategory, r.supplierId?.toString(),
      JSON.stringify(r.images || []), r.fabric, r.colour, r.sareeType, r.brand, r.design,
      r.status, isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'customers', Model: POSCustomer, table: 'customers',
    columns: ['_id', 'name', 'mobileNumber', 'email', 'address', 'city', 'pincode', 'outstandingBalance', 'totalPurchases', 'gstin', 'customerType', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.name, r.mobileNumber, r.email, r.address, r.city, r.pincode,
      r.outstandingBalance, r.totalPurchases, r.gstin, r.customerType, isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'suppliers', Model: Supplier, table: 'suppliers',
    columns: ['_id', 'name', 'contactNumber', 'phone', 'email', 'address', 'city', 'gstin', 'payableBalance', 'outstandingBalance', 'purchaseHistory', 'bankName', 'accountNumber', 'ifscCode', 'upiId', 'notes', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.name, r.contactNumber, r.phone, r.email, r.address, r.city, r.gstin,
      r.payableBalance, r.outstandingBalance, r.purchaseHistory, r.bankName, r.accountNumber, r.ifscCode, r.upiId, r.notes,
      isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'invoices', Model: POSInvoice, table: 'invoices',
    columns: ['_id', 'invoiceNumber', 'customerId', 'items', 'subTotal', 'taxTotal', 'discountTotal', 'grandTotal', 'paymentMethod', 'amountPaid', 'balance', 'status', 'returnReason', 'refundTotal', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.invoiceNumber, r.customerId?.toString() || null, JSON.stringify(r.items || []),
      r.subTotal, r.taxTotal, r.discountTotal, r.grandTotal, r.paymentMethod, r.amountPaid, r.balance,
      r.status, r.returnReason, r.refundTotal, isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'expenses', Model: Expense, table: 'expenses',
    columns: ['_id', 'date', 'category', 'amount', 'paymentMethod', 'description', 'referenceNo', 'receiptImage', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), isoOrNull(r.date), r.category, r.amount, r.paymentMethod,
      r.description ?? r.notes ?? null, r.referenceNo, r.receiptImage, isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'purchases', Model: Purchase, table: 'purchases',
    columns: ['_id', 'supplierId', 'invoiceNumber', 'date', 'items', 'totalAmount', 'status', 'notes', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.supplierId?.toString() || null, r.invoiceNumber, isoOrNull(r.date),
      JSON.stringify(r.items || []), r.totalAmount, r.status || 'Completed', r.notes, isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
  {
    name: 'ledgers', Model: Ledger, table: 'ledgers',
    columns: ['_id', 'entityType', 'entityId', 'transactionType', 'amount', 'description', 'date', 'createdAt', 'updatedAt'],
    mapRow: (r) => [
      r._id.toString(), r.entityType, r.entityId?.toString() || null, r.transactionType, r.amount,
      r.description, isoOrNull(r.date), isoOrNull(r.createdAt), isoOrNull(r.updatedAt),
    ],
  },
];

function isoOrNull(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString();
}

function downsyncCursor(table) {
  const row = sqliteDb.prepare(`SELECT updatedAt FROM ${table} ORDER BY updatedAt DESC LIMIT 1`).get();
  if (row && row.updatedAt) {
    // +1ms so we don't refetch the exact same row if timestamps exactly match
    return new Date(new Date(row.updatedAt).getTime() + 1);
  }
  // Table is empty locally — pull everything.
  return new Date(0);
}

let isDownsyncing = false;

/**
 * Pulls remote changes from MongoDB down to local SQLite, across every
 * syncable collection (not just products) — so e.g. a payment recorded on
 * the web dashboard against a customer's balance reaches the desktop app.
 */
export async function performDownsync() {
  if (isDownsyncing) return { status: 'already_syncing' };
  isDownsyncing = true;

  try {
    await dbConnect();

    const byCollection = {};
    let total = 0;

    for (const cfg of DOWNSYNC_TABLES) {
      try {
        const cursor = downsyncCursor(cfg.table);
        const remoteRows = await cfg.Model.find({ updatedAt: { $gte: cursor } }).lean();

        if (remoteRows.length === 0) {
          byCollection[cfg.name] = 0;
          continue;
        }

        const placeholders = cfg.columns.map(() => '?').join(', ');
        const updateClause = cfg.columns
          .filter(c => c !== '_id')
          .map(c => `${c}=excluded.${c}`)
          .join(', ');
        const upsertStmt = sqliteDb.prepare(`
          INSERT INTO ${cfg.table} (${cfg.columns.join(', ')})
          VALUES (${placeholders})
          ON CONFLICT(_id) DO UPDATE SET ${updateClause}
        `);

        let count = 0;
        sqliteDb.transaction(() => {
          for (const row of remoteRows) {
            upsertStmt.run(...cfg.mapRow(row));
            count++;
          }
        })();

        byCollection[cfg.name] = count;
        total += count;
      } catch (err) {
        console.error(`[Sync Engine] Downsync failed for ${cfg.name}:`, err);
        byCollection[cfg.name] = { error: err.message };
      }
    }

    if (total > 0) {
      console.log(`[Sync Engine] Downsync pulled ${total} record(s) from cloud:`, byCollection);
    }
    isDownsyncing = false;
    return { synced: total, byCollection };
  } catch (error) {
    console.error('[Sync Engine] Downsync failed:', error);
    isDownsyncing = false;
    return { error: error.message };
  }
}
