import { NextResponse } from 'next/server';
import '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // On Vercel, we use MongoDB directly — no SQLite sync queue needed
    return NextResponse.json({ success: true, data: { status: 'cloud_mode', message: 'Using MongoDB directly — no sync needed' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    return NextResponse.json({ success: true, data: { status: 'cloud_mode' } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
