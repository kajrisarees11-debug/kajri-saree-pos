/**
 * offlineSync.js
 * 
 * IndexedDB-based offline queue for Kajri POS.
 * Handles:
 *   - Product caching (so barcode lookup works offline)
 *   - Offline invoice queuing (bills created while internet is down)
 *   - Auto-sync trigger when the device comes back online
 */

import { openDB } from 'idb';

const DB_NAME = 'kajri_pos_offline';
const DB_VERSION = 2; // bump version to trigger upgrade for new stores

// All stores (tables) in IndexedDB
const STORES = {
  PRODUCTS: 'products_cache',
  CUSTOMERS: 'customers_cache',
  SUPPLIERS: 'suppliers_cache',
  EXPENSES: 'expenses_cache',
  PURCHASES: 'purchases_cache',
  INVOICES: 'invoices_cache',
  OFFLINE_INVOICES: 'offline_invoices',
};

/**
 * Open (or create) the IndexedDB database.
 */
function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Products cache: keyed by _id, with barcode index for fast lookup
      if (!db.objectStoreNames.contains(STORES.PRODUCTS)) {
        const productStore = db.createObjectStore(STORES.PRODUCTS, { keyPath: '_id' });
        productStore.createIndex('barcode', 'barcode', { unique: false });
        productStore.createIndex('sku', 'sku', { unique: false });
        productStore.createIndex('name', 'name', { unique: false });
      }

      // Customers cache: keyed by _id
      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        db.createObjectStore(STORES.CUSTOMERS, { keyPath: '_id' });
      }

      // Suppliers cache
      if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
        db.createObjectStore(STORES.SUPPLIERS, { keyPath: '_id' });
      }

      // Expenses cache
      if (!db.objectStoreNames.contains(STORES.EXPENSES)) {
        db.createObjectStore(STORES.EXPENSES, { keyPath: '_id' });
      }

      // Purchases cache
      if (!db.objectStoreNames.contains(STORES.PURCHASES)) {
        db.createObjectStore(STORES.PURCHASES, { keyPath: '_id' });
      }

      // Invoices/Sales cache
      if (!db.objectStoreNames.contains(STORES.INVOICES)) {
        db.createObjectStore(STORES.INVOICES, { keyPath: '_id' });
      }

      // Offline invoices queue: auto-increment key
      if (!db.objectStoreNames.contains(STORES.OFFLINE_INVOICES)) {
        const invoiceStore = db.createObjectStore(STORES.OFFLINE_INVOICES, {
          keyPath: 'localId',
          autoIncrement: true,
        });
        invoiceStore.createIndex('synced', 'synced', { unique: false });
        invoiceStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    },
  });
}

// ─────────────────────────────────────────────
// PRODUCT CACHE
// ─────────────────────────────────────────────

/**
 * Cache products fetched from the server into IndexedDB.
 * @param {Array} products - Array of product objects from the API
 */
export async function cacheProducts(products) {
  const db = await getDB();
  const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
  for (const product of products) {
    await tx.store.put(product);
  }
  await tx.done;
}

/**
 * Get all cached products from IndexedDB.
 * @returns {Array} - Array of cached product objects
 */
export async function getCachedProducts() {
  const db = await getDB();
  return db.getAll(STORES.PRODUCTS);
}

/**
 * Look up a product by barcode from the local cache.
 * @param {string} barcode 
 * @returns {Object|null} - Product or null
 */
export async function getCachedProductByBarcode(barcode) {
  const db = await getDB();
  const index = db.transaction(STORES.PRODUCTS, 'readonly').store.index('barcode');
  return index.get(barcode);
}

/**
 * Search cached products by name or SKU.
 * @param {string} query 
 * @returns {Array}
 */
export async function searchCachedProducts(query) {
  const db = await getDB();
  const all = await db.getAll(STORES.PRODUCTS);
  const q = query.toLowerCase();
  return all.filter(
    (p) =>
      p.name?.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.includes(q)
  );
}

// ─────────────────────────────────────────────
// CUSTOMER CACHE
// ─────────────────────────────────────────────

/**
 * Cache customers into IndexedDB.
 * @param {Array} customers
 */
export async function cacheCustomers(customers) {
  const db = await getDB();
  const tx = db.transaction(STORES.CUSTOMERS, 'readwrite');
  for (const c of customers) {
    await tx.store.put(c);
  }
  await tx.done;
}

/**
 * Get all cached customers.
 * @returns {Array}
 */
export async function getCachedCustomers() {
  const db = await getDB();
  return db.getAll(STORES.CUSTOMERS);
}

// ─────────────────────────────────────────────
// SUPPLIERS CACHE
// ─────────────────────────────────────────────

export async function cacheSuppliers(suppliers) {
  const db = await getDB();
  const tx = db.transaction(STORES.SUPPLIERS, 'readwrite');
  await tx.store.clear();
  for (const s of suppliers) await tx.store.put(s);
  await tx.done;
}

export async function getCachedSuppliers() {
  const db = await getDB();
  return db.getAll(STORES.SUPPLIERS);
}

// ─────────────────────────────────────────────
// EXPENSES CACHE
// ─────────────────────────────────────────────

export async function cacheExpenses(expenses) {
  const db = await getDB();
  const tx = db.transaction(STORES.EXPENSES, 'readwrite');
  await tx.store.clear();
  for (const e of expenses) await tx.store.put(e);
  await tx.done;
}

export async function getCachedExpenses() {
  const db = await getDB();
  return db.getAll(STORES.EXPENSES);
}

// ─────────────────────────────────────────────
// PURCHASES CACHE
// ─────────────────────────────────────────────

export async function cachePurchases(purchases) {
  const db = await getDB();
  const tx = db.transaction(STORES.PURCHASES, 'readwrite');
  await tx.store.clear();
  for (const p of purchases) await tx.store.put(p);
  await tx.done;
}

export async function getCachedPurchases() {
  const db = await getDB();
  return db.getAll(STORES.PURCHASES);
}

// ─────────────────────────────────────────────
// INVOICES / SALES CACHE
// ─────────────────────────────────────────────

export async function cacheInvoices(invoices) {
  const db = await getDB();
  const tx = db.transaction(STORES.INVOICES, 'readwrite');
  await tx.store.clear();
  for (const inv of invoices) await tx.store.put(inv);
  await tx.done;
}

export async function getCachedInvoices() {
  const db = await getDB();
  return db.getAll(STORES.INVOICES);
}

// ─────────────────────────────────────────────
// OFFLINE INVOICE QUEUE
// ─────────────────────────────────────────────

/**
 * Save an invoice to the offline queue when the device is disconnected.
 * @param {Object} invoice - The full invoice payload (same shape as the online API)
 * @returns {number} - The localId assigned to this offline invoice
 */
export async function saveOfflineInvoice(invoice) {
  const db = await getDB();
  const record = {
    ...invoice,
    synced: false,
    offlineMode: true,
    createdAt: new Date().toISOString(),
  };
  const localId = await db.add(STORES.OFFLINE_INVOICES, record);
  return localId;
}

/**
 * Get all pending (unsynced) offline invoices.
 * @returns {Array}
 */
export async function getPendingOfflineInvoices() {
  const db = await getDB();
  const all = await db.getAll(STORES.OFFLINE_INVOICES);
  return all.filter((inv) => !inv.synced);
}

/**
 * Mark invoices as synced by their localIds.
 * @param {Array<number>} localIds
 */
export async function markInvoicesSynced(localIds) {
  const db = await getDB();
  const tx = db.transaction(STORES.OFFLINE_INVOICES, 'readwrite');
  for (const localId of localIds) {
    const record = await tx.store.get(localId);
    if (record) {
      await tx.store.put({ ...record, synced: true });
    }
  }
  await tx.done;
}

/**
 * Count how many invoices are pending sync.
 * @returns {number}
 */
export async function getPendingInvoiceCount() {
  const pending = await getPendingOfflineInvoices();
  return pending.length;
}

// ─────────────────────────────────────────────
// SYNC ENGINE
// ─────────────────────────────────────────────

/**
 * Push all pending offline invoices to the server.
 * Called automatically when the device reconnects to the internet.
 *
 * Only marks an invoice as synced once the server has confirmed THAT SPECIFIC
 * invoice succeeded — a batch can partially fail (e.g. one malformed item),
 * and previously the whole batch was marked synced off the coarse top-level
 * `success` flag, silently discarding any invoice that failed alongside
 * successful ones in the same batch.
 * @returns {{ synced: number, failed: number, errors?: Array }}
 */
export async function syncOfflineInvoices() {
  const pending = await getPendingOfflineInvoices();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  try {
    const res = await fetch('/api/invoices/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoices: pending }),
    });

    if (!res.ok) {
      console.error('[OfflineSync] Server rejected sync batch:', await res.text());
      return { synced: 0, failed: pending.length };
    }

    const data = await res.json();

    if (!data.success) {
      console.error('[OfflineSync] Server reported failure for the whole batch:', data.error);
      return { synced: 0, failed: pending.length };
    }

    const failedInvoiceNumbers = new Set((data.errors || []).map((e) => e.invoiceNumber));
    const succeeded = pending.filter((i) => !failedInvoiceNumbers.has(i.invoiceNumber));
    const failed = pending.filter((i) => failedInvoiceNumbers.has(i.invoiceNumber));

    if (succeeded.length > 0) {
      await markInvoicesSynced(succeeded.map((i) => i.localId));
    }
    if (failed.length > 0) {
      console.error(`[OfflineSync] ${failed.length} invoice(s) failed to sync and remain queued for retry:`, data.errors);
    }

    console.log(`[OfflineSync] ✅ Synced ${succeeded.length}/${pending.length} offline invoices to the cloud.`);
    return { synced: succeeded.length, failed: failed.length, errors: data.errors };
  } catch (err) {
    console.error('[OfflineSync] Sync failed:', err);
    return { synced: 0, failed: pending.length };
  }
}
