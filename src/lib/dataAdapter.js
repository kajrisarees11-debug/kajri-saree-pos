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

export const IS_CLOUD = true;

export function generateObjectId() {
  return crypto.randomBytes(12).toString('hex');
}

// ─── SQLite UPDATE column whitelist ────────────────────────────────────────────
// Column lists for each SQLite table's UPDATE statement. Without this, the SET
// clause would be built from raw client JSON keys (`Object.keys(body)`), letting
// a caller name arbitrary/internal columns or smuggle SQL fragments in as a "key".
const ALLOWED_UPDATE_FIELDS = {
  products: ['name', 'sku', 'barcode', 'description', 'price', 'purchasePrice', 'taxRate', 'stock', 'minStock', 'categoryId', 'subCategory', 'supplierId', 'images', 'fabric', 'colour', 'sareeType', 'brand', 'design', 'status', 'updatedAt'],
  customers: ['name', 'mobileNumber', 'email', 'address', 'city', 'pincode', 'outstandingBalance', 'totalPurchases', 'gstin', 'customerType', 'updatedAt'],
  suppliers: ['name', 'contactNumber', 'phone', 'email', 'address', 'city', 'gstin', 'payableBalance', 'outstandingBalance', 'purchaseHistory', 'bankName', 'accountNumber', 'ifscCode', 'upiId', 'notes', 'updatedAt'],
  invoices: ['invoiceNumber', 'customerId', 'items', 'subTotal', 'taxTotal', 'discountTotal', 'grandTotal', 'paymentMethod', 'amountPaid', 'balance', 'status', 'returnReason', 'refundTotal', 'updatedAt'],
  purchases: ['supplierId', 'invoiceNumber', 'date', 'items', 'totalAmount', 'status', 'refundTotal', 'notes', 'updatedAt'],
  settings: ['storeName', 'phone', 'address', 'email', 'gstin', 'invoicePrefix', 'defaultTaxRate', 'terms', 'pageSize', 'printerName', 'autoPrint', 'mongoSyncUri', 'updatedAt'],
};

// The same whitelist, applied to the Mongo/IS_CLOUD branch of every
// create()/update() — previously ALLOWED_UPDATE_FIELDS was only ever
// consulted on the SQLite branch, so the cloud/production backend accepted
// ANY field a caller included with no filtering at all. For most collections
// the writable field names are identical across both backends, but the
// Mongo Product collection is shared with a separate live storefront app
// with its own e-commerce-only fields (isFeatured, isTrending, coverImage,
// tags, variants, seoTitle, ...) that this POS app must never let a caller
// touch — and it uses different field names for a couple of columns
// (`category`, a real ObjectId ref, instead of SQLite's free-text
// `categoryId`; `color` instead of `colour`), so products gets its own list
// rather than reusing the SQLite one verbatim.
const ALLOWED_UPDATE_FIELDS_MONGO = {
  products: ['name', 'sku', 'barcode', 'description', 'price', 'purchasePrice', 'mrp', 'taxRate', 'stock', 'minStock', 'subCategory', 'supplierId', 'images', 'fabric', 'color', 'sareeType', 'brand', 'status', 'updatedAt'],
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

function pickAllowedFieldsMongo(table, obj) {
  const allowed = ALLOWED_UPDATE_FIELDS_MONGO[table] || ALLOWED_UPDATE_FIELDS[table];
  const out = {};
  for (const key of Object.keys(obj)) {
    if (allowed.includes(key)) out[key] = obj[key];
  }
  return out;
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
  },

  async getById(id) {
    const { Product } = await getMongo();
    const doc = await Product.findById(id).lean();
    return doc ? { ...doc, _id: doc._id.toString(), images: doc.images || [] } : null;
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const { Product } = await getMongo();
    // pickAllowedFieldsMongo drops the dashboard's free-text `category`
    // field (e.g. "Saree") here — Mongo's `category` is a real ObjectId
    // ref shared with a separate storefront app, and passing a plain
    // string into it throws a CastError on every single create.
    const doc = await Product.create({ ...pickAllowedFieldsMongo('products', body), _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },

  async update(id, body) {
    const now = new Date().toISOString();
    const { Product } = await getMongo();
    const update = { ...pickAllowedFieldsMongo('products', body), updatedAt: now };
    const doc = await Product.findByIdAndUpdate(id, update, { new: true }).lean();
    return doc ? { ...doc, _id: doc._id.toString(), images: doc.images || [] } : null;
  },

  async bulkUpdateBarcodes(items) {
    const now = new Date().toISOString();
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
  },

  async delete(id) {
    const { Product } = await getMongo();
    await Product.findByIdAndDelete(id);
  },
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customers = {
  async getAll({ search, mobile } = {}) {
    const { POSCustomer } = await getMongo();
    let query = {};
    if (mobile) query.mobileNumber = mobile;
    else if (search) query.$or = [{ name: new RegExp(escapeRegex(search), 'i') }, { mobileNumber: new RegExp(escapeRegex(search), 'i') }];
    const docs = await POSCustomer.find(query).sort({ createdAt: -1 }).limit(50).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
  },

  async getById(id) {
    const { POSCustomer } = await getMongo();
    const doc = await POSCustomer.findById(id).lean();
    return doc ? { ...doc, _id: doc._id.toString() } : null;
  },

  async findByMobile(mobile) {
    const { POSCustomer } = await getMongo();
    const doc = await POSCustomer.findOne({ mobileNumber: mobile }).lean();
    return doc ? { ...doc, _id: doc._id.toString() } : null;
  },

  // Self-heals the check-then-act race in POST /api/customers (findByMobile
  // then create): if two requests for the same new mobile number land at
  // once, the unique index rejects the loser here, and instead of a raw
  // constraint-violation error we just return the winner's row — the same
  // outcome the route was already trying to produce via its upfront check.
  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const { POSCustomer } = await getMongo();
    try {
      const doc = await POSCustomer.create({ ...pickAllowedFields('customers', body), _id, createdAt: now, updatedAt: now });
      return toPlain(doc);
    } catch (err) {
      if (err.code === 11000 && body.mobileNumber) {
        const existing = await this.findByMobile(body.mobileNumber);
        if (existing) return existing;
      }
      throw err;
    }
  },

  async update(id, body) {
    const now = new Date().toISOString();
    const { POSCustomer } = await getMongo();
    const update = { ...pickAllowedFields('customers', body), updatedAt: now };
    const doc = await POSCustomer.findByIdAndUpdate(id, update, { new: true }).lean();
    return doc ? { ...doc, _id: doc._id.toString() } : null;
  },
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliers = {
  async getAll({ search } = {}) {
    const { Supplier } = await getMongo();
    let query = {};
    if (search) query.$or = [{ name: new RegExp(escapeRegex(search), 'i') }, { contactNumber: new RegExp(escapeRegex(search), 'i') }];
    const docs = await Supplier.find(query).sort({ createdAt: -1 }).limit(50).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
  },

  async getById(id) {
    const { Supplier } = await getMongo();
    const doc = await Supplier.findById(id).lean();
    return doc ? { ...doc, _id: doc._id.toString() } : null;
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const { Supplier } = await getMongo();
    const doc = await Supplier.create({ ...pickAllowedFields('suppliers', body), _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },

  async update(id, body) {
    const now = new Date().toISOString();
    const { Supplier } = await getMongo();
    const update = { ...pickAllowedFields('suppliers', body), updatedAt: now };
    const doc = await Supplier.findByIdAndUpdate(id, update, { new: true }).lean();
    return doc ? { ...doc, _id: doc._id.toString() } : null;
  },
};

// Looks up the AUTHORITATIVE server-side price/taxRate for a set of product
// ids — used to recompute an invoice's totals instead of trusting whatever
// price/taxRate the client claims for each cart line.
async function getProductPriceMap(productIds) {
  const ids = [...new Set(productIds.filter(Boolean).map(String))];
  const map = new Map();
  if (ids.length === 0) return map;
  const { Product } = await getMongo();
  const docs = await Product.find({ _id: { $in: ids } }, 'price taxRate').lean();
  for (const d of docs) map.set(d._id.toString(), { price: d.price || 0, taxRate: d.taxRate || 0 });
  return map;
}

// Recomputes subTotal/taxTotal/grandTotal from each item's real, current
// product price/taxRate rather than the client-supplied item.price —
// otherwise a compromised or buggy POS client can submit real items
// (deducting real stock) alongside an arbitrary low grandTotal, permanently
// understating revenue with no reconciliation path once the stock is gone.
// Rejects the request if the client's declared grandTotal diverges from the
// recomputed one by more than a couple of rupees (rounding tolerance).
async function recomputeInvoiceTotals(body) {
  const items = Array.isArray(body.items) ? body.items : [];
  const priceMap = await getProductPriceMap(items.map((i) => i.productId));

  let subTotal = 0;
  let taxTotal = 0;
  for (const item of items) {
    const known = priceMap.get(String(item.productId));
    // A cart line with no matching product (e.g. a manual/non-catalog line)
    // has no authoritative price to check against — trust the client for
    // that line only, same as before this fix.
    const price = known ? known.price : Number(item.price) || 0;
    const taxRate = known ? known.taxRate : Number(item.taxRate) || 0;
    const qty = Number(item.quantity) || 0;
    subTotal += price * qty;
    taxTotal += ((price * taxRate) / 100) * qty;
  }

  const discountTotal = Number(body.discountTotal) || 0;
  const grandTotal = Math.max(0, Math.round((subTotal + taxTotal - discountTotal) * 100) / 100);
  const clientGrandTotal = Number(body.grandTotal) || 0;

  if (Math.abs(clientGrandTotal - grandTotal) > 2) {
    const err = new Error(
      `Invoice total does not match server-computed price (expected ~₹${grandTotal.toFixed(2)}, received ₹${clientGrandTotal.toFixed(2)}). Please refresh product prices and retry.`
    );
    err.code = 'TOTAL_MISMATCH';
    throw err;
  }

  return { ...body, subTotal, taxTotal, grandTotal };
}

// Mirrors validateReturnAgainstPurchase() in the purchase-return route — a
// sales return had no equivalent check at all, letting a caller return more
// of a product than the invoice ever sold, or claim a refund larger than the
// invoice's own total.
function validateReturnAgainstInvoice(invoice, invoiceItems, returnItems, refundTotal) {
  const originalQtyByProduct = new Map();
  for (const item of invoiceItems || []) {
    const pid = item.productId?.toString ? item.productId.toString() : item.productId;
    originalQtyByProduct.set(pid, (originalQtyByProduct.get(pid) || 0) + (item.quantity || 0));
  }
  for (const item of returnItems || []) {
    if (!(item.returnQty > 0) || !item.productId) continue;
    const originalQty = originalQtyByProduct.get(item.productId) || 0;
    if (item.returnQty > originalQty) {
      return `Cannot return ${item.returnQty} units of product ${item.productId} — only ${originalQty} were on this invoice.`;
    }
  }
  if ((refundTotal || 0) > (invoice.grandTotal || 0) + 0.01) {
    return `Refund amount (₹${refundTotal}) exceeds the invoice's total amount (₹${invoice.grandTotal}).`;
  }
  return null;
}

// How much of a customer's outstandingBalance a return should actually
// reverse. This is NOT refundTotal (the value of the returned goods) — it's
// only the DEBT this specific invoice contributed at sale time
// (grandTotal - amountPaid, from createWithEffects' own balanceAdded logic),
// pro-rated by how much of the sale is being returned. A fully-paid sale
// (no debt ever created) correctly reverses nothing regardless of
// refundTotal; a fully-Udhaar sale reverses its full debt on a full return.
function debtReversalForReturn(invoice, refundTotal) {
  const grandTotal = invoice.grandTotal || 0;
  if (grandTotal <= 0) return 0;
  const originalDebt = Math.max(0, grandTotal - (invoice.amountPaid || 0));
  if (originalDebt <= 0) return 0;
  const returnedFraction = Math.min(1, (refundTotal || 0) / grandTotal);
  return Math.round(originalDebt * returnedFraction * 100) / 100;
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
export const invoices = {
  async getAll({ page = 1, limit = 20, status, search } = {}) {
    const skip = (page - 1) * limit;
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
  },

  async getById(id) {
    const { POSInvoice } = await getMongo();
    const doc = await POSInvoice.findById(id).lean();
    return doc ? { ...doc, _id: doc._id.toString(), items: doc.items || [] } : null;
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
  },

  // Full POS checkout: create the invoice, deduct stock, and (for an Udhaar
  // or partially-paid sale) update the customer's balance + ledger — all in
  // ONE atomic transaction per backend, so a mid-way failure (e.g. a bad
  // productId) can't leave an orphaned invoice with no stock/ledger effect.
  // Idempotent the same way create() is: a repeat call with the same
  // idempotencyKey returns the original invoice (isNew: false) and applies
  // no side effects again.
  async createWithEffects(rawBody, { allowNegativeStock = false } = {}) {
    const now = new Date().toISOString();
    const body = await recomputeInvoiceTotals(rawBody);
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
        // Preserve the ORIGINAL sale time for an offline-queued invoice
        // synced later — otherwise every offline sale gets stamped with
        // whenever connectivity happened to return instead of when it
        // actually happened, skewing reports for that period.
        const [doc] = await POSInvoice.create([{ ...body, _id, createdAt: body.createdAt || now, updatedAt: now }], { session });
        created = doc;

        for (const item of items) {
          if (item.productId && item.quantity) {
            if (allowNegativeStock) {
              // Offline-sync path: the physical sale already happened in the
              // store. We MUST record it, even if digital stock is now negative
              // or the product was deleted. This keeps revenue, ledger, and
              // customer balance accurate. Stock can be reconciled manually.
              const productExists = await Product.exists({ _id: item.productId }).session(session);
              if (productExists) {
                // Unconditionally decrement — drives stock negative if needed.
                await Product.findByIdAndUpdate(
                  item.productId,
                  { $inc: { stock: -item.quantity }, updatedAt: now },
                  { session }
                );
              }
              // If product was deleted, skip stock update entirely but still
              // allow the invoice to be created.
            } else {
              // Online path: enforce strict stock floor. The update is the
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
  },

  async update(id, body) {
    const now = new Date().toISOString();
    const { POSInvoice } = await getMongo();
    const update = { ...pickAllowedFields('invoices', body), updatedAt: now };
    const doc = await POSInvoice.findByIdAndUpdate(id, update, { new: true }).lean();
    return doc ? { ...doc, _id: doc._id.toString(), items: doc.items || [] } : null;
  },

  // Process a sales return: restore stock, reduce customer balance if Udhaar,
  // mark the invoice Returned. Shared by /api/invoices/[id]/return and the
  // legacy /api/returns endpoint so both go through the exact same logic
  // instead of one re-implementing it via a fragile self-HTTP-call.
  async processReturn(id, { items, reason, refundTotal = 0 } = {}) {
    const timestamp = new Date().toISOString();

    const mongoose = (await import('mongoose')).default;
    const { POSInvoice, Product, POSCustomer, Ledger } = await getMongo();

    const invoice = await POSInvoice.findById(id).lean();
    if (!invoice) { const e = new Error('Invoice not found'); e.code = 'NOT_FOUND'; throw e; }
    if (invoice.status === 'Returned') { const e = new Error('Invoice already returned'); e.code = 'ALREADY_RETURNED'; throw e; }
    const validationError = validateReturnAgainstInvoice(invoice, invoice.items || [], items, refundTotal);
    if (validationError) { const e = new Error(validationError); e.code = 'INVALID_RETURN'; throw e; }
    const debtReversal = debtReversalForReturn(invoice, refundTotal);

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
        // Reverses whatever customer debt THIS invoice actually created at
        // sale time (grandTotal - amountPaid, pro-rated by how much of the
        // sale is being returned) — not just Udhaar-labeled invoices. A
        // "Cash" sale checked out with amountPaid < grandTotal creates the
        // exact same kind of debt (see createWithEffects), which a return
        // must unwind the same way or the customer is left owing money on
        // goods they no longer have.
        if (invoice.customerId && debtReversal > 0) {
          const customer = await POSCustomer.findById(invoice.customerId).session(session);
          if (customer) {
            customer.outstandingBalance = Math.max(0, (customer.outstandingBalance || 0) - debtReversal);
            customer.updatedAt = timestamp;
            await customer.save({ session });
          }
          // Every other balance-affecting event leaves a ledger entry —
          // this one didn't, which is exactly the kind of gap that makes
          // a ledger-derived party statement silently drift from the
          // real (customer.outstandingBalance) balance.
          await Ledger.create([{
            _id: generateObjectId(), entityType: 'POSCustomer', entityId: invoice.customerId,
            transactionType: 'Credit', amount: debtReversal,
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


  },
};

// ─── Expenses ─────────────────────────────────────────────────────────────────
export const expenses = {
  async getAll({ from, to } = {}) {
    const { Expense } = await getMongo();
    let query = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const docs = await Expense.find(query).sort({ date: -1 }).limit(100).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const { Expense } = await getMongo();
    const doc = await Expense.create({ ...body, _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },
};

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchases = {
  async getAll({ from, to } = {}) {
    const { Purchase } = await getMongo();
    let query = {};
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = new Date(from);
      if (to) query.date.$lte = new Date(to);
    }
    const docs = await Purchase.find(query).sort({ date: -1 }).limit(100).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString(), items: d.items || [] }));
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
  },
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settings = {
  async get() {
    const { StoreConfig } = await getMongo();
    // Single, well-known store-settings document (there is only ever one).
    let doc = await StoreConfig.findOne().lean();
    if (!doc) {
      doc = (await StoreConfig.create({})).toObject();
    }
    return { ...doc, _id: doc._id.toString() };
  },

  async upsert(body) {
    const { StoreConfig } = await getMongo();
    const update = pickAllowedFields('settings', body);
    const doc = await StoreConfig.findOneAndUpdate({}, update, {
      new: true, upsert: true, setDefaultsOnInsert: true,
    }).lean();
    return { ...doc, _id: doc._id.toString() };
  },
};

// ─── Ledgers ─────────────────────────────────────────────────────────────────
export const ledgers = {
  async getByEntity(entityId) {
    const { Ledger } = await getMongo();
    const docs = await Ledger.find({ entityId }).sort({ date: -1 }).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const { Ledger } = await getMongo();
    const doc = await Ledger.create({ ...body, _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },
};

// ─── Bank Accounts ──────────────────────────────────────────────────────────────
export const bankAccounts = {
  async getAll() {
    const { BankAccount } = await getMongo();
    const docs = await BankAccount.find({}).sort({ createdAt: -1 }).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
  },

  async create(body) {
    const _id = body._id || generateObjectId();
    const now = new Date().toISOString();
    const data = {
      name: body.name || '', accountNo: body.accountNo || '', ifsc: body.ifsc || '',
      openingBalance: Number(body.openingBalance) || 0,
    };
    const { BankAccount } = await getMongo();
    const doc = await BankAccount.create({ ...data, _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },

  async delete(id) {
    const { BankAccount } = await getMongo();
    await BankAccount.findByIdAndDelete(id);
  },
};

// ─── Bank Transactions (manual receipts/payments not tied to an invoice/expense) ─
export const bankTransactions = {
  async getAll() {
    const { BankTransaction } = await getMongo();
    const docs = await BankTransaction.find({}).sort({ date: -1 }).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
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
    const { BankTransaction } = await getMongo();
    const doc = await BankTransaction.create({ ...data, _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },
};

// ─── Cash Transactions ───────────────────────────────────────────────────────────
export const cashTransactions = {
  async getAll() {
    const { CashTransaction } = await getMongo();
    const docs = await CashTransaction.find({}).sort({ date: -1 }).lean();
    return docs.map(d => ({ ...d, _id: d._id.toString() }));
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
    const { CashTransaction } = await getMongo();
    const doc = await CashTransaction.create({ ...data, _id, createdAt: now, updatedAt: now });
    return toPlain(doc);
  },
};

const adapter = {
  products, customers, suppliers, invoices, expenses, purchases, settings, ledgers,
  bankAccounts, bankTransactions, cashTransactions,
  IS_CLOUD, generateObjectId,
};
export default adapter;
