import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const mobile = searchParams.get('mobile');

    let query = 'SELECT * FROM customers';
    const params = [];

    if (mobile) {
      query += ' WHERE mobileNumber = ?';
      params.push(mobile);
    } else if (search) {
      query += ' WHERE name LIKE ? OR mobileNumber LIKE ?';
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY createdAt DESC LIMIT 50';

    const stmt = db.prepare(query);
    const customers = stmt.all(...params);

    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    // Check if customer already exists by mobile
    if (body.mobileNumber) {
      const existing = db.prepare('SELECT * FROM customers WHERE mobileNumber = ?').get(body.mobileNumber);
      if (existing) {
        return NextResponse.json({ success: true, data: existing }, { status: 200 }); // Return existing
      }
    }

    const _id = body._id || generateObjectId();
    const timestamp = new Date().toISOString();
    
    const customerData = {
      _id,
      name: body.name || '',
      mobileNumber: body.mobileNumber || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      pincode: body.pincode || null,
      outstandingBalance: body.outstandingBalance || 0,
      totalPurchases: body.totalPurchases || 0,
      gstin: body.gstin || null,
      customerType: body.customerType || 'Retail',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const columns = Object.keys(customerData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(customerData);

    const stmt = db.prepare(`INSERT INTO customers (${columns.join(', ')}) VALUES (${placeholders})`);
    
    db.transaction(() => {
      stmt.run(...values);
      queueSync('INSERT', 'customers', _id, customerData);
    })();
    
    return NextResponse.json({ success: true, data: customerData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
