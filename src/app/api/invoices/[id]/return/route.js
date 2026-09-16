import { NextResponse } from 'next/server';
import db, { queueSync } from '@/lib/sqlite';

/**
 * POST /api/invoices/[id]/return
 * Process a sales return — marks invoice as Returned, restores product stock,
 * and reduces customer outstanding balance if it was an Udhaar sale.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, reason, refundTotal } = await request.json();
    const timestamp = new Date().toISOString();

    const invoice = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }
    if (invoice.status === 'Returned') {
      return NextResponse.json({ success: false, error: 'Invoice already returned' }, { status: 400 });
    }

    db.transaction(() => {
      // 1. Restore stock
      if (Array.isArray(items) && items.length > 0) {
        const updateStock = db.prepare('UPDATE products SET stock = stock + ?, updatedAt = ? WHERE _id = ?');
        for (const item of items) {
          if (item.returnQty > 0 && item.productId) {
            updateStock.run(item.returnQty, timestamp, item.productId);
            queueSync('UPDATE', 'products', item.productId, { $inc: { stock: item.returnQty }, updatedAt: timestamp });
          }
        }
      }

      // 2. Reduce customer balance if Udhaar
      if (invoice.paymentMethod === 'Udhaar' && invoice.customerId && refundTotal > 0) {
        db.prepare('UPDATE customers SET outstandingBalance = MAX(0, outstandingBalance - ?), updatedAt = ? WHERE _id = ?')
          .run(refundTotal, timestamp, invoice.customerId);
        queueSync('UPDATE', 'customers', invoice.customerId, { $inc: { outstandingBalance: -refundTotal }, updatedAt: timestamp });
      }

      // 3. Update invoice status
      db.prepare('UPDATE invoices SET status = ?, returnReason = ?, refundTotal = ?, updatedAt = ? WHERE _id = ?')
        .run('Returned', reason || null, refundTotal || 0, timestamp, id);
      
      queueSync('UPDATE', 'invoices', id, { 
        status: 'Returned', 
        returnReason: reason || null, 
        refundTotal: refundTotal || 0, 
        updatedAt: timestamp 
      });
    })();

    const updatedInvoice = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);

    return NextResponse.json({ success: true, data: updatedInvoice });
  } catch (error) {
    console.error('[Invoice Return Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
