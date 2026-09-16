import { NextResponse } from 'next/server';

/**
 * POST /api/returns
 * Legacy route — redirected to the correct per-invoice return endpoint.
 * Use POST /api/invoices/[id]/return instead.
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { invoiceId, items, reason } = body;

    if (!invoiceId) {
      return NextResponse.json({ success: false, error: 'invoiceId is required. Use /api/invoices/[id]/return' }, { status: 400 });
    }

    // Delegate to the correct per-invoice return route
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/invoices/${invoiceId}/return`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items, reason, refundTotal: 0 }),
    });

    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    console.error('[Returns Legacy Route Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
