import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';

/**
 * Generate a MongoDB-compatible 24-character hex ObjectId.
 */
export function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Determine the absolute path for the SQLite database.
 * In development, we use `.data` in the project root.
 * In production (Electron), we use the appData path passed via env variable,
 * or fallback to the user's home directory.
 */
function getDbPath() {
  if (process.env.SQLITE_DB_PATH) {
    return process.env.SQLITE_DB_PATH;
  }
  
  const isDev = process.env.NODE_ENV !== 'production';
  if (isDev) {
    const dataDir = path.join(process.cwd(), '.data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'kajri-pos.db');
  }

  if (process.env.VERCEL) {
    return '/tmp/kajri-pos.db';
  }

  // Fallback for production if env is somehow missing
  const fallbackDir = path.join(os.homedir(), '.kajri-pos');
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  return path.join(fallbackDir, 'kajri-pos.db');
}

const dbPath = getDbPath();

// Cache the connection on `global` the same way db.js caches its Mongoose
// connection — without this, every `next dev` hot-module-reload of a file
// that imports this module re-executes it, opening another better-sqlite3
// handle on the same WAL-mode file without closing the previous one, which
// leaks file descriptors and can eventually produce intermittent
// "SQLITE_BUSY: database is locked" errors during a long dev session.
let db = global.__kajriSqliteDb;
if (!db) {
  console.log(`[SQLite] Initializing local database at: ${dbPath}`);
  db = new Database(dbPath, {
    verbose: process.env.DEBUG_SQL ? console.log : null
  });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  global.__kajriSqliteDb = db;
}

/**
 * Initialize all schemas
 */
function initializeSchemas() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
      collectionName TEXT NOT NULL,
      documentId TEXT NOT NULL,
      payload TEXT, -- JSON string of the document or update fields
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      description TEXT,
      price REAL,
      purchasePrice REAL,
      stock INTEGER DEFAULT 0,
      minStock INTEGER DEFAULT 5,
      categoryId TEXT,
      subCategory TEXT,
      supplierId TEXT,
      images TEXT, -- JSON array
      fabric TEXT,
      colour TEXT,
      sareeType TEXT,
      brand TEXT,
      design TEXT,
      status TEXT DEFAULT 'Active',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobileNumber TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      pincode TEXT,
      outstandingBalance REAL DEFAULT 0,
      totalPurchases REAL DEFAULT 0,
      gstin TEXT,
      customerType TEXT DEFAULT 'Retail',
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      contactNumber TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      city TEXT,
      gstin TEXT,
      payableBalance REAL DEFAULT 0,
      outstandingBalance REAL DEFAULT 0,
      purchaseHistory REAL DEFAULT 0,
      bankName TEXT,
      accountNumber TEXT,
      ifscCode TEXT,
      upiId TEXT,
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS invoices (
      _id TEXT PRIMARY KEY,
      invoiceNumber TEXT UNIQUE NOT NULL,
      idempotencyKey TEXT,
      customerId TEXT,
      items TEXT NOT NULL, -- JSON array
      subTotal REAL DEFAULT 0,
      taxTotal REAL DEFAULT 0,
      discountTotal REAL DEFAULT 0,
      grandTotal REAL DEFAULT 0,
      paymentMethod TEXT NOT NULL,
      amountPaid REAL NOT NULL,
      balance REAL DEFAULT 0,
      status TEXT DEFAULT 'Completed',
      returnReason TEXT,
      refundTotal REAL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      _id TEXT PRIMARY KEY,
      date DATETIME NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      paymentMethod TEXT DEFAULT 'Cash',
      description TEXT,
      referenceNo TEXT,
      receiptImage TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
      _id TEXT PRIMARY KEY,
      supplierId TEXT,
      invoiceNumber TEXT,
      date DATETIME,
      items TEXT NOT NULL, -- JSON array
      totalAmount REAL DEFAULT 0,
      status TEXT DEFAULT 'Completed',
      notes TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      _id TEXT PRIMARY KEY,
      entityType TEXT, -- 'POSCustomer', 'Supplier'
      entityId TEXT,
      transactionType TEXT NOT NULL, -- 'Debit', 'Credit'
      amount REAL NOT NULL,
      description TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_accounts (
      _id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      accountNo TEXT,
      ifsc TEXT,
      openingBalance REAL DEFAULT 0,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      _id TEXT PRIMARY KEY,
      bankAccountId TEXT,
      type TEXT NOT NULL, -- 'in' | 'out'
      amount REAL NOT NULL,
      description TEXT,
      category TEXT DEFAULT 'Manual',
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cash_transactions (
      _id TEXT PRIMARY KEY,
      type TEXT NOT NULL, -- 'in' | 'out'
      amount REAL NOT NULL,
      category TEXT DEFAULT 'Other',
      description TEXT,
      date DATETIME DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      _id TEXT PRIMARY KEY,
      storeName TEXT,
      phone TEXT,
      address TEXT,
      email TEXT,
      gstin TEXT,
      invoicePrefix TEXT,
      defaultTaxRate REAL,
      terms TEXT,
      pageSize TEXT,
      printerName TEXT,
      autoPrint INTEGER DEFAULT 0, -- 0 for false, 1 for true
      mongoSyncUri TEXT, -- this device's MongoDB connection string for cloud sync; never leaves this machine
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  migrateSchema();
}

/**
 * `CREATE TABLE IF NOT EXISTS` above only creates tables that don't exist yet
 * — it never adds a newly-introduced column to an already-existing database
 * from an earlier install. This adds any such columns (and safe indexes)
 * after the fact, each independently guarded so one failure (e.g. a unique
 * index that can't be created yet because older data already has
 * duplicates) doesn't stop the rest of the migration or crash startup.
 */
function migrateSchema() {
  const hasColumn = (table, column) =>
    db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);

  const steps = [
    () => { if (!hasColumn('invoices', 'idempotencyKey')) db.exec('ALTER TABLE invoices ADD COLUMN idempotencyKey TEXT'); },
    () => { if (!hasColumn('purchases', 'amountPaid')) db.exec('ALTER TABLE purchases ADD COLUMN amountPaid REAL DEFAULT 0'); },
    () => { if (!hasColumn('settings', 'mongoSyncUri')) db.exec('ALTER TABLE settings ADD COLUMN mongoSyncUri TEXT'); },
    // Partial unique indexes — safe to (re)create on every boot; only ever
    // reject an insert going forward, never destructive to existing rows.
    () => db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_idempotency ON invoices(idempotencyKey) WHERE idempotencyKey IS NOT NULL`),
    () => db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_mobile ON customers(mobileNumber) WHERE mobileNumber IS NOT NULL AND mobileNumber != ''`),
    () => db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_sku ON products(sku) WHERE sku IS NOT NULL AND sku != ''`),
    () => db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode) WHERE barcode IS NOT NULL AND barcode != ''`),
  ];

  for (const step of steps) {
    try {
      step();
    } catch (err) {
      // Most likely cause: pre-existing duplicate data blocking a unique
      // index. Log it so it's discoverable, but never block app startup.
      console.error('[SQLite] Schema migration step failed (non-fatal):', err.message);
    }
  }
}

initializeSchemas();

/**
 * Queue a mutation to be pushed to MongoDB later.
 */
export function queueSync(action, collectionName, documentId, payload = {}) {
  const stmt = db.prepare(`
    INSERT INTO sync_queue (action, collectionName, documentId, payload) 
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(action, collectionName, documentId, JSON.stringify(payload));
}

export default db;
