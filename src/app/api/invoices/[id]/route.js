import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import POSCustomer from '@/lib/models/POSCustomer';
import Product from '@/lib/models/Product';

export async function GET(request, { params }) {
  try {
    await dbConnect();
    
    // We await params inside app router for dynamic segments in next 15 if needed, but it's passed as arg
    const { id } = await params;

    const invoice = await POSInvoice.findById(id)
      .populate('customerId')
      .populate('items.productId')
      .lean();

    if (!invoice) {
      return NextResponse.json({ success: false, error: 'Invoice not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: invoice });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
