import { NextResponse } from 'next/server';
import '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

/**
 * GET /api/backup
 * Export the full database as a downloadable JSON file — MongoDB on Vercel,
 * local SQLite on desktop, whichever backend is actually active.
 */
export async function GET() {
  try {
    let data;

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
  } catch (error) {
    console.error('[Backup Error]', error);
    return NextResponse.json({ success: false, error: 'Failed to generate backup' }, { status: 500 });
  }
}
