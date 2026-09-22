import { NextResponse } from 'next/server';
import { generateObjectId } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * POST /api/suppliers/[id]/payment
 * Record a payment made to a supplier (reduces supplier payable balance).
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
    const { default: Supplier } = await import('@/lib/models/Supplier');
    const { default: Ledger } = await import('@/lib/models/Ledger');

    const session = await mongoose.startSession();
    let prevBalance = 0;
    let newBalance = 0;
    try {
      const supplier = await Supplier.findById(id);
      if (!supplier) {
        return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
      }
      prevBalance = supplier.outstandingBalance || 0;
      newBalance = Math.max(0, prevBalance - amount);
      const amountApplied = prevBalance - newBalance;
      const overpaid = amount - amountApplied;

      await session.withTransaction(async () => {
        supplier.outstandingBalance = newBalance;
        supplier.updatedAt = timestamp;
        await supplier.save({ session });

        await Ledger.create([{
          _id: generateObjectId(),
          entityType: 'Supplier',
          entityId: id,
          transactionType: 'Debit',
          amount: amountApplied,
          description: `Payment made (${mode || 'Cash'})${note ? ` — ${note}` : ''}${overpaid > 0 ? ` [overpaid by ${overpaid}, balance was already ${prevBalance}]` : ''}`,
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
      data: { supplier: id, amountPaid: amount, appliedToBalance: prevBalance - newBalance, previousBalance: prevBalance, newBalance },
    });
  } catch (error) {
    console.error('[Supplier Payment Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
