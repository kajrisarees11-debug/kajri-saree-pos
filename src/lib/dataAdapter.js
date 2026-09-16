/**
 * Kajri POS — Universal Database Adapter
 *
 * Automatically switches the underlying database depending on where the app runs:
 *   - Vercel / online  → MongoDB (via Mongoose) — full cloud read/write
 *   - Desktop / dev    → SQLite (better-sqlite3) — offline-first, syncs to MongoDB
 *
 * Usage in API routes:
 *   import { adapter } from '@/lib/dataAdapter';
 *   const { products, customers, ... } = adapter;
 *   const all = await products.getAll({ search: 'silk' });
 */

import dbConnect from '@/lib/db';
import crypto from 'crypto';

// ─── Detect environment ────────────────────────────────────────────────────────
export const IS_CLOUD = !!(process.env.VERCEL || process.env.USE_MONGODB === 'true');

export function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

// ─── SQLite UPDATE column whitelist ────────────────────────────────────────────
// Column lists for each SQLite table's UPDATE statement. Without this, the SET
// clause would be built from raw client JSON keys (`Object.keys(body)`), letting
// a caller name arbitrary/internal columns or smuggle SQL fragments in as a "key".
const ALLOWED_UPDATE_FIELDS = {
  products: ['name', 'sku', 'barcode', 'description', 'price', 'purchasePrice', 'stock', 'minStock', 'categoryId', 'subCategory', 'supplierId', 'images', 'fabric', 'colour', 'sareeType', 'brand', 'design', 'status', 'updatedAt'],
  customers: ['name', 'mobileNumber', 'email', 'address', 'city', 'pincode', 'outstandingBalance', 'totalPurchases', 'gstin', 'customerType', 'updatedAt'],
  suppliers: ['name', 'contactNumber', 'phone', 'email', 'address', 'city', 'gstin', 'payableBalance', 'outstandingBalance', 'purchaseHistory', 'bankName', 'accountNumber', 'ifscCode', 'upiId', 'notes', 'updatedAt'],
  invoices: ['invoiceNumber', 'customerId', 'items', 'subTotal', 'taxTotal', 'discountTotal', 'grandTotal', 'paymentMethod', 'amountPaid', 'balance', 'status', 'returnReason', 'refundTotal', 'updatedAt'],
  purchases: ['supplierId', 'invoiceNumber', 'date', 'items', 'totalAmount', 'status', 'notes', 'updatedAt'],
  settings: ['storeName', 'phone', 'address', 'email', 'gstin', 'invoicePrefix', 'defaultTaxRate', 'terms', 'pageSize', 'printerName', 'autoPrint', 'updatedAt'],
};

// Escapes regex metacharacters in user-supplied search text before it's used
// to build a MongoDB $or/RegExp query — an unescaped pattern like `(a+)+$` can
// trigger catastrophic backtracking (ReDoS) against every matching document.
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function pickAllowedFields(table, obj) {
  const allowed = ALLOWED_UPDATE_FIELDS[table];
  const out = {};
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) out[key] = obj[key];
  }
  return out;
}

// ─── Lazy imports ──────────────────────────────────────────────────────────────
let _sqliteDb = null;
function getSqlite() {
  if (!_sqliteDb) {
    // Dynamic require so Vercel never touches this import path
    _sqliteDb = require('@/lib/sqlite').default;
  }
  return _sqliteDb;
}

async function getMongo() {
  await dbConnect();
  const [
    { default: Product },
    { default: POSCustomer },
    { default: Supplier },
    { default: POSInvoice },
    { default: Expense },
    { default: Purchase },
    { default: Ledger },
    { default: StoreConfig },
    { default: BankAccount },
    { default: BankTransaction },
    { default: CashTransaction },
  ] = await Promise.all([
    import('@/lib/models/Product'),
    import('@/lib/models/POSCustomer'),
    import('@/lib/models/Supplier'),
    import('@/lib/models/POSInvoice'),
    import('@/lib/models/Expense'),
    import('@/lib/models/Purchase'),
    import('@/lib/models/Ledger'),
    import('@/lib/models/StoreConfig'),
    import('@/lib/models/BankAccount'),
    import('@/lib/models/BankTransaction'),
    import('@/lib/models/CashTransaction'),
  ]);
  return { Product, POSCustomer, Supplier, POSInvoice, Expense, Purchase, Ledger, StoreConfig, BankAccount, BankTransaction, CashTransaction };
}

// ─── Helper: convert Mongoose doc to plain object ─────────────────────────────
function toPlain(doc) {
  if (!doc) return null;
  const obj = doc.toObject ? doc.toObject() : { ...doc };
  if (obj._id) obj._id = obj._id.toString();
  return obj;
}

// ─── Products ─────────────────────────────────────────────────────────────────
export const products = {
  async getAll({ search, barcode } = {}) {
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      let query = {};
      if (barcode) query.barcode = barcode;
      else if (search) query.$or = [
        { name: new RegExp(escapeRegex(search), 'i') },
        { sku: new RegExp(escapeRegex(search), 'i') },
        { barcode: new RegExp(escapeRegex(search), 'i') },
      ];
      const docs = await Product.find(query).sort({ createdAt: -1 }).limit(50).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString(), images: d.images || [] }));
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM products';
      const p = [];
      if (barcode) { q += ' WHERE barcode = ?'; p.push(barcode); }
      else if (search) { q += ' WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ?'; p.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      q += ' ORDER BY createdAt DESC LIMIT 50';
      return db.prepare(q).all(...p).map(r => ({ ...r, images: r.images ? JSON.parse(r.images) : [] }));
    }
  },

  async getById(id) {
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      const doc = await Product.findById(id).lean();
      return doc ? { ...doc, _id: doc._id.toString(), images: doc.images || [] } : null;
    } else {
      const db = getSqlite();
      const r = db.prepare('SELECT * FROM products WHERE _id = ?').get(id);
      return r ? { ...r, images: r.images ? JSON.parse(r.images) : [] } : null;
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      const doc = await Product.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, name: body.name || '', sku: body.sku || null, barcode: body.barcode || null,
        description: body.description || null, price: body.price || 0,
        purchasePrice: body.purchasePrice || 0, stock: body.stock || 0, minStock: body.minStock || 5,
        categoryId: body.category || body.categoryId || null, subCategory: body.subCategory || null,
        supplierId: body.supplierId || null, images: JSON.stringify(body.images || []),
        fabric: body.fabric || null, colour: body.colour || null, sareeType: body.sareeType || null,
        brand: body.brand || null, design: body.design || null, status: body.status || 'Active',
        createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'products', _id, data);
      })();
      return { ...data, images: body.images || [] };
    }
  },

  async update(id, body) {
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      const update = { ...body, updatedAt: now };
      delete update._id;
      const doc = await Product.findByIdAndUpdate(id, update, { new: true }).lean();
      return doc ? { ...doc, _id: doc._id.toString(), images: doc.images || [] } : null;
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const raw = { ...body };
      if (raw.images) raw.images = JSON.stringify(raw.images);
      if (raw.category) { raw.categoryId = raw.category; delete raw.category; }
      raw.updatedAt = now;
      const updateData = pickAllowedFields('products', raw);
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      db.transaction(() => {
        db.prepare(`UPDATE products SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), id);
        queueSync('UPDATE', 'products', id, updateData);
      })();
      const r = db.prepare('SELECT * FROM products WHERE _id = ?').get(id);
      return r ? { ...r, images: r.images ? JSON.parse(r.images) : [] } : null;
    }
  },

  async bulkUpdateBarcodes(items) {
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      const mongoose = (await import('mongoose')).default;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          for (const p of items) {
            await Product.findByIdAndUpdate(p._id, { barcode: p.barcode, updatedAt: now }, { session });
          }
        });
      } finally {
        await session.endSession();
      }
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      db.transaction(() => {
        for (const p of items) {
          db.prepare('UPDATE products SET barcode = ?, updatedAt = ? WHERE _id = ?').run(p.barcode, now, p._id);
          queueSync('UPDATE', 'products', p._id, { barcode: p.barcode, updatedAt: now });
        }
      })();
    }
  },

  async delete(id) {
    if (IS_CLOUD) {
      const { Product } = await getMongo();
      await Product.findByIdAndDelete(id);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      db.transaction(() => {
        db.prepare('DELETE FROM products WHERE _id = ?').run(id);
        queueSync('DELETE', 'products', id, {});
      })();
    }
  },
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = {
  async getAll({ search, mobile } = {}) {
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      let query = {};
      if (mobile) query.mobileNumber = mobile;
      else if (search) query.$or = [{ name: new RegExp(escapeRegex(search), 'i') }, { mobileNumber: new RegExp(escapeRegex(search), 'i') }];
      const docs = await POSCustomer.find(query).sort({ createdAt: -1 }).limit(50).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM customers'; const p = [];
      if (mobile) { q += ' WHERE mobileNumber = ?'; p.push(mobile); }
      else if (search) { q += ' WHERE name LIKE ? OR mobileNumber LIKE ?'; p.push(`%${search}%`, `%${search}%`); }
      q += ' ORDER BY createdAt DESC LIMIT 50';
      return db.prepare(q).all(...p);
    }
  },

  async getById(id) {
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      const doc = await POSCustomer.findById(id).lean();
      return doc ? { ...doc, _id: doc._id.toString() } : null;
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM customers WHERE _id = ?').get(id) || null;
    }
  },

  async findByMobile(mobile) {
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      const doc = await POSCustomer.findOne({ mobileNumber: mobile }).lean();
      return doc ? { ...doc, _id: doc._id.toString() } : null;
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM customers WHERE mobileNumber = ?').get(mobile) || null;
    }
  },

  // Self-heals the check-then-act race in POST /api/customers (findByMobile
  // then create): if two requests for the same new mobile number land at
  // once, the unique index rejects the loser here, and instead of a raw
  // constraint-violation error we just return the winner's row — the same
  // outcome the route was already trying to produce via its upfront check.
  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      try {
        const doc = await POSCustomer.create({ ...body, _id, createdAt: now, updatedAt: now });
        return toPlain(doc);
      } catch (err) {
        if (err.code === 11000 && body.mobileNumber) {
          const existing = await this.findByMobile(body.mobileNumber);
          if (existing) return existing;
        }
        throw err;
      }
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, name: body.name || '', mobileNumber: body.mobileNumber || null,
        email: body.email || null, address: body.address || null, city: body.city || null,
        pincode: body.pincode || null, outstandingBalance: body.outstandingBalance || 0,
        totalPurchases: body.totalPurchases || 0, gstin: body.gstin || null,
        customerType: body.customerType || 'Retail', createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      try {
        db.transaction(() => {
          db.prepare(`INSERT INTO customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
          queueSync('INSERT', 'customers', _id, data);
        })();
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && body.mobileNumber) {
          const existing = await this.findByMobile(body.mobileNumber);
          if (existing) return existing;
        }
        throw err;
      }
      return data;
    }
  },

  async update(id, body) {
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      const update = { ...body, updatedAt: now }; delete update._id;
      const doc = await POSCustomer.findByIdAndUpdate(id, update, { new: true }).lean();
      return doc ? { ...doc, _id: doc._id.toString() } : null;
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const updateData = pickAllowedFields('customers', { ...body, updatedAt: now });
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      db.transaction(() => {
        db.prepare(`UPDATE customers SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), id);
        queueSync('UPDATE', 'customers', id, updateData);
      })();
      return db.prepare('SELECT * FROM customers WHERE _id = ?').get(id) || null;
    }
  },
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = {
  async getAll({ search } = {}) {
    if (IS_CLOUD) {
      const { Supplier } = await getMongo();
      let query = {};
      if (search) query.$or = [{ name: new RegExp(escapeRegex(search), 'i') }, { contactNumber: new RegExp(escapeRegex(search), 'i') }];
      const docs = await Supplier.find(query).sort({ createdAt: -1 }).limit(50).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM suppliers'; const p = [];
      if (search) { q += ' WHERE name LIKE ? OR contactNumber LIKE ?'; p.push(`%${search}%`, `%${search}%`); }
      q += ' ORDER BY createdAt DESC LIMIT 50';
      return db.prepare(q).all(...p);
    }
  },

  async getById(id) {
    if (IS_CLOUD) {
      const { Supplier } = await getMongo();
      const doc = await Supplier.findById(id).lean();
      return doc ? { ...doc, _id: doc._id.toString() } : null;
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM suppliers WHERE _id = ?').get(id) || null;
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Supplier } = await getMongo();
      const doc = await Supplier.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, name: body.name || '', contactNumber: body.contactNumber || null,
        phone: body.phone || null, email: body.email || null, address: body.address || null,
        city: body.city || null, gstin: body.gstin || null, payableBalance: body.payableBalance || 0,
        outstandingBalance: body.outstandingBalance || 0, purchaseHistory: body.purchaseHistory || 0,
        bankName: body.bankName || null, accountNumber: body.accountNumber || null,
        ifscCode: body.ifscCode || null, upiId: body.upiId || null, notes: body.notes || null,
        createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO suppliers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'suppliers', _id, data);
      })();
      return data;
    }
  },

  async update(id, body) {
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Supplier } = await getMongo();
      const update = { ...body, updatedAt: now }; delete update._id;
      const doc = await Supplier.findByIdAndUpdate(id, update, { new: true }).lean();
      return doc ? { ...doc, _id: doc._id.toString() } : null;
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const updateData = pickAllowedFields('suppliers', { ...body, updatedAt: now });
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      db.transaction(() => {
        db.prepare(`UPDATE suppliers SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), id);
        queueSync('UPDATE', 'suppliers', id, updateData);
      })();
      return db.prepare('SELECT * FROM suppliers WHERE _id = ?').get(id) || null;
    }
  },
};

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoices = {
  async getAll({ page = 1, limit = 20, status, search } = {}) {
    const skip = (page - 1) * limit;
    if (IS_CLOUD) {
      const { POSInvoice } = await getMongo();
      let query = {};
      if (status) query.status = status;
      if (search) query.$or = [{ invoiceNumber: new RegExp(escapeRegex(search), 'i') }];
      const [docs, total] = await Promise.all([
        POSInvoice.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        POSInvoice.countDocuments(query),
      ]);
      return {
        data: docs.map(d => ({ ...d, _id: d._id.toString(), items: d.items || [] })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM invoices'; const p = [];
      const conditions = [];
      if (status) { conditions.push('status = ?'); p.push(status); }
      if (search) { conditions.push('invoiceNumber LIKE ?'); p.push(`%${search}%`); }
      if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) as count FROM invoices${conditions.length ? ' WHERE ' + conditions.join(' AND ') : ''}`).get(...p)?.count || 0;
      q += ' ORDER BY createdAt DESC LIMIT ? OFFSET ?';
      const rows = db.prepare(q).all(...p, limit, skip);
      return {
        data: rows.map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] })),
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      };
    }
  },

  async getById(id) {
    if (IS_CLOUD) {
      const { POSInvoice } = await getMongo();
      const doc = await POSInvoice.findById(id).lean();
      return doc ? { ...doc, _id: doc._id.toString(), items: doc.items || [] } : null;
    } else {
      const db = getSqlite();
      const r = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
      return r ? { ...r, items: r.items ? JSON.parse(r.items) : [] } : null;
    }
  },

  // If body.idempotencyKey is present and an invoice with that key already
  // exists, returns the EXISTING invoice (isNew: false) instead of creating
  // a duplicate — protects against a retried/duplicated submission of the
  // same checkout (e.g. the POS lost the response to an online create that
  // actually succeeded, and queued what it thought was a fresh offline
  // copy). Callers MUST check `isNew` before applying any side effect that
  // should only happen once per sale (stock deduction, customer balance).
  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();

    if (IS_CLOUD) {
      const { POSInvoice } = await getMongo();
      if (body.idempotencyKey) {
        const existing = await POSInvoice.findOne({ idempotencyKey: body.idempotencyKey }).lean();
        if (existing) return { data: { ...existing, _id: existing._id.toString(), items: existing.items || [] }, isNew: false };
      }
      try {
        const doc = await POSInvoice.create({ ...body, _id, createdAt: now, updatedAt: now });
        return { data: toPlain(doc), isNew: true };
      } catch (err) {
        // Race: two concurrent requests with the same idempotencyKey both
        // passed the check above. The unique index rejects the loser here —
        // return the winner's row instead of a spurious 400.
        if (err.code === 11000 && body.idempotencyKey) {
          const existing = await POSInvoice.findOne({ idempotencyKey: body.idempotencyKey }).lean();
          if (existing) return { data: { ...existing, _id: existing._id.toString(), items: existing.items || [] }, isNew: false };
        }
        throw err;
      }
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');

      if (body.idempotencyKey) {
        const existing = db.prepare('SELECT * FROM invoices WHERE idempotencyKey = ?').get(body.idempotencyKey);
        if (existing) return { data: { ...existing, items: existing.items ? JSON.parse(existing.items) : [] }, isNew: false };
      }

      const data = {
        _id, invoiceNumber: body.invoiceNumber, idempotencyKey: body.idempotencyKey || null,
        customerId: body.customerId || null,
        items: JSON.stringify(body.items || []), subTotal: body.subTotal || 0,
        taxTotal: body.taxTotal || 0, discountTotal: body.discountTotal || 0,
        grandTotal: body.grandTotal || 0, paymentMethod: body.paymentMethod || 'Cash',
        amountPaid: body.amountPaid || 0, balance: body.balance || 0,
        status: body.status || 'Completed', createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      try {
        db.transaction(() => {
          db.prepare(`INSERT INTO invoices (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
          queueSync('INSERT', 'invoices', _id, data);
        })();
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && body.idempotencyKey) {
          const existing = db.prepare('SELECT * FROM invoices WHERE idempotencyKey = ?').get(body.idempotencyKey);
          if (existing) return { data: { ...existing, items: existing.items ? JSON.parse(existing.items) : [] }, isNew: false };
        }
        throw err;
      }
      return { data: { ...data, items: body.items || [] }, isNew: true };
    }
  },

  // Full POS checkout: create the invoice, deduct stock, and (for an Udhaar
  // or partially-paid sale) update the customer's balance + ledger — all in
  // ONE atomic transaction per backend, so a mid-way failure (e.g. a bad
  // productId) can't leave an orphaned invoice with no stock/ledger effect.
  // Idempotent the same way create() is: a repeat call with the same
  // idempotencyKey returns the original invoice (isNew: false) and applies
  // no side effects again.
  async createWithEffects(body) {
    const now = new Date().toISOString();
    const items = Array.isArray(body.items) ? body.items : [];
    let balanceAdded = 0;
    if (body.customerId) {
      const grandTotal = body.grandTotal || 0;
      // Number(undefined) is NaN, not 0 — without this, an omitted amountPaid
      // made `undefined < grandTotal` evaluate to false in JS, silently
      // treating an unpaid sale as fully paid. A small epsilon avoids a
      // phantom paise-level Udhaar debt from float rounding (e.g.
      // 349.65 vs 349.6499999999999) on an otherwise fully-paid sale.
      const amountPaid = Number(body.amountPaid) || 0;
      if (body.paymentMethod === 'Udhaar') balanceAdded = grandTotal;
      else if (amountPaid < grandTotal - 0.01) balanceAdded = grandTotal - amountPaid;
    }

    if (IS_CLOUD) {
      const { POSInvoice, Product, POSCustomer, Ledger } = await getMongo();
      const mongoose = (await import('mongoose')).default;

      if (body.idempotencyKey) {
        const existing = await POSInvoice.findOne({ idempotencyKey: body.idempotencyKey }).lean();
        if (existing) return { data: { ...existing, _id: existing._id.toString(), items: existing.items || [] }, isNew: false };
      }

      const _id = body._id || generateObjectId();
      const session = await mongoose.startSession();
      let created;
      try {
        await session.withTransaction(async () => {
          const [doc] = await POSInvoice.create([{ ...body, _id, createdAt: now, updatedAt: now }], { session });
          created = doc;

          for (const item of items) {
            if (item.productId && item.quantity) {
              // Conditional on stock >= quantity so the update is the
              // authoritative stock-floor check under real concurrency
              // (the route's own pre-check is only advisory — a second
              // request can still race it between the check and this write).
              const updated = await Product.findOneAndUpdate(
                { _id: item.productId, stock: { $gte: item.quantity } },
                { $inc: { stock: -item.quantity }, updatedAt: now },
                { session }
              );
              if (!updated) {
                const err = new Error(`Insufficient stock for product ${item.productId}`);
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
              }
            }
          }

          if (body.customerId) {
            await POSCustomer.findByIdAndUpdate(
              body.customerId,
              { $inc: { totalPurchases: body.grandTotal || 0, outstandingBalance: balanceAdded }, updatedAt: now },
              { session }
            );
            if (balanceAdded > 0) {
              await Ledger.create([{
                _id: generateObjectId(), entityType: 'POSCustomer', entityId: body.customerId,
                transactionType: 'Debit', amount: balanceAdded,
                description: `Credit sale against Invoice ${body.invoiceNumber}`,
                date: now, createdAt: now, updatedAt: now,
              }], { session });
            }
          }
        });
      } catch (err) {
        if (err.code === 11000 && body.idempotencyKey) {
          const existing = await POSInvoice.findOne({ idempotencyKey: body.idempotencyKey }).lean();
          if (existing) { await session.endSession(); return { data: { ...existing, _id: existing._id.toString(), items: existing.items || [] }, isNew: false }; }
        }
        await session.endSession();
        throw err;
      }
      await session.endSession();
      return { data: toPlain(created), isNew: true };
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');

      if (body.idempotencyKey) {
        const existing = db.prepare('SELECT * FROM invoices WHERE idempotencyKey = ?').get(body.idempotencyKey);
        if (existing) return { data: { ...existing, items: existing.items ? JSON.parse(existing.items) : [] }, isNew: false };
      }

      const _id = body._id || generateObjectId();
      const data = {
        _id, invoiceNumber: body.invoiceNumber, idempotencyKey: body.idempotencyKey || null,
        customerId: body.customerId || null,
        items: JSON.stringify(items), subTotal: body.subTotal || 0, taxTotal: body.taxTotal || 0,
        discountTotal: body.discountTotal || 0, grandTotal: body.grandTotal || 0,
        paymentMethod: body.paymentMethod || 'Cash', amountPaid: body.amountPaid || 0,
        balance: body.balance || 0, status: body.status || 'Completed',
        createdAt: now, updatedAt: now,
      };

      try {
        db.transaction(() => {
          const cols = Object.keys(data);
          db.prepare(`INSERT INTO invoices (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(data));
          queueSync('INSERT', 'invoices', _id, data);

          // Conditional on stock >= quantity — the authoritative stock-floor
          // check; if 0 rows match, another request already took the stock,
          // so throw to roll back the whole transaction (invoice included).
          const updateStock = db.prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE _id = ? AND stock >= ?');
          for (const item of items) {
            if (item.productId && item.quantity) {
              const result = updateStock.run(item.quantity, now, item.productId, item.quantity);
              if (result.changes === 0) {
                const err = new Error(`Insufficient stock for product ${item.productId}`);
                err.code = 'INSUFFICIENT_STOCK';
                throw err;
              }
              queueSync('UPDATE', 'products', item.productId, { $inc: { stock: -item.quantity }, updatedAt: now });
            }
          }

          if (body.customerId) {
            db.prepare(`
              UPDATE customers SET totalPurchases = totalPurchases + ?,
              outstandingBalance = outstandingBalance + ?, updatedAt = ? WHERE _id = ?
            `).run(body.grandTotal || 0, balanceAdded, now, body.customerId);
            queueSync('UPDATE', 'customers', body.customerId, {
              $inc: { totalPurchases: body.grandTotal || 0, outstandingBalance: balanceAdded }, updatedAt: now
            });

            if (balanceAdded > 0) {
              const ledgerId = generateObjectId();
              const ledgerRow = {
                _id: ledgerId, entityType: 'POSCustomer', entityId: body.customerId,
                transactionType: 'Debit', amount: balanceAdded,
                description: `Credit sale against Invoice ${body.invoiceNumber}`,
                date: now, createdAt: now, updatedAt: now,
              };
              const lCols = Object.keys(ledgerRow);
              db.prepare(`INSERT INTO ledgers (${lCols.join(',')}) VALUES (${lCols.map(() => '?').join(',')})`).run(...Object.values(ledgerRow));
              queueSync('INSERT', 'ledgers', ledgerId, ledgerRow);
            }
          }
        })();
      } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT_UNIQUE' && body.idempotencyKey) {
          const existing = db.prepare('SELECT * FROM invoices WHERE idempotencyKey = ?').get(body.idempotencyKey);
          if (existing) return { data: { ...existing, items: existing.items ? JSON.parse(existing.items) : [] }, isNew: false };
        }
        throw err;
      }

      return { data: { ...data, items }, isNew: true };
    }
  },

  async update(id, body) {
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { POSInvoice } = await getMongo();
      const update = { ...body, updatedAt: now }; delete update._id;
      const doc = await POSInvoice.findByIdAndUpdate(id, update, { new: true }).lean();
      return doc ? { ...doc, _id: doc._id.toString(), items: doc.items || [] } : null;
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const raw = { ...body, updatedAt: now };
      if (raw.items) raw.items = JSON.stringify(raw.items);
      const updateData = pickAllowedFields('invoices', raw);
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      db.transaction(() => {
        db.prepare(`UPDATE invoices SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), id);
        queueSync('UPDATE', 'invoices', id, updateData);
      })();
      const r = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
      return r ? { ...r, items: r.items ? JSON.parse(r.items) : [] } : null;
    }
  },

  // Process a sales return: restore stock, reduce customer balance if Udhaar,
  // mark the invoice Returned. Shared by /api/invoices/[id]/return and the
  // legacy /api/returns endpoint so both go through the exact same logic
  // instead of one re-implementing it via a fragile self-HTTP-call.
  async processReturn(id, { items, reason, refundTotal } = {}) {
    const timestamp = new Date().toISOString();

    if (IS_CLOUD) {
      const mongoose = (await import('mongoose')).default;
      const { POSInvoice, Product, POSCustomer, Ledger } = await getMongo();

      const invoice = await POSInvoice.findById(id).lean();
      if (!invoice) { const e = new Error('Invoice not found'); e.code = 'NOT_FOUND'; throw e; }
      if (invoice.status === 'Returned') { const e = new Error('Invoice already returned'); e.code = 'ALREADY_RETURNED'; throw e; }

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              if (item.returnQty > 0 && item.productId) {
                await Product.findByIdAndUpdate(item.productId, { $inc: { stock: item.returnQty }, updatedAt: timestamp }, { session });
              }
            }
          }
          if (invoice.paymentMethod === 'Udhaar' && invoice.customerId && refundTotal > 0) {
            const customer = await POSCustomer.findById(invoice.customerId).session(session);
            if (customer) {
              customer.outstandingBalance = Math.max(0, (customer.outstandingBalance || 0) - refundTotal);
              customer.updatedAt = timestamp;
              await customer.save({ session });
            }
            // Every other balance-affecting event leaves a ledger entry —
            // this one didn't, which is exactly the kind of gap that makes
            // a ledger-derived party statement silently drift from the
            // real (customer.outstandingBalance) balance.
            await Ledger.create([{
              _id: generateObjectId(), entityType: 'POSCustomer', entityId: invoice.customerId,
              transactionType: 'Credit', amount: refundTotal,
              description: `Return against Invoice ${invoice.invoiceNumber}${reason ? ` — ${reason}` : ''}`,
              date: timestamp, createdAt: timestamp, updatedAt: timestamp,
            }], { session });
          }
          await POSInvoice.findByIdAndUpdate(id, { status: 'Returned', returnReason: reason || null, refundTotal: refundTotal || 0, updatedAt: timestamp }, { session });
        });
      } finally {
        await session.endSession();
      }

      const updated = await POSInvoice.findById(id).lean();
      return { ...updated, _id: updated._id.toString() };
    }

    const db = getSqlite();
    const { queueSync } = require('@/lib/sqlite');

    const invoice = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
    if (!invoice) { const e = new Error('Invoice not found'); e.code = 'NOT_FOUND'; throw e; }
    if (invoice.status === 'Returned') { const e = new Error('Invoice already returned'); e.code = 'ALREADY_RETURNED'; throw e; }

    db.transaction(() => {
      if (Array.isArray(items) && items.length > 0) {
        const updateStock = db.prepare('UPDATE products SET stock = stock + ?, updatedAt = ? WHERE _id = ?');
        for (const item of items) {
          if (item.returnQty > 0 && item.productId) {
            updateStock.run(item.returnQty, timestamp, item.productId);
            queueSync('UPDATE', 'products', item.productId, { $inc: { stock: item.returnQty }, updatedAt: timestamp });
          }
        }
      }
      if (invoice.paymentMethod === 'Udhaar' && invoice.customerId && refundTotal > 0) {
        db.prepare('UPDATE customers SET outstandingBalance = MAX(0, outstandingBalance - ?), updatedAt = ? WHERE _id = ?')
          .run(refundTotal, timestamp, invoice.customerId);
        queueSync('UPDATE', 'customers', invoice.customerId, { $inc: { outstandingBalance: -refundTotal }, updatedAt: timestamp });

        const ledgerId = generateObjectId();
        const ledgerRow = {
          _id: ledgerId, entityType: 'POSCustomer', entityId: invoice.customerId,
          transactionType: 'Credit', amount: refundTotal,
          description: `Return against Invoice ${invoice.invoiceNumber}${reason ? ` — ${reason}` : ''}`,
          date: timestamp, createdAt: timestamp, updatedAt: timestamp,
        };
        const lCols = Object.keys(ledgerRow);
        db.prepare(`INSERT INTO ledgers (${lCols.join(',')}) VALUES (${lCols.map(() => '?').join(',')})`).run(...Object.values(ledgerRow));
        queueSync('INSERT', 'ledgers', ledgerId, ledgerRow);
      }
      db.prepare('UPDATE invoices SET status = ?, returnReason = ?, refundTotal = ?, updatedAt = ? WHERE _id = ?')
        .run('Returned', reason || null, refundTotal || 0, timestamp, id);
      queueSync('UPDATE', 'invoices', id, { status: 'Returned', returnReason: reason || null, refundTotal: refundTotal || 0, updatedAt: timestamp });
    })();

    return db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
  },
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expenses = {
  async getAll({ from, to } = {}) {
    if (IS_CLOUD) {
      const { Expense } = await getMongo();
      let query = {};
      if (from || to) {
        query.date = {};
        if (from) query.date.$gte = new Date(from);
        if (to) query.date.$lte = new Date(to);
      }
      const docs = await Expense.find(query).sort({ date: -1 }).limit(100).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM expenses'; const p = [];
      const conditions = [];
      if (from) { conditions.push('date >= ?'); p.push(from); }
      if (to) { conditions.push('date <= ?'); p.push(to); }
      if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
      q += ' ORDER BY date DESC LIMIT 100';
      return db.prepare(q).all(...p);
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Expense } = await getMongo();
      const doc = await Expense.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, date: body.date || now, category: body.category || '',
        amount: body.amount || 0, paymentMethod: body.paymentMethod || 'Cash',
        description: body.description || null, referenceNo: body.referenceNo || null,
        receiptImage: body.receiptImage || null, createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO expenses (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'expenses', _id, data);
      })();
      return data;
    }
  },
};

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchases = {
  async getAll({ from, to } = {}) {
    if (IS_CLOUD) {
      const { Purchase } = await getMongo();
      let query = {};
      if (from || to) {
        query.date = {};
        if (from) query.date.$gte = new Date(from);
        if (to) query.date.$lte = new Date(to);
      }
      const docs = await Purchase.find(query).sort({ date: -1 }).limit(100).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString(), items: d.items || [] }));
    } else {
      const db = getSqlite();
      let q = 'SELECT * FROM purchases'; const p = [];
      const conditions = [];
      if (from) { conditions.push('date >= ?'); p.push(from); }
      if (to) { conditions.push('date <= ?'); p.push(to); }
      if (conditions.length) q += ' WHERE ' + conditions.join(' AND ');
      q += ' ORDER BY date DESC LIMIT 100';
      return db.prepare(q).all(...p).map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }));
    }
  },

  // Creating a purchase receives stock (goods in hand) and, unless paid in
  // full immediately, increases what's owed to the supplier — mirroring how
  // invoices.create() increases a customer's balance for an Udhaar sale.
  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const items = Array.isArray(body.items) ? body.items : [];
    const owesSupplier = body.status !== 'Paid';
    const totalAmount = body.totalAmount || 0;

    if (IS_CLOUD) {
      const { Purchase, Product, Supplier, Ledger } = await getMongo();
      const mongoose = (await import('mongoose')).default;
      const session = await mongoose.startSession();
      let doc;
      try {
        await session.withTransaction(async () => {
          const [created] = await Purchase.create([{ ...body, _id, createdAt: now, updatedAt: now }], { session });
          doc = created;

          for (const item of items) {
            if (item.productId && item.quantity) {
              await Product.findByIdAndUpdate(
                item.productId,
                { $inc: { stock: item.quantity }, updatedAt: now },
                { session }
              );
            }
          }

          if (owesSupplier && body.supplierId && totalAmount > 0) {
            await Supplier.findByIdAndUpdate(
              body.supplierId,
              { $inc: { payableBalance: totalAmount, outstandingBalance: totalAmount }, updatedAt: now },
              { session }
            );
            await Ledger.create([{
              _id: generateObjectId(), entityType: 'Supplier', entityId: body.supplierId,
              transactionType: 'Debit', amount: totalAmount,
              description: `Purchase against ${body.invoiceNumber || _id}`,
              date: now, createdAt: now, updatedAt: now,
            }], { session });
          }
        });
      } finally {
        await session.endSession();
      }
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, supplierId: body.supplierId || null, invoiceNumber: body.invoiceNumber || null,
        date: body.date || now, items: JSON.stringify(items),
        totalAmount, status: body.status || 'Completed',
        notes: body.notes || null, createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);

      db.transaction(() => {
        db.prepare(`INSERT INTO purchases (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'purchases', _id, data);

        const updateStock = db.prepare('UPDATE products SET stock = stock + ?, updatedAt = ? WHERE _id = ?');
        for (const item of items) {
          if (item.productId && item.quantity) {
            updateStock.run(item.quantity, now, item.productId);
            queueSync('UPDATE', 'products', item.productId, { $inc: { stock: item.quantity }, updatedAt: now });
          }
        }

        if (owesSupplier && data.supplierId && totalAmount > 0) {
          db.prepare('UPDATE suppliers SET payableBalance = payableBalance + ?, outstandingBalance = outstandingBalance + ?, updatedAt = ? WHERE _id = ?')
            .run(totalAmount, totalAmount, now, data.supplierId);
          queueSync('UPDATE', 'suppliers', data.supplierId, { $inc: { payableBalance: totalAmount, outstandingBalance: totalAmount }, updatedAt: now });

          const ledgerId = generateObjectId();
          const ledgerEntry = {
            _id: ledgerId, entityType: 'Supplier', entityId: data.supplierId,
            transactionType: 'Debit', amount: totalAmount,
            description: `Purchase against ${data.invoiceNumber || _id}`,
            date: now, createdAt: now, updatedAt: now,
          };
          const lCols = Object.keys(ledgerEntry);
          db.prepare(`INSERT INTO ledgers (${lCols.join(',')}) VALUES (${lCols.map(() => '?').join(',')})`).run(...Object.values(ledgerEntry));
          queueSync('INSERT', 'ledgers', ledgerId, ledgerEntry);
        }
      })();

      return { ...data, items };
    }
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = {
  async get() {
    if (IS_CLOUD) {
      const { StoreConfig } = await getMongo();
      // Single, well-known store-settings document (there is only ever one).
      let doc = await StoreConfig.findOne().lean();
      if (!doc) {
        doc = (await StoreConfig.create({})).toObject();
      }
      return { ...doc, _id: doc._id.toString() };
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM settings LIMIT 1').get() || {
        storeName: 'Kajri Sarees', invoicePrefix: 'INV-', defaultTaxRate: 0, autoPrint: 0,
      };
    }
  },

  async upsert(body) {
    if (IS_CLOUD) {
      const { StoreConfig } = await getMongo();
      const { _id, ...update } = body;
      const doc = await StoreConfig.findOneAndUpdate({}, update, {
        new: true, upsert: true, setDefaultsOnInsert: true,
      }).lean();
      return { ...doc, _id: doc._id.toString() };
    } else {
      const db = getSqlite();
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT _id FROM settings LIMIT 1').get();
      if (existing) {
        const updateData = pickAllowedFields('settings', { ...body, updatedAt: now });
        const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE settings SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), existing._id);
      } else {
        const _id = generateObjectId();
        const data = { _id, ...pickAllowedFields('settings', body), createdAt: now, updatedAt: now };
        const cols = Object.keys(data);
        db.prepare(`INSERT INTO settings (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(data));
      }
      return db.prepare('SELECT * FROM settings LIMIT 1').get();
    }
  },
};

// ─── Ledgers ─────────────────────────────────────────────────────────────────
export const ledgers = {
  async getByEntity(entityId) {
    if (IS_CLOUD) {
      const { Ledger } = await getMongo();
      const docs = await Ledger.find({ entityId }).sort({ date: -1 }).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM ledgers WHERE entityId = ? ORDER BY date DESC').all(entityId);
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Ledger } = await getMongo();
      const doc = await Ledger.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, entityType: body.entityType || null, entityId: body.entityId || null,
        transactionType: body.transactionType || 'Debit', amount: body.amount || 0,
        description: body.description || null, date: body.date || now,
        createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO ledgers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(data));
        queueSync('INSERT', 'ledgers', _id, data);
      })();
      return data;
    }
  },
};

// ─── Bank Accounts ──────────────────────────────────────────────────────────────
export const bankAccounts = {
  async getAll() {
    if (IS_CLOUD) {
      const { BankAccount } = await getMongo();
      const docs = await BankAccount.find({}).sort({ createdAt: -1 }).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM bank_accounts ORDER BY createdAt DESC').all();
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const data = {
      name: body.name || '', accountNo: body.accountNo || '', ifsc: body.ifsc || '',
      openingBalance: Number(body.openingBalance) || 0,
    };
    if (IS_CLOUD) {
      const { BankAccount } = await getMongo();
      const doc = await BankAccount.create({ ...data, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const row = { _id, ...data, createdAt: now, updatedAt: now };
      const cols = Object.keys(row);
      db.transaction(() => {
        db.prepare(`INSERT INTO bank_accounts (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(row));
        queueSync('INSERT', 'bank_accounts', _id, row);
      })();
      return row;
    }
  },

  async delete(id) {
    if (IS_CLOUD) {
      const { BankAccount } = await getMongo();
      await BankAccount.findByIdAndDelete(id);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      db.transaction(() => {
        db.prepare('DELETE FROM bank_accounts WHERE _id = ?').run(id);
        queueSync('DELETE', 'bank_accounts', id, {});
      })();
    }
  },
};

// ─── Bank Transactions (manual receipts/payments not tied to an invoice/expense) ─
export const bankTransactions = {
  async getAll() {
    if (IS_CLOUD) {
      const { BankTransaction } = await getMongo();
      const docs = await BankTransaction.find({}).sort({ date: -1 }).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM bank_transactions ORDER BY date DESC').all();
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const data = {
      bankAccountId: body.bankAccountId || null,
      type: body.type === 'out' ? 'out' : 'in',
      amount: Number(body.amount) || 0,
      description: body.description || '',
      category: body.category || 'Manual',
      date: body.date || now,
    };
    if (IS_CLOUD) {
      const { BankTransaction } = await getMongo();
      const doc = await BankTransaction.create({ ...data, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const row = { _id, ...data, createdAt: now, updatedAt: now };
      const cols = Object.keys(row);
      db.transaction(() => {
        db.prepare(`INSERT INTO bank_transactions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(row));
        queueSync('INSERT', 'bank_transactions', _id, row);
      })();
      return row;
    }
  },
};

// ─── Cash Transactions ───────────────────────────────────────────────────────────
export const cashTransactions = {
  async getAll() {
    if (IS_CLOUD) {
      const { CashTransaction } = await getMongo();
      const docs = await CashTransaction.find({}).sort({ date: -1 }).lean();
      return docs.map(d => ({ ...d, _id: d._id.toString() }));
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM cash_transactions ORDER BY date DESC').all();
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const data = {
      type: body.type === 'out' ? 'out' : 'in',
      amount: Number(body.amount) || 0,
      category: body.category || 'Other',
      description: body.description || '',
      date: body.date || now,
    };
    if (IS_CLOUD) {
      const { CashTransaction } = await getMongo();
      const doc = await CashTransaction.create({ ...data, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const row = { _id, ...data, createdAt: now, updatedAt: now };
      const cols = Object.keys(row);
      db.transaction(() => {
        db.prepare(`INSERT INTO cash_transactions (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(row));
        queueSync('INSERT', 'cash_transactions', _id, row);
      })();
      return row;
    }
  },
};

const adapter = {
  products, customers, suppliers, invoices, expenses, purchases, settings, ledgers,
  bankAccounts, bankTransactions, cashTransactions,
  IS_CLOUD, generateObjectId,
};
export default adapter;
