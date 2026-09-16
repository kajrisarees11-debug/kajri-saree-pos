import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

/**
 * POST /api/invoices/sync
 * 
 * Accepts an array of offline invoices collected from IndexedDB
 * and saves them to SQLite, updating stock and customer balances.
 */
export async function POST(request) {
  try {
    const { invoices } = await request.json();

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ success: false, error: 'No invoices to sync' }, { status: 400 });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    // Using transaction for safe bulk operations
    db.transaction(() => {
      for (const offlineInvoice of invoices) {
        try {
          // Check for duplicate (in case sync is called twice)
          const existing = db.prepare('SELECT _id FROM invoices WHERE invoiceNumber = ?').get(offlineInvoice.invoiceNumber);
          
          if (existing) {
            synced++; // Already saved, count as done
            continue;
          }

          const timestamp = new Date().toISOString();

          // 1. Prepare invoice data (strip local-only fields)
          const invoiceId = generateObjectId();
          const invoiceData = {
            _id: invoiceId,
            invoiceNumber: offlineInvoice.invoiceNumber,
            customerId: offlineInvoice.customerId || null,
            items: JSON.stringify(offlineInvoice.items || []),
            subTotal: offlineInvoice.subTotal || 0,
            taxTotal: offlineInvoice.taxTotal || 0,
            discountTotal: offlineInvoice.discountTotal || 0,
            grandTotal: offlineInvoice.grandTotal || 0,
            paymentMethod: offlineInvoice.paymentMethod || 'Cash',
            amountPaid: offlineInvoice.amountPaid || 0,
            balance: offlineInvoice.balance || 0,
            status: offlineInvoice.status || 'Completed',
            returnReason: offlineInvoice.returnReason || null,
            refundTotal: offlineInvoice.refundTotal || 0,
            createdAt: offlineInvoice.createdAt || timestamp,
            updatedAt: timestamp
          };

          // 2. Insert Invoice
          const invCols = Object.keys(invoiceData);
          const invVals = Object.values(invoiceData);
          db.prepare(`INSERT INTO invoices (${invCols.join(', ')}) VALUES (${invCols.map(()=>'?').join(', ')})`).run(...invVals);
          queueSync('INSERT', 'invoices', invoiceId, invoiceData);

          // 3. Update Product Inventory
          if (offlineInvoice.items && offlineInvoice.items.length > 0) {
            const updateProductStmt = db.prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE _id = ?');
            for (const item of offlineInvoice.items) {
              updateProductStmt.run(item.quantity, timestamp, item.productId);
              queueSync('UPDATE', 'products', item.productId, { $inc: { stock: -item.quantity }, updatedAt: timestamp });
            }
          }

          // 4. Update Customer & Ledger
          if (offlineInvoice.customerId) {
            let balanceAdded = 0;
            if (offlineInvoice.paymentMethod === 'Udhaar') balanceAdded = offlineInvoice.grandTotal;
            else if (offlineInvoice.amountPaid < offlineInvoice.grandTotal) balanceAdded = offlineInvoice.grandTotal - offlineInvoice.amountPaid;

            db.prepare(`
              UPDATE customers 
              SET totalPurchases = totalPurchases + ?, 
                  outstandingBalance = outstandingBalance + ?, 
                  updatedAt = ? 
              WHERE _id = ?
            `).run(offlineInvoice.grandTotal, balanceAdded, timestamp, offlineInvoice.customerId);
            
            queueSync('UPDATE', 'customers', offlineInvoice.customerId, { 
              $inc: { totalPurchases: offlineInvoice.grandTotal, outstandingBalance: balanceAdded }, 
              updatedAt: timestamp 
            });

            if (balanceAdded > 0) {
              const ledgerId = generateObjectId();
              const ledgerData = {
                _id: ledgerId,
                entityType: 'POSCustomer',
                entityId: offlineInvoice.customerId,
                transactionType: 'Debit',
                amount: balanceAdded,
                description: `Credit sale against Offline Invoice ${invoiceData.invoiceNumber}`,
                date: timestamp,
                createdAt: timestamp,
                updatedAt: timestamp
              };
              const ledgCols = Object.keys(ledgerData);
              const ledgVals = Object.values(ledgerData);
              db.prepare(`INSERT INTO ledgers (${ledgCols.join(', ')}) VALUES (${ledgCols.map(()=>'?').join(', ')})`).run(...ledgVals);
              queueSync('INSERT', 'ledgers', ledgerId, ledgerData);
            }
          }

          synced++;
        } catch (err) {
          console.error(`[Sync] Failed to sync invoice:`, offlineInvoice.invoiceNumber, err.message);
          errors.push({ invoiceNumber: offlineInvoice.invoiceNumber, error: err.message });
          failed++;
        }
      }
    })();

    return NextResponse.json({
      success: true,
      synced,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Bulk Sync API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
