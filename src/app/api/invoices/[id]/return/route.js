import { NextResponse } from 'next/server';
import { invoices } from '@/lib/dataAdapter';

/**
 * POST /api/invoices/[id]/return
 * Process a sales return — marks invoice as Returned, restores product stock,
 * and reduces customer outstanding balance if it was an Udhaar sale.
 * Works against whichever backend (MongoDB on Vercel, SQLite on desktop) is active.
 */
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { items, reason, refundTotal } = await request.json();

    const data = await invoices.processReturn(id, { items, reason, refundTotal });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }
    if (error.code === 'ALREADY_RETURNED') {
      return NextResponse.json({ success: false, error: 'Invoice already returned' }, { status: 400 });
    }
    console.error('[Invoice Return Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
