import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import POSCustomer from '@/lib/models/POSCustomer';
import Product from '@/lib/models/Product';

/**
 * POST /api/invoices/sync
 * 
 * Accepts an array of offline invoices collected from IndexedDB
 * and saves them to MongoDB, updating stock and customer balances.
 */
export async function POST(request) {
  try {
    await dbConnect();
    const { invoices } = await request.json();

    if (!Array.isArray(invoices) || invoices.length === 0) {
      return NextResponse.json({ success: false, error: 'No invoices to sync' }, { status: 400 });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const offlineInvoice of invoices) {
      try {
        // Check for duplicate (in case sync is called twice)
        const existing = await POSInvoice.findOne({
          invoiceNumber: offlineInvoice.invoiceNumber
        });
        
        if (existing) {
          synced++; // Already saved, count as done
          continue;
        }

        // Build the invoice document (strip local-only fields)
        const { localId, synced: _, offlineMode, ...invoiceData } = offlineInvoice;

        const savedInvoice = await POSInvoice.create(invoiceData);

        // Update stock for each item
        for (const item of savedInvoice.items) {
          if (item.productId) {
            await Product.findByIdAndUpdate(item.productId, {
              $inc: { stock: -item.quantity }
            });
          }
        }

        // If customer is attached and it was Udhaar, update their balance
        if (savedInvoice.customerId && savedInvoice.paymentMethod === 'Udhaar') {
          const pendingAmount = savedInvoice.grandTotal - savedInvoice.amountPaid;
          if (pendingAmount > 0) {
            await POSCustomer.findByIdAndUpdate(savedInvoice.customerId, {
              $inc: {
                outstandingBalance: pendingAmount,
                totalPurchases: savedInvoice.grandTotal,
              },
              $set: { lastPurchaseDate: savedInvoice.date || new Date() }
            });
          }
        }

        synced++;
      } catch (err) {
        console.error(`[Sync] Failed to sync invoice:`, offlineInvoice.invoiceNumber, err.message);
        errors.push({ invoiceNumber: offlineInvoice.invoiceNumber, error: err.message });
        failed++;
      }
    }

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
