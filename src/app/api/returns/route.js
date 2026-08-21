import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import POSCustomer from '@/lib/models/POSCustomer';
import Product from '@/lib/models/Product';

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const { invoiceId, items } = body;

    if (!invoiceId || !items || !Array.isArray(items)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    const invoice = await POSInvoice.findById(invoiceId);
    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }
    
    if (invoice.status === 'Returned') {
      return NextResponse.json({ success: false, error: 'Invoice is already returned' }, { status: 400 });
    }

    let refundAmount = 0;

    // Process each returned item
    for (const returnItem of items) {
      // Find the item inside the invoice by its nested _id
      const invoiceItem = invoice.items.id(returnItem.itemId);
      
      if (!invoiceItem) continue;

      const returnQty = Number(returnItem.quantity);
      if (returnQty > invoiceItem.quantity) continue;

      // Calculate refund amount based on proportional price (including proportional tax/discount if any)
      // For simplicity, we take the price * returnQty
      const itemTotalWithoutTax = invoiceItem.price * returnQty;
      const itemTax = (itemTotalWithoutTax * invoiceItem.tax) / 100;
      refundAmount += (itemTotalWithoutTax + itemTax);

      // Add stock back to inventory
      await Product.findByIdAndUpdate(invoiceItem.productId, {
        $inc: { stock: returnQty }
      });
    }

    // Update the invoice status
    invoice.status = 'Returned';
    await invoice.save();

    // If there is a customer attached, handle Udhaar reduction
    if (invoice.customerId) {
      const customer = await POSCustomer.findById(invoice.customerId);
      if (customer && customer.outstandingBalance > 0) {
        // Reduce the customer's outstanding balance by the refund amount, down to 0 max
        const newBalance = Math.max(0, customer.outstandingBalance - refundAmount);
        customer.outstandingBalance = newBalance;
        await customer.save();
      }
    }

    return NextResponse.json({ success: true, data: { refundAmount } });

  } catch (error) {
    console.error('Returns API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
