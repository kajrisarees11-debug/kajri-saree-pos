import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Supplier from '@/lib/models/Supplier';

export async function GET() {
  try {
    await dbConnect();
    const suppliers = await Supplier.find().sort({ name: 1 });
    return NextResponse.json({ success: true, data: suppliers });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    const supplier = await Supplier.create(body);
    return NextResponse.json({ success: true, data: supplier }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
