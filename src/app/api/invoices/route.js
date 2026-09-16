import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const invoices = db.prepare('SELECT * FROM invoices ORDER BY createdAt DESC LIMIT 100').all().map(inv => ({
      ...inv,
      items: inv.items ? JSON.parse(inv.items) : [],
      customerId: inv.customerId ? db.prepare('SELECT * FROM customers WHERE _id = ?').get(inv.customerId) : null
    }));
    return NextResponse.json({ success: true, data: invoices });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const timestamp = new Date().toISOString();

    if (!body.invoiceNumber) {
      const count = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
      body.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
    }
    
    const invoiceId = body._id || generateObjectId();
    const invoiceData = {
      _id: invoiceId,
      invoiceNumber: body.invoiceNumber,
      customerId: body.customerId || null,
      items: JSON.stringify(body.items || []),
      subTotal: body.subTotal || 0,
      taxTotal: body.taxTotal || 0,
      discountTotal: body.discountTotal || 0,
      grandTotal: body.grandTotal || 0,
      paymentMethod: body.paymentMethod || 'Cash',
      amountPaid: body.amountPaid || 0,
      balance: body.balance || 0,
      status: body.status || 'Completed',
      returnReason: body.returnReason || null,
      refundTotal: body.refundTotal || 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    db.transaction(() => {
      // 1. Create Invoice
      const invCols = Object.keys(invoiceData);
      const invVals = Object.values(invoiceData);
      db.prepare(`INSERT INTO invoices (${invCols.join(', ')}) VALUES (${invCols.map(()=>'?').join(', ')})`).run(...invVals);
      queueSync('INSERT', 'invoices', invoiceId, invoiceData);

      // 2. Update Product Inventory
      const updateProductStmt = db.prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE _id = ?');
      for (const item of body.items) {
        updateProductStmt.run(item.quantity, timestamp, item.productId);
        queueSync('UPDATE', 'products', item.productId, { $inc: { stock: -item.quantity }, updatedAt: timestamp });
      }

      // 3. Update Customer & Ledger
      if (body.customerId) {
        let balanceAdded = 0;
        if (body.paymentMethod === 'Udhaar') balanceAdded = body.grandTotal;
        else if (body.amountPaid < body.grandTotal) balanceAdded = body.grandTotal - body.amountPaid;

        db.prepare(`
          UPDATE customers 
          SET totalPurchases = totalPurchases + ?, 
              outstandingBalance = outstandingBalance + ?, 
              updatedAt = ? 
          WHERE _id = ?
        `).run(body.grandTotal, balanceAdded, timestamp, body.customerId);
        
        queueSync('UPDATE', 'customers', body.customerId, { 
          $inc: { totalPurchases: body.grandTotal, outstandingBalance: balanceAdded }, 
          updatedAt: timestamp 
        });

        if (balanceAdded > 0) {
          const ledgerId = generateObjectId();
          const ledgerData = {
            _id: ledgerId,
            entityType: 'POSCustomer',
            entityId: body.customerId,
            transactionType: 'Debit',
            amount: balanceAdded,
            description: `Credit sale against Invoice ${invoiceData.invoiceNumber}`,
            date: timestamp,
            createdAt: timestamp,
            updatedAt: timestamp
          };
          const ledgCols = Object.keys(ledgerData);
          const ledgVals = Object.values(ledgerData);
          db.prepare(`INSERT INTO ledgers (${ledgCols.join(', ')}) VALUES (${ledgCols.map(()=>'?').join(', ')})`).run(...ledgVals);
          queueSync('INSERT', 'ledgers', ledgerId, ledgerData);
        }
      }
    })();

    const returnData = { ...invoiceData, items: body.items };
    return NextResponse.json({ success: true, data: returnData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
