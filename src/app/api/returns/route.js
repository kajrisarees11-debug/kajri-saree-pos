import { NextResponse } from 'next/server';
import { invoices } from '@/lib/dataAdapter';

/**
 * POST /api/returns
 * Legacy route — use POST /api/invoices/[id]/return instead. Calls the same
 * adapter function directly (not a self-referential HTTP fetch — that
 * previously dropped refundTotal entirely and, once /api/* required auth,
 * would have started failing with 401 since a server-to-server fetch here
 * carries no session cookie).
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { invoiceId, items, reason, refundTotal } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'invoiceId is required. Use /api/invoices/[id]/return' }, { status: 400 });
    }

    const data = await invoices.processReturn(invoiceId, { items, reason, refundTotal: refundTotal || 0 });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }
    if (error.code === 'ALREADY_RETURNED') {
      return NextResponse.json({ success: false, error: 'Invoice already returned' }, { status: 400 });
    }
    console.error('[Returns Legacy Route Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
