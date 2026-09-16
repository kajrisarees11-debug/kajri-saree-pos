import { NextResponse } from 'next/server';
import { IS_CLOUD, generateObjectId } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * Validates that no item's returnQty exceeds what was actually on the
 * original purchase, and that refundTotal doesn't exceed the purchase's
 * own total — without this, an arbitrarily large returnQty/refundTotal
 * (typo or buggy client) could drive stock and supplier balance
 * adjustments beyond what was ever actually purchased.
 */
function validateReturnAgainstPurchase(purchase, items, refundTotal) {
  const originalQtyByProduct = new Map();
  for (const item of purchase.items || []) {
    const pid = (item.productId?.toString ? item.productId.toString() : item.productId);
    originalQtyByProduct.set(pid, (originalQtyByProduct.get(pid) || 0) + (item.quantity || 0));
  }
  for (const item of items || []) {
    if (!(item.returnQty > 0) || !item.productId) continue;
    const originalQty = originalQtyByProduct.get(item.productId) || 0;
    if (item.returnQty > originalQty) {
      return `Cannot return ${item.returnQty} units of product ${item.productId} — only ${originalQty} were on this purchase.`;
    }
  }
  if (refundTotal > (purchase.totalAmount || 0) + 0.01) {
    return `Refund amount (₹${refundTotal}) exceeds the purchase's total amount (₹${purchase.totalAmount}).`;
  }
  return null;
}

/**
 * POST /api/purchases/[id]/return
 * Process a purchase return (Debit Note):
 * - Deducts returned items back from product stock
 * - Reduces supplier payable balance by the refund amount
 * - Marks the purchase as Returned
 * Works against whichever backend (MongoDB on Vercel, SQLite on desktop) is active.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, reason, refundTotal, supplierId } = await request.json();
    const timestamp = new Date().toISOString();

    if (IS_CLOUD) {
      await dbConnect();
      const mongoose = (await import('mongoose')).default;
      const { default: Purchase } = await import('@/lib/models/Purchase');
      const { default: Product } = await import('@/lib/models/Product');
      const { default: Supplier } = await import('@/lib/models/Supplier');
      const { default: Ledger } = await import('@/lib/models/Ledger');

      const purchase = await Purchase.findById(id).lean();
      if (!purchase) {
        return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 });
      }
      if (purchase.status === 'Returned') {
        return NextResponse.json({ success: false, error: 'Purchase already returned' }, { status: 400 });
      }
      const validationError = validateReturnAgainstPurchase(purchase, items, refundTotal);
      if (validationError) {
        return NextResponse.json({ success: false, error: validationError }, { status: 400 });
      }

      const sid = supplierId || purchase.supplierId;

      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          if (Array.isArray(items) && items.length > 0) {
            for (const item of items) {
              if (item.returnQty > 0 && item.productId) {
                const product = await Product.findById(item.productId).session(session);
                if (product) {
                  product.stock = Math.max(0, (product.stock || 0) - item.returnQty);
                  product.updatedAt = timestamp;
                  await product.save({ session });
                }
              }
            }
          }

          if (sid && refundTotal > 0) {
            const supplier = await Supplier.findById(sid).session(session);
            if (supplier) {
              supplier.payableBalance = Math.max(0, (supplier.payableBalance || 0) - refundTotal);
              supplier.outstandingBalance = Math.max(0, (supplier.outstandingBalance || 0) - refundTotal);
              supplier.updatedAt = timestamp;
              await supplier.save({ session });
            }

            await Ledger.create([{
              _id: generateObjectId(),
              entityType: 'Supplier',
              entityId: sid,
              transactionType: 'Credit',
              amount: refundTotal,
              description: `Purchase return / Debit note against ${purchase.invoiceNumber || id}${reason ? ` — ${reason}` : ''}`,
              date: timestamp,
              createdAt: timestamp,
              updatedAt: timestamp,
            }], { session });
          }

          await Purchase.findByIdAndUpdate(
            id,
            { status: 'Returned', notes: reason || null, updatedAt: timestamp },
            { session }
          );
        });
      } finally {
        await session.endSession();
      }

      const updated = await Purchase.findById(id).lean();
      return NextResponse.json({ success: true, data: { ...updated, _id: updated._id.toString() } });
    }

    const db = require('@/lib/sqlite').default;
    const { queueSync } = require('@/lib/sqlite');

    const purchase = db.prepare('SELECT * FROM purchases WHERE _id = ?').get(id);
    if (!purchase) {
      return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 });
    }
    if (purchase.status === 'Returned') {
      return NextResponse.json({ success: false, error: 'Purchase already returned' }, { status: 400 });
    }
    const validationError = validateReturnAgainstPurchase(
      { ...purchase, items: purchase.items ? JSON.parse(purchase.items) : [] },
      items, refundTotal
    );
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    db.transaction(() => {
      // 1. Deduct returned items from stock (we're giving them back, so stock decreases)
      if (Array.isArray(items) && items.length > 0) {
        const updateStock = db.prepare('UPDATE products SET stock = MAX(0, stock - ?), updatedAt = ? WHERE _id = ?');
        for (const item of items) {
          if (item.returnQty > 0 && item.productId) {
            updateStock.run(item.returnQty, timestamp, item.productId);
            queueSync('UPDATE', 'products', item.productId, { $inc: { stock: -item.returnQty }, updatedAt: timestamp });
          }
        }
      }

      // 2. Reduce supplier payable balance (debit note reduces what we owe them)
      const sid = supplierId || purchase.supplierId;
      if (sid && refundTotal > 0) {
        db.prepare('UPDATE suppliers SET payableBalance = MAX(0, payableBalance - ?), outstandingBalance = MAX(0, outstandingBalance - ?), updatedAt = ? WHERE _id = ?')
          .run(refundTotal, refundTotal, timestamp, sid);
        queueSync('UPDATE', 'suppliers', sid, {
          $inc: { payableBalance: -refundTotal, outstandingBalance: -refundTotal },
          updatedAt: timestamp
        });

        // Ledger entry for debit note
        const ledgerId = generateObjectId();
        const ledgerEntry = {
          _id: ledgerId,
          entityType: 'Supplier',
          entityId: sid,
          transactionType: 'Credit',
          amount: refundTotal,
          description: `Purchase return / Debit note against ${purchase.invoiceNumber || id}${reason ? ` — ${reason}` : ''}`,
          date: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        const cols = Object.keys(ledgerEntry);
        const vals = Object.values(ledgerEntry);
        db.prepare(`INSERT INTO ledgers (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...vals);
        queueSync('INSERT', 'ledgers', ledgerId, ledgerEntry);
      }

      // 3. Mark purchase as Returned
      db.prepare('UPDATE purchases SET status = ?, notes = ?, updatedAt = ? WHERE _id = ?')
        .run('Returned', reason || null, timestamp, id);
      queueSync('UPDATE', 'purchases', id, { status: 'Returned', notes: reason || null, updatedAt: timestamp });
    })();

    const updated = db.prepare('SELECT * FROM purchases WHERE _id = ?').get(id);
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('[Purchase Return Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
