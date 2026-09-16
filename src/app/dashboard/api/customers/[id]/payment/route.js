import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSCustomer from '@/lib/models/POSCustomer';
import Ledger from '@/lib/models/Ledger';

/**
 * POST /api/customers/[id]/payment
 * Record a payment received from a customer (reduces outstanding balance).
 */
export async function POST(request, { params }) {
  try {
    await dbConnect();
    const { id } = await params;
    const { amount, mode, note } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    const customer = await POSCustomer.findById(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    // Reduce outstanding balance
    const prevBalance = customer.outstandingBalance || 0;
    customer.outstandingBalance = Math.max(0, prevBalance - amount);
    await customer.save();

    // Create a ledger credit entry
    await Ledger.create({
      entityType: 'POSCustomer',
      entityId: id,
      transactionType: 'Credit',
      amount,
      description: `Payment received (${mode || 'Cash'})${note ? ` — ${note}` : ''}`,
      date: new Date(),
    });

    return NextResponse.json({
      success: true,
      data: {
        customer: customer._id,
        amountReceived: amount,
        previousBalance: prevBalance,
        newBalance: customer.outstandingBalance,
      },
    });
  } catch (error) {
    console.error('[Customer Payment Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
