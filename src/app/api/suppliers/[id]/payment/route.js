import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

/**
 * POST /api/suppliers/[id]/payment
 * Record a payment made to a supplier (reduces supplier payable balance).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { amount, mode, note } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    const supplier = db.prepare('SELECT * FROM suppliers WHERE _id = ?').get(id);
    if (!supplier) {
      return NextResponse.json({ success: false, error: 'Supplier not found' }, { status: 404 });
    }

    const prevBalance = supplier.outstandingBalance || 0;
    const newBalance = Math.max(0, prevBalance - amount);
    const timestamp = new Date().toISOString();

    const ledgerId = generateObjectId();
    const ledgerEntry = {
      _id: ledgerId,
      entityType: 'Supplier',
      entityId: id,
      transactionType: 'Debit',
      amount,
      description: `Payment made (${mode || 'Cash'})${note ? ` — ${note}` : ''}`,
      date: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.transaction(() => {
      db.prepare('UPDATE suppliers SET outstandingBalance = ?, updatedAt = ? WHERE _id = ?').run(newBalance, timestamp, id);
      queueSync('UPDATE', 'suppliers', id, { outstandingBalance: newBalance, updatedAt: timestamp });

      const ledgerCols = Object.keys(ledgerEntry);
      const ledgerVals = Object.values(ledgerEntry);
      const ledgerPlaceholders = ledgerCols.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ledgers (${ledgerCols.join(', ')}) VALUES (${ledgerPlaceholders})`).run(...ledgerVals);
      queueSync('INSERT', 'ledgers', ledgerId, ledgerEntry);
    })();

    return NextResponse.json({
      success: true,
      data: {
        supplier: id,
        amountPaid: amount,
        previousBalance: prevBalance,
        newBalance: newBalance,
      },
    });
  } catch (error) {
    console.error('[Supplier Payment Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
