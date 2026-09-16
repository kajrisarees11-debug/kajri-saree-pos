import { NextResponse } from 'next/server';
import { cashTransactions } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await cashTransactions.getAll();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [cash/transactions GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.amount || Number(body.amount) <= 0) {
      return NextResponse.json({ success: false, error: 'Invalid amount' }, { status: 400 });
    }
    const data = await cashTransactions.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [cash/transactions POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
