import { NextResponse } from 'next/server';
import { processSyncQueue, performDownsync } from '@/lib/syncEngine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const upSync = await processSyncQueue();
    const downSync = await performDownsync();
    return NextResponse.json({ success: true, data: { upSync, downSync } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    const upSync = await processSyncQueue();
    const downSync = await performDownsync();
    return NextResponse.json({ success: true, data: { upSync, downSync } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
