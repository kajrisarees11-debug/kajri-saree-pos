import { NextResponse } from 'next/server';
import { invoices, customers, products } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

/**
 * GET /api/invoices/[id]
 * Fetch a single invoice by ID with customer and items populated.
 * Goes through the universal adapter, so it works against whichever
 * backend (MongoDB on Vercel, SQLite on desktop) is actually active.
 */
export async function GET(request, { params }) {
  try {
    const { id } = await params;

    const invoice = await invoices.getById(id);

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    // Join customer info
    if (invoice.customerId) {
      const customer = await customers.getById(invoice.customerId);
      invoice.customerId = customer || { _id: invoice.customerId, name: 'Unknown' };
    }

    // Enrich items with product details
    invoice.items = await Promise.all(
      (invoice.items || []).map(async (item) => {
        if (item.productId) {
          const product = await products.getById(item.productId);
          if (product) {
            const { _id, name, sku, barcode, price } = product;
            return { ...item, productId: { _id, name, sku, barcode, price } };
          }
        }
        return item;
      })
    );

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    console.error('[Invoice GET Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
