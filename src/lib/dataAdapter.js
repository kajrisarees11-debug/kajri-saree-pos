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
  ] = await Promise.all([
    import('@/lib/models/Product'),
    import('@/lib/models/POSCustomer'),
    import('@/lib/models/Supplier'),
    import('@/lib/models/POSInvoice'),
    import('@/lib/models/Expense'),
    import('@/lib/models/Purchase'),
    import('@/lib/models/Ledger'),
  ]);
  return { Product, POSCustomer, Supplier, POSInvoice, Expense, Purchase, Ledger };
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
        { name: new RegExp(search, 'i') },
        { sku: new RegExp(search, 'i') },
        { barcode: new RegExp(search, 'i') },
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
      const { _id, ...updateData } = body;
      updateData.updatedAt = now;
      if (updateData.images) updateData.images = JSON.stringify(updateData.images);
      if (updateData.category) { updateData.categoryId = updateData.category; delete updateData.category; }
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
      await Promise.all(items.map(p => Product.findByIdAndUpdate(p._id, { barcode: p.barcode, updatedAt: now })));
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
      else if (search) query.$or = [{ name: new RegExp(search, 'i') }, { mobileNumber: new RegExp(search, 'i') }];
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

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { POSCustomer } = await getMongo();
      const doc = await POSCustomer.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
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
      db.transaction(() => {
        db.prepare(`INSERT INTO customers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'customers', _id, data);
      })();
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
      const { _id, ...updateData } = body;
      updateData.updatedAt = now;
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
      if (search) query.$or = [{ name: new RegExp(search, 'i') }, { contactNumber: new RegExp(search, 'i') }];
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
      const { _id, ...updateData } = body;
      updateData.updatedAt = now;
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
      if (search) query.$or = [{ invoiceNumber: new RegExp(search, 'i') }];
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

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { POSInvoice } = await getMongo();
      const doc = await POSInvoice.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, invoiceNumber: body.invoiceNumber, customerId: body.customerId || null,
        items: JSON.stringify(body.items || []), subTotal: body.subTotal || 0,
        taxTotal: body.taxTotal || 0, discountTotal: body.discountTotal || 0,
        grandTotal: body.grandTotal || 0, paymentMethod: body.paymentMethod || 'Cash',
        amountPaid: body.amountPaid || 0, balance: body.balance || 0,
        status: body.status || 'Completed', createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO invoices (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'invoices', _id, data);
      })();
      return { ...data, items: body.items || [] };
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
      const { _id, ...updateData } = body;
      updateData.updatedAt = now;
      if (updateData.items) updateData.items = JSON.stringify(updateData.items);
      const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
      db.transaction(() => {
        db.prepare(`UPDATE invoices SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), id);
        queueSync('UPDATE', 'invoices', id, updateData);
      })();
      const r = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
      return r ? { ...r, items: r.items ? JSON.parse(r.items) : [] } : null;
    }
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
      if (from && to) { q += ' WHERE date BETWEEN ? AND ?'; p.push(from, to); }
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
      if (from && to) { q += ' WHERE date BETWEEN ? AND ?'; p.push(from, to); }
      q += ' ORDER BY date DESC LIMIT 100';
      return db.prepare(q).all(...p).map(r => ({ ...r, items: r.items ? JSON.parse(r.items) : [] }));
    }
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    if (IS_CLOUD) {
      const { Purchase } = await getMongo();
      const doc = await Purchase.create({ ...body, _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } else {
      const db = getSqlite();
      const { queueSync } = require('@/lib/sqlite');
      const data = {
        _id, supplierId: body.supplierId || null, invoiceNumber: body.invoiceNumber || null,
        date: body.date || now, items: JSON.stringify(body.items || []),
        totalAmount: body.totalAmount || 0, status: body.status || 'Completed',
        notes: body.notes || null, createdAt: now, updatedAt: now,
      };
      const cols = Object.keys(data); const vals = Object.values(data);
      db.transaction(() => {
        db.prepare(`INSERT INTO purchases (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
        queueSync('INSERT', 'purchases', _id, data);
      })();
      return { ...data, items: body.items || [] };
    }
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = {
  async get() {
    if (IS_CLOUD) {
      // Store settings in a well-known MongoDB document
      const { Product } = await getMongo();
      // Use a simple key-value approach in Mongo via a Settings model
      // Since we don't have a Settings model, return defaults
      return {
        storeName: 'Kajri Sarees', phone: '', address: '', email: '',
        gstin: '', invoicePrefix: 'INV-', defaultTaxRate: 0, terms: '',
        pageSize: 'A4', autoPrint: false,
      };
    } else {
      const db = getSqlite();
      return db.prepare('SELECT * FROM settings LIMIT 1').get() || {
        storeName: 'Kajri Sarees', invoicePrefix: 'INV-', defaultTaxRate: 0, autoPrint: 0,
      };
    }
  },

  async upsert(body) {
    if (IS_CLOUD) {
      return body; // Settings are per-device; cloud just returns them
    } else {
      const db = getSqlite();
      const now = new Date().toISOString();
      const existing = db.prepare('SELECT _id FROM settings LIMIT 1').get();
      if (existing) {
        const { _id, ...updateData } = body;
        updateData.updatedAt = now;
        const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
        db.prepare(`UPDATE settings SET ${setClauses} WHERE _id = ?`).run(...Object.values(updateData), existing._id);
      } else {
        const _id = generateObjectId();
        const data = { _id, ...body, createdAt: now, updatedAt: now };
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

const adapter = { products, customers, suppliers, invoices, expenses, purchases, settings, ledgers, IS_CLOUD, generateObjectId };
export default adapter;
