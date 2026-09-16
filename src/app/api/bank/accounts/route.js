import { NextResponse } from 'next/server';
import { bankAccounts } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await bankAccounts.getAll();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [bank/accounts GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body.name) {
      return NextResponse.json({ success: false, error: 'Bank name is required' }, { status: 400 });
    }
    const data = await bankAccounts.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [bank/accounts POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
