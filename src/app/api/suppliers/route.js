import { NextResponse } from 'next/server';
import { suppliers } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await suppliers.getAll({ search: searchParams.get('search') });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [suppliers GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await suppliers.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [suppliers POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { _id } = body;
    if (!_id) throw new Error('_id is required');
    const data = await suppliers.update(_id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [suppliers PUT]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
