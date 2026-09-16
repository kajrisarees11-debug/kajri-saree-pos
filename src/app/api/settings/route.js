import { NextResponse } from 'next/server';
import { settings } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await settings.get();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [settings GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const data = await settings.upsert(body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [settings PUT]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await settings.upsert(body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [settings POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
