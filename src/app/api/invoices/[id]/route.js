import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/[id]
 * Fetch a single invoice by ID with customer and items populated.
 * Uses local SQLite — 100% offline capable.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const invoice = db.prepare('SELECT * FROM invoices WHERE _id = ?').get(id);

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    // Parse items JSON
    invoice.items = invoice.items ? JSON.parse(invoice.items) : [];

    // Join customer info
    if (invoice.customerId) {
      const customer = db.prepare('SELECT * FROM customers WHERE _id = ?').get(invoice.customerId);
      invoice.customerId = customer || { _id: invoice.customerId, name: 'Unknown' };
    }

    // Enrich items with product details
    invoice.items = invoice.items.map(item => {
      if (item.productId) {
        const product = db.prepare('SELECT _id, name, sku, barcode, price FROM products WHERE _id = ?').get(item.productId);
        if (product) {
          return { ...item, productId: product };
        }
      }
      return item;
    });

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    console.error('[Invoice GET Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
