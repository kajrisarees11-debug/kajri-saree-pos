import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

/**
 * POST /api/customers/[id]/payment
 * Record a payment received from a customer (reduces outstanding balance).
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { amount, mode, note } = await request.json();

    if (!amount || amount <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }

    const customer = db.prepare('SELECT * FROM customers WHERE _id = ?').get(id);
    if (!customer) {
      return NextResponse.json({ success: false, error: 'Customer not found' }, { status: 404 });
    }

    const prevBalance = customer.outstandingBalance || 0;
    const newBalance = Math.max(0, prevBalance - amount);
    const timestamp = new Date().toISOString();

    const ledgerId = generateObjectId();
    const ledgerEntry = {
      _id: ledgerId,
      entityType: 'POSCustomer',
      entityId: id,
      transactionType: 'Credit',
      amount,
      description: `Payment received (${mode || 'Cash'})${note ? ` — ${note}` : ''}`,
      date: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.transaction(() => {
      // 1. Update customer balance
      db.prepare('UPDATE customers SET outstandingBalance = ?, updatedAt = ? WHERE _id = ?').run(newBalance, timestamp, id);
      queueSync('UPDATE', 'customers', id, { outstandingBalance: newBalance, updatedAt: timestamp });

      // 2. Insert ledger entry
      const ledgerCols = Object.keys(ledgerEntry);
      const ledgerVals = Object.values(ledgerEntry);
      const ledgerPlaceholders = ledgerCols.map(() => '?').join(', ');
      db.prepare(`INSERT INTO ledgers (${ledgerCols.join(', ')}) VALUES (${ledgerPlaceholders})`).run(...ledgerVals);
      queueSync('INSERT', 'ledgers', ledgerId, ledgerEntry);
    })();

    return NextResponse.json({
      success: true,
      data: {
        customer: id,
        amountReceived: amount,
        previousBalance: prevBalance,
        newBalance: newBalance,
      },
    });
  } catch (error) {
    console.error('[Customer Payment Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
