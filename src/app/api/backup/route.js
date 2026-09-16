import { NextResponse } from 'next/server';
import { IS_CLOUD } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * GET /api/backup
 * Export the full database as a downloadable JSON file — MongoDB on Vercel,
 * local SQLite on desktop, whichever backend is actually active.
 */
export async function GET() {
  try {
    let data;

    if (IS_CLOUD) {
      await dbConnect();
      const { default: Product } = await import('@/lib/models/Product');
      const { default: POSCustomer } = await import('@/lib/models/POSCustomer');
      const { default: Supplier } = await import('@/lib/models/Supplier');
      const { default: POSInvoice } = await import('@/lib/models/POSInvoice');
      const { default: Purchase } = await import('@/lib/models/Purchase');
      const { default: Expense } = await import('@/lib/models/Expense');
      const { default: Ledger } = await import('@/lib/models/Ledger');
      const { default: StoreConfig } = await import('@/lib/models/StoreConfig');

      const [products, customers, suppliers, invoices, purchases, expenses, ledgers, settings] = await Promise.all([
        Product.find({}).lean(),
        POSCustomer.find({}).lean(),
        Supplier.find({}).lean(),
        POSInvoice.find({}).lean(),
        Purchase.find({}).lean(),
        Expense.find({}).lean(),
        Ledger.find({}).lean(),
        StoreConfig.find({}).lean(),
      ]);

      const toId = (docs) => docs.map(d => ({ ...d, _id: d._id.toString() }));

      data = {
        products: toId(products),
        customers: toId(customers),
        suppliers: toId(suppliers),
        invoices: toId(invoices),
        purchases: toId(purchases),
        expenses: toId(expenses),
        ledgers: toId(ledgers),
        settings: toId(settings),
      };
    } else {
      const db = require('@/lib/sqlite').default;

      data = {
        products: db.prepare('SELECT * FROM products').all().map(p => ({ ...p, images: p.images ? JSON.parse(p.images) : [] })),
        customers: db.prepare('SELECT * FROM customers').all(),
        suppliers: db.prepare('SELECT * FROM suppliers').all(),
        invoices: db.prepare('SELECT * FROM invoices').all().map(inv => ({ ...inv, items: inv.items ? JSON.parse(inv.items) : [] })),
        purchases: db.prepare('SELECT * FROM purchases').all().map(p => ({ ...p, items: p.items ? JSON.parse(p.items) : [] })),
        expenses: db.prepare('SELECT * FROM expenses').all(),
        ledgers: db.prepare('SELECT * FROM ledgers').all(),
        settings: db.prepare('SELECT * FROM settings').all(),
      };
    }

    const dump = {
      timestamp: new Date().toISOString(),
      version: '2.0',
      source: IS_CLOUD ? 'kajri-pos-mongodb' : 'kajri-pos-sqlite',
      data,
    };

    return new NextResponse(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kajri_pos_backup_${new Date().getTime()}.json"`,
      },
    });
  } catch (error) {
    console.error('[Backup Error]', error);
    return NextResponse.json({ success: false, error: 'Failed to generate backup' }, { status: 500 });
  }
}
