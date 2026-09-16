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
 * Pushes all pending local changes in SQLite's sync_queue to MongoDB
 */
export async function processSyncQueue() {
  if (isSyncing) return { status: 'already_syncing' };
  isSyncing = true;

  try {
    const queue = sqliteDb.prepare('SELECT * FROM sync_queue ORDER BY id ASC').all();
    if (queue.length === 0) {
      isSyncing = false;
      return { status: 'idle', processed: 0 };
    }

    await dbConnect();
    let processedCount = 0;

    for (const job of queue) {
      const Model = modelMap[job.collectionName];
      if (!Model) {
        console.warn(`[Sync Engine] Unknown collection: ${job.collectionName}`);
        sqliteDb.prepare('DELETE FROM sync_queue WHERE id = ?').run(job.id);
        continue;
      }

      try {
        if (job.action === 'INSERT') {
          const payload = deserializePayload(JSON.parse(job.payload));
          // Upsert to prevent duplicate key errors on retries
          await Model.findByIdAndUpdate(job.documentId, payload, { upsert: true, setDefaultsOnInsert: true });
        } 
        else if (job.action === 'UPDATE') {
          const payload = deserializePayload(JSON.parse(job.payload));
          await Model.findByIdAndUpdate(job.documentId, payload);
        } 
        else if (job.action === 'DELETE') {
          await Model.findByIdAndDelete(job.documentId);
        }

        // Successfully pushed to cloud, remove from local queue
        sqliteDb.prepare('DELETE FROM sync_queue WHERE id = ?').run(job.id);
        processedCount++;
      } catch (err) {
        console.error(`[Sync Engine] Error processing job ${job.id}:`, err);
        // We leave it in the queue to retry later
      }
    }

    console.log(`[Sync Engine] Successfully pushed ${processedCount} changes to cloud.`);
    isSyncing = false;
    return { status: 'success', processed: processedCount };
  } catch (error) {
    console.error('[Sync Engine] Critical failure:', error);
    isSyncing = false;
    return { status: 'error', error: error.message };
  }
}

/**
 * Pulls remote changes from MongoDB down to local SQLite.
 * Useful if the owner updates products from a remote web dashboard.
 */
export async function performDownsync() {
  try {
    await dbConnect();
    
    // Use the latest updatedAt from the local SQLite database as the cursor
    const lastLocalProduct = sqliteDb.prepare('SELECT updatedAt FROM products ORDER BY updatedAt DESC LIMIT 1').get();
    let lastUpdate;
    if (lastLocalProduct && lastLocalProduct.updatedAt) {
      // Add 1 millisecond so we don't refetch the exact same product if timestamps exactly match
      lastUpdate = new Date(new Date(lastLocalProduct.updatedAt).getTime() + 1);
    } else {
      // If the local database is completely empty, fallback to fetching all, or practically a long time ago
      lastUpdate = new Date(0); 
    }

    const remoteProducts = await Product.find({ updatedAt: { $gte: lastUpdate } }).lean();

    if (remoteProducts.length === 0) return { synced: 0 };

    const updateProd = sqliteDb.prepare(`
      INSERT INTO products (_id, name, sku, barcode, description, price, purchasePrice, stock, minStock, categoryId, subCategory, supplierId, images, fabric, colour, sareeType, brand, design, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(_id) DO UPDATE SET
        name=excluded.name, sku=excluded.sku, barcode=excluded.barcode, description=excluded.description,
        price=excluded.price, purchasePrice=excluded.purchasePrice, stock=excluded.stock, minStock=excluded.minStock,
        categoryId=excluded.categoryId, subCategory=excluded.subCategory, supplierId=excluded.supplierId,
        images=excluded.images, fabric=excluded.fabric, colour=excluded.colour, sareeType=excluded.sareeType,
        brand=excluded.brand, design=excluded.design, status=excluded.status, updatedAt=excluded.updatedAt
    `);

    let count = 0;
    sqliteDb.transaction(() => {
      for (const rp of remoteProducts) {
        updateProd.run(
          rp._id.toString(), rp.name, rp.sku, rp.barcode, rp.description, rp.price, rp.purchasePrice,
          rp.stock, rp.minStock, rp.categoryId?.toString(), rp.subCategory, rp.supplierId?.toString(),
          JSON.stringify(rp.images || []), rp.fabric, rp.colour, rp.sareeType, rp.brand, rp.design,
          rp.status, rp.createdAt?.toISOString(), rp.updatedAt?.toISOString()
        );
        count++;
      }
    })();

    console.log(`[Sync Engine] Successfully pulled ${count} products from cloud.`);
    return { synced: count };
  } catch (error) {
    console.error('[Sync Engine] Downsync failed:', error);
    return { error: error.message };
  }
}
