import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import StoreConfig from '@/lib/models/StoreConfig';

export async function GET() {
  try {
    await dbConnect();
    let config = await StoreConfig.findOne();
    if (!config) {
      config = await StoreConfig.create({}); // Create default if none exists
    }
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    let config = await StoreConfig.findOne();
    if (config) {
      config = await StoreConfig.findByIdAndUpdate(config._id, body, { new: true });
    } else {
      config = await StoreConfig.create(body);
    }
    
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
