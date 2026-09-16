import { NextResponse } from 'next/server';
import { invoices, IS_CLOUD } from '@/lib/dataAdapter';
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

async function generateInvoiceNumber() {
  if (IS_CLOUD) {
    await dbConnect();
    const POSInvoice = (await import('@/lib/models/POSInvoice')).default;
    const count = await POSInvoice.countDocuments();
    return `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
  }
  const db = require('@/lib/sqlite').default;
  const count = db.prepare('SELECT COUNT(*) as c FROM invoices').get().c;
  return `INV-${new Date().getFullYear()}-${(count + 1).toString().padStart(4, '0')}`;
}

function isUniqueConstraintError(err) {
  return err.code === 11000 || err.code === 'SQLITE_CONSTRAINT_UNIQUE';
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Stock floor check up front — before writing anything — so an
    // over-sell attempt fails cleanly instead of driving stock negative.
    if (body.items?.length) {
      const { products } = await import('@/lib/dataAdapter');
      for (const item of body.items) {
        if (!item.productId) continue;
        const product = await products.getById(item.productId);
        if (product && (product.stock ?? 0) < item.quantity) {
          return NextResponse.json({
            success: false,
            error: `Insufficient stock for "${product.name}" — only ${product.stock} available, ${item.quantity} requested.`,
          }, { status: 400 });
        }
      }
    }

    // Invoice creation, stock deduction, and customer balance/ledger update
    // all happen atomically together (per-backend transaction) — see
    // invoices.createWithEffects(). Idempotent on body.idempotencyKey.
    //
    // Invoice-number generation (COUNT then +1) isn't itself locked against
    // a concurrent request doing the same read, so two simultaneous
    // checkouts can compute the same number — the actual INSERT's unique
    // constraint is what catches that, at which point we just regenerate a
    // fresh number and retry, rather than failing a legitimate concurrent sale.
    const explicitInvoiceNumber = body.invoiceNumber;
    let lastError;
    for (let attempt = 0; attempt < 5; attempt++) {
      if (!explicitInvoiceNumber) {
        body.invoiceNumber = await generateInvoiceNumber();
      }
      try {
        const { data: invoiceData, isNew } = await invoices.createWithEffects(body);
        return NextResponse.json({ success: true, data: invoiceData, replay: !isNew }, { status: isNew ? 201 : 200 });
      } catch (err) {
        lastError = err;
        // Only worth retrying if it was our own generated number that
        // collided — a caller-supplied invoiceNumber colliding is a real
        // conflict, not a race to paper over.
        if (!explicitInvoiceNumber && isUniqueConstraintError(err)) continue;
        throw err;
      }
    }
    throw lastError;
  } catch (error) {
    console.error('API Error [invoices POST]:', error);
    const status = error.code === 'INSUFFICIENT_STOCK' ? 409 : 400;
    return NextResponse.json({ success: false, error: error.message }, { status });
  }
}
