import { NextResponse } from 'next/server';
import { invoices, customers, products, ledgers, generateObjectId, IS_CLOUD } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const result = await invoices.getAll({
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '100'),
      status: searchParams.get('status'),
      search: searchParams.get('search'),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('API Error [invoices GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    // Auto-generate invoice number if not provided
    if (!body.invoiceNumber) {
      if (IS_CLOUD) {
        await dbConnect();
        const POSInvoice = (await import('@/lib/models/POSInvoice')).default;
        const count = await POSInvoice.countDocuments();
        body.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
      } else {
        const db = require('@/lib/sqlite').default;
        const count = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
        body.invoiceNumber = `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
      }
    }

    // 1. Create invoice
    const invoiceData = await invoices.create(body);

    // 2. Deduct product stock
    if (body.items?.length) {
      if (IS_CLOUD) {
        await dbConnect();
        const Product = (await import('@/lib/models/Product')).default;
        await Promise.all(body.items.map(item =>
          Product.findByIdAndUpdate(item.productId, {
            $inc: { stock: -item.quantity },
            updatedAt: now,
          })
        ));
      } else {
        const db = require('@/lib/sqlite').default;
        const { queueSync } = require('@/lib/sqlite');
        const updateStmt = db.prepare('UPDATE products SET stock = stock - ?, updatedAt = ? WHERE _id = ?');
        db.transaction(() => {
          for (const item of body.items) {
            updateStmt.run(item.quantity, now, item.productId);
            queueSync('UPDATE', 'products', item.productId, { $inc: { stock: -item.quantity }, updatedAt: now });
          }
        })();
      }
    }

    // 3. Update customer balance & ledger if credit sale
    if (body.customerId) {
      let balanceAdded = 0;
      if (body.paymentMethod === 'Udhaar') balanceAdded = body.grandTotal;
      else if (body.amountPaid < body.grandTotal) balanceAdded = body.grandTotal - body.amountPaid;

      if (IS_CLOUD) {
        await dbConnect();
        const POSCustomer = (await import('@/lib/models/POSCustomer')).default;
        await POSCustomer.findByIdAndUpdate(body.customerId, {
          $inc: { totalPurchases: body.grandTotal, outstandingBalance: balanceAdded },
          updatedAt: now,
        });
        if (balanceAdded > 0) {
          await ledgers.create({
            entityType: 'POSCustomer',
            entityId: body.customerId,
            transactionType: 'Debit',
            amount: balanceAdded,
            description: `Credit sale against Invoice ${body.invoiceNumber}`,
            date: now,
          });
        }
      } else {
        const db = require('@/lib/sqlite').default;
        const { queueSync } = require('@/lib/sqlite');
        db.transaction(() => {
          db.prepare(`
            UPDATE customers SET totalPurchases = totalPurchases + ?, 
            outstandingBalance = outstandingBalance + ?, updatedAt = ? WHERE _id = ?
          `).run(body.grandTotal, balanceAdded, now, body.customerId);
          queueSync('UPDATE', 'customers', body.customerId, {
            $inc: { totalPurchases: body.grandTotal, outstandingBalance: balanceAdded }, updatedAt: now
          });
          if (balanceAdded > 0) {
            const ledgerId = generateObjectId();
            const ledgerData = {
              _id: ledgerId, entityType: 'POSCustomer', entityId: body.customerId,
              transactionType: 'Debit', amount: balanceAdded,
              description: `Credit sale against Invoice ${body.invoiceNumber}`,
              date: now, createdAt: now, updatedAt: now,
            };
            const cols = Object.keys(ledgerData);
            db.prepare(`INSERT INTO ledgers (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...Object.values(ledgerData));
            queueSync('INSERT', 'ledgers', ledgerId, ledgerData);
          }
        })();
      }
    }

    return NextResponse.json({ success: true, data: invoiceData }, { status: 201 });
  } catch (error) {
    console.error('API Error [invoices POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
