import { NextResponse } from 'next/server';
import { ledgers } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { entityId } = await params;
    const data = await ledgers.getByEntity(entityId);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [ledgers/:entityId GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
