import { NextResponse } from 'next/server';
import { generateObjectId } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * POST /api/customers/[id]/payment
 * Record a payment received from a customer (reduces outstanding balance).
 * Works against whichever backend (MongoDB on Vercel, SQLite on desktop) is active.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { amount, mode, note } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();

    await dbConnect();
    const mongoose = (await import('mongoose')).default;
    const { default: POSCustomer } = await import('@/lib/models/POSCustomer');
    const { default: Ledger } = await import('@/lib/models/Ledger');

    const session = await mongoose.startSession();
    let prevBalance = 0;
    let newBalance = 0;
    try {
      const customer = await POSCustomer.findById(id);
      if (!customer) {
        return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
      }
      prevBalance = customer.outstandingBalance || 0;
      newBalance = Math.max(0, prevBalance - amount);
      // Record what was actually applied to the balance, not the raw input
      // — otherwise an overpayment (e.g. an extra zero typed in) leaves the
      // ledger permanently overstating total payments versus the floored balance.
      const amountApplied = prevBalance - newBalance;
      const overpaid = amount - amountApplied;

      await session.withTransaction(async () => {
        customer.outstandingBalance = newBalance;
        customer.updatedAt = timestamp;
        await customer.save({ session });

        await Ledger.create([{
          _id: generateObjectId(),
          entityType: 'POSCustomer',
          entityId: id,
          transactionType: 'Credit',
          amount: amountApplied,
          description: `Payment received (${mode || 'Cash'})${note ? ` — ${note}` : ''}${overpaid > 0 ? ` [overpaid by ${overpaid}, balance was already ${prevBalance}]` : ''}`,
          date: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        }], { session });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      success: true,
      data: { customer: id, amountReceived: amount, appliedToBalance: prevBalance - newBalance, previousBalance: prevBalance, newBalance },
    });
  } catch (error) {
    console.error('[Customer Payment Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
