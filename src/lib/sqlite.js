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
console.log(`[SQLite] Initializing local database at: ${dbPath}`);

const db = new Database(dbPath, { 
  // Enable WAL mode for better concurrent performance
  verbose: process.env.DEBUG_SQL ? console.log : null 
});

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

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
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
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
