import { NextResponse } from 'next/server';
import { customers } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await customers.getAll({
      search: searchParams.get('search'),
      mobile: searchParams.get('mobile'),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [customers GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Return existing customer if mobile already registered
    if (body.mobileNumber) {
      const existing = await customers.findByMobile(body.mobileNumber);
      if (existing) return NextResponse.json({ success: true, data: existing });
    }

    const data = await customers.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [customers POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { _id } = body;
    if (!_id) throw new Error('_id is required');
    const data = await customers.update(_id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [customers PUT]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
