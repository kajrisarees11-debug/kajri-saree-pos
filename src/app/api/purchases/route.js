import { NextResponse } from 'next/server';
import { purchases } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await purchases.getAll({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [purchases GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await purchases.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [purchases POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
