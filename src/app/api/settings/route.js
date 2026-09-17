import { NextResponse } from 'next/server';
import { settings, IS_CLOUD } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { mongoSyncUri, ...data } = await settings.get();
    // The MongoDB connection string (with embedded credentials) is entered
    // once via the Cloud Sync form and must never come back out through a
    // plain GET — any authenticated tab on this device could otherwise read
    // it straight out of the response, defeating the whole point of keeping
    // it device-local instead of baked into the app. The UI only needs to
    // know WHETHER one is set, not what it is.
    // isCloud is synthesized here, not stored — it tells the Settings page
    // whether to show the desktop-only "Cloud Sync" section.
    return NextResponse.json({
      success: true,
      data: { ...data, isCloud: IS_CLOUD, mongoSyncUriConfigured: !!mongoSyncUri },
    });
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
