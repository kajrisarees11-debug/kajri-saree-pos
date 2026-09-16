import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stmt = db.prepare('SELECT * FROM suppliers ORDER BY name ASC');
    const suppliers = stmt.all();
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Check if supplier already exists by GSTIN
    if (body.gstin) {
      const existing = db.prepare('SELECT * FROM suppliers WHERE gstin = ?').get(body.gstin);
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 }); // Return existing
      }
    }

    const _id = body._id || generateObjectId();
    const timestamp = new Date().toISOString();
    
    const supplierData = {
      _id,
      name: body.name || '',
      contactNumber: body.contactNumber || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      gstin: body.gstin || null,
      payableBalance: body.payableBalance || 0,
      outstandingBalance: body.outstandingBalance || 0,
      purchaseHistory: body.purchaseHistory || 0,
      bankName: body.bankName || null,
      accountNumber: body.accountNumber || null,
      ifscCode: body.ifscCode || null,
      upiId: body.upiId || null,
      notes: body.notes || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const columns = Object.keys(supplierData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(supplierData);

    const stmt = db.prepare(`INSERT INTO suppliers (${columns.join(', ')}) VALUES (${placeholders})`);
    
    db.transaction(() => {
      stmt.run(...values);
      queueSync('INSERT', 'suppliers', _id, supplierData);
    })();
    
    return NextResponse.json({ success: true, data: supplierData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
