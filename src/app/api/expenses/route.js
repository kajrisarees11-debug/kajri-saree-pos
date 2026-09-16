import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const expenses = db.prepare('SELECT * FROM expenses ORDER BY date DESC LIMIT 100').all();
    return NextResponse.json({ success: true, data: expenses });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    const _id = body._id || generateObjectId();
    const timestamp = new Date().toISOString();
    
    const expenseData = {
      _id,
      date: body.date || timestamp,
      category: body.category || 'General',
      amount: body.amount || 0,
      paymentMethod: body.paymentMethod || 'Cash',
      description: body.description || null,
      referenceNo: body.referenceNo || null,
      receiptImage: body.receiptImage || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const columns = Object.keys(expenseData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(expenseData);

    const stmt = db.prepare(`INSERT INTO expenses (${columns.join(', ')}) VALUES (${placeholders})`);
    
    db.transaction(() => {
      stmt.run(...values);
      queueSync('INSERT', 'expenses', _id, expenseData);
    })();
    
    return NextResponse.json({ success: true, data: expenseData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
