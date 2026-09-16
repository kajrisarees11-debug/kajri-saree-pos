import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const purchases = db.prepare('SELECT * FROM purchases ORDER BY date DESC').all().map(p => ({
      ...p,
      items: p.items ? JSON.parse(p.items) : [],
      supplierId: p.supplierId ? db.prepare('SELECT * FROM suppliers WHERE _id = ?').get(p.supplierId) : null
    }));
    return NextResponse.json({ success: true, data: purchases });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const timestamp = new Date().toISOString();
    
    const purchaseId = body._id || generateObjectId();
    const purchaseData = {
      _id: purchaseId,
      supplierId: body.supplierId || null,
      invoiceNumber: body.invoiceNumber || null,
      date: body.date || timestamp,
      items: JSON.stringify(body.items || []),
      totalAmount: body.totalAmount || 0,
      status: body.status || 'Completed',
      notes: body.notes || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.transaction(() => {
      // 1. Create Purchase
      const cols = Object.keys(purchaseData);
      const vals = Object.values(purchaseData);
      db.prepare(`INSERT INTO purchases (${cols.join(', ')}) VALUES (${cols.map(()=>'?').join(', ')})`).run(...vals);
      queueSync('INSERT', 'purchases', purchaseId, purchaseData);

      // 2. Update Product Inventory & Purchase Price
      if (body.items && body.items.length > 0) {
        const updateProd = db.prepare('UPDATE products SET stock = stock + ?, purchasePrice = ?, updatedAt = ? WHERE _id = ?');
        for (const item of body.items) {
          updateProd.run(item.quantity, item.purchasePrice, timestamp, item.productId);
          queueSync('UPDATE', 'products', item.productId, { 
            $inc: { stock: item.quantity }, 
            purchasePrice: item.purchasePrice, 
            updatedAt: timestamp 
          });
        }
      }

      // 3. Update Supplier Balance
      if (body.supplierId) {
        let balanceAdded = 0;
        if (body.status !== 'Paid') {
          balanceAdded = body.totalAmount - (body.amountPaid || 0);
        }
        
        db.prepare(`
          UPDATE suppliers 
          SET payableBalance = payableBalance + ?, 
              purchaseHistory = purchaseHistory + ?, 
              updatedAt = ? 
          WHERE _id = ?
        `).run(balanceAdded, body.totalAmount, timestamp, body.supplierId);
        
        queueSync('UPDATE', 'suppliers', body.supplierId, { 
          $inc: { payableBalance: balanceAdded, purchaseHistory: body.totalAmount }, 
          updatedAt: timestamp 
        });
      }
    })();

    const returnData = { ...purchaseData, items: body.items };
    return NextResponse.json({ success: true, data: returnData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
