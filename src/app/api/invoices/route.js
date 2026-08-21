import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import Product from '@/lib/models/Product';
import POSCustomer from '@/lib/models/POSCustomer';
import Ledger from '@/lib/models/Ledger';

export async function GET() {
  try {
    await dbConnect();
    const invoices = await POSInvoice.find().populate('customerId').sort({ date: -1 }).limit(100);
    return NextResponse.json({ success: true, data: invoices });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();

    // 1. Create the Invoice
    // Auto-generate invoice number if not provided
    if (!body.invoiceNumber) {
      const count = await POSInvoice.countDocuments();
      body.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    }
    
    const invoice = await POSInvoice.create(body);

    // 2. Update Product Inventory (Decrease stock)
    const bulkOps = body.items.map(item => ({
      updateOne: {
        filter: { _id: item.productId },
        update: { 
          $inc: { stock: -item.quantity }
        }
      }
    }));

    if (bulkOps.length > 0) {
      await Product.bulkWrite(bulkOps);
    }

    // 3. Update Customer & Ledger (if applicable)
    if (body.customerId) {
      let balanceAdded = 0;
      
      if (body.paymentMethod === 'Udhaar') {
        balanceAdded = body.grandTotal;
      } else if (body.amountPaid < body.grandTotal) {
        // Partial payment
        balanceAdded = body.grandTotal - body.amountPaid;
      }

      await POSCustomer.findByIdAndUpdate(body.customerId, {
        $inc: { 
          totalPurchases: body.grandTotal,
          outstandingBalance: balanceAdded
        },
        $set: { lastPurchaseDate: new Date() }
      });

      // If Udhaar, log to Ledger
      if (balanceAdded > 0) {
        await Ledger.create({
          entityType: 'POSCustomer',
          entityId: body.customerId,
          transactionType: 'Debit', // Customer owes us
          amount: balanceAdded,
          referenceId: invoice._id,
          description: `Credit sale against Invoice ${invoice.invoiceNumber}`
        });
      }
    }

    return NextResponse.json({ success: true, data: invoice }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
