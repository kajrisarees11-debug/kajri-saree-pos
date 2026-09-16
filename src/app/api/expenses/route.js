import { NextResponse } from 'next/server';
import { expenses } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await expenses.getAll({
      from: searchParams.get('from'),
      to: searchParams.get('to'),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [expenses GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await expenses.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [expenses POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
