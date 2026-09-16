import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

/**
 * POST /api/purchases/[id]/return
 * Process a purchase return (Debit Note):
 * - Deducts returned items back from product stock
 * - Reduces supplier payable balance by the refund amount
 * - Marks the purchase as Returned
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, reason, refundTotal, supplierId } = await request.json();
    const timestamp = new Date().toISOString();

    const purchase = db.prepare('SELECT * FROM purchases WHERE _id = ?').get(id);
    if (!purchase) {
      return NextResponse.json({ success: false, error: 'Purchase not found' }, { status: 404 });
    }
    if (purchase.status === 'Returned') {
      return NextResponse.json({ success: false, error: 'Purchase already returned' }, { status: 400 });
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
