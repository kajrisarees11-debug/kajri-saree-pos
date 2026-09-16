import { NextResponse } from 'next/server';
import { IS_CLOUD, generateObjectId } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * POST /api/invoices/sync
 *
 * Accepts an array of offline invoices collected from IndexedDB (queued by a
 * browser client that lost connectivity, or the desktop app) and reconciles
 * them against whichever backend is active — MongoDB on Vercel, SQLite on
 * desktop — updating stock and customer balances along the way.
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

    if (IS_CLOUD) {
      await dbConnect();
      const mongoose = (await import('mongoose')).default;
      const { default: POSInvoice } = await import('@/lib/models/POSInvoice');
      const { default: Product } = await import('@/lib/models/Product');
      const { default: POSCustomer } = await import('@/lib/models/POSCustomer');
      const { default: Ledger } = await import('@/lib/models/Ledger');

      for (const offlineInvoice of invoices) {
        try {
          // idempotencyKey (shared with the online create attempt that may
          // have actually already succeeded) takes priority over
          // invoiceNumber — an offline-generated OFF-... number never
          // matches whatever the server assigned that first time, so
          // invoiceNumber-only matching would miss that case entirely.
          const existing = offlineInvoice.idempotencyKey
            ? await POSInvoice.findOne({ idempotencyKey: offlineInvoice.idempotencyKey }).lean()
            : await POSInvoice.findOne({ invoiceNumber: offlineInvoice.invoiceNumber }).lean();
          if (existing) {
            synced++;
            continue;
          }

          const timestamp = new Date().toISOString();
          const invoiceId = generateObjectId();

          const session = await mongoose.startSession();
          try {
            await session.withTransaction(async () => {
              await POSInvoice.create([{
                _id: invoiceId,
                invoiceNumber: offlineInvoice.invoiceNumber,
                idempotencyKey: offlineInvoice.idempotencyKey || null,
                customerId: offlineInvoice.customerId || null,
                items: offlineInvoice.items || [],
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
                updatedAt: timestamp,
              }], { session });

              if (offlineInvoice.items && offlineInvoice.items.length > 0) {
                for (const item of offlineInvoice.items) {
                  await Product.findByIdAndUpdate(
                    item.productId,
                    { $inc: { stock: -item.quantity }, updatedAt: timestamp },
                    { session }
                  );
                }
              }

              if (offlineInvoice.customerId) {
                let balanceAdded = 0;
                const oiGrandTotal = offlineInvoice.grandTotal || 0;
                const oiAmountPaid = Number(offlineInvoice.amountPaid) || 0;
                if (offlineInvoice.paymentMethod === 'Udhaar') balanceAdded = oiGrandTotal;
                else if (oiAmountPaid < oiGrandTotal - 0.01) balanceAdded = oiGrandTotal - oiAmountPaid;

                await POSCustomer.findByIdAndUpdate(
                  offlineInvoice.customerId,
                  { $inc: { totalPurchases: offlineInvoice.grandTotal, outstandingBalance: balanceAdded }, updatedAt: timestamp },
                  { session }
                );

                if (balanceAdded > 0) {
                  await Ledger.create([{
                    _id: generateObjectId(),
                    entityType: 'POSCustomer',
                    entityId: offlineInvoice.customerId,
                    transactionType: 'Debit',
                    amount: balanceAdded,
                    description: `Credit sale against Offline Invoice ${offlineInvoice.invoiceNumber}`,
                    date: timestamp,
                    createdAt: timestamp,
                    updatedAt: timestamp,
                  }], { session });
                }
              }
            });
          } finally {
            await session.endSession();
          }

          synced++;
        } catch (err) {
          console.error('[Sync] Failed to sync invoice:', offlineInvoice.invoiceNumber, err.message);
          errors.push({ invoiceNumber: offlineInvoice.invoiceNumber, error: err.message });
          failed++;
        }
      }

      return NextResponse.json({ success: true, synced, failed, errors: errors.length > 0 ? errors : undefined });
    }

    const db = require('@/lib/sqlite').default;
    const { queueSync } = require('@/lib/sqlite');

    // Using transaction for safe bulk operations
    db.transaction(() => {
      for (const offlineInvoice of invoices) {
        try {
          // Check for duplicate (in case sync is called twice). idempotencyKey
          // takes priority — see the matching comment in the Mongo branch above.
          const existing = offlineInvoice.idempotencyKey
            ? db.prepare('SELECT _id FROM invoices WHERE idempotencyKey = ?').get(offlineInvoice.idempotencyKey)
            : db.prepare('SELECT _id FROM invoices WHERE invoiceNumber = ?').get(offlineInvoice.invoiceNumber);

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
            idempotencyKey: offlineInvoice.idempotencyKey || null,
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
            const oiGrandTotal = offlineInvoice.grandTotal || 0;
            const oiAmountPaid = Number(offlineInvoice.amountPaid) || 0;
            if (offlineInvoice.paymentMethod === 'Udhaar') balanceAdded = oiGrandTotal;
            else if (oiAmountPaid < oiGrandTotal - 0.01) balanceAdded = oiGrandTotal - oiAmountPaid;

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
