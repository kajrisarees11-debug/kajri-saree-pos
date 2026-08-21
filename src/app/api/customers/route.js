import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSCustomer from '@/lib/models/POSCustomer';

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const mobile = searchParams.get('mobile');

    let query = {};
    if (mobile) {
      query.mobileNumber = mobile;
    } else if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { mobileNumber: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const customers = await POSCustomer.find(query).sort({ lastPurchaseDate: -1 }).limit(50);
    return NextResponse.json({ success: true, data: customers });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    // Check if customer already exists by mobile
    let customer = await POSCustomer.findOne({ mobileNumber: body.mobileNumber });
    if (customer) {
      return NextResponse.json({ success: true, data: customer }, { status: 200 }); // Return existing
    }

    customer = await POSCustomer.create(body);
    return NextResponse.json({ success: true, data: customer }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
