import { NextResponse } from 'next/server';
import { IS_CLOUD } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    if (IS_CLOUD) {
      // On Vercel, we use MongoDB directly — no SQLite sync queue needed
      return NextResponse.json({ success: true, data: { status: 'cloud_mode', message: 'Using MongoDB directly — no sync needed' } });
    }

    const { processSyncQueue, performDownsync } = await import('@/lib/syncEngine');
    const upSync = await processSyncQueue();
    const downSync = await performDownsync();
    return NextResponse.json({ success: true, data: { upSync, downSync } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST() {
  try {
    if (IS_CLOUD) {
      return NextResponse.json({ success: true, data: { status: 'cloud_mode' } });
    }

    const { processSyncQueue, performDownsync } = await import('@/lib/syncEngine');
    const upSync = await processSyncQueue();
    const downSync = await performDownsync();
    return NextResponse.json({ success: true, data: { upSync, downSync } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
