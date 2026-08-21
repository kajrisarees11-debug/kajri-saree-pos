import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Product from '@/lib/models/Product';

export async function GET(request) {
  try {
    await dbConnect();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const barcode = searchParams.get('barcode');

    let query = {};

    if (barcode) {
      query = { barcode };
    } else if (search) {
      query = {
        $or: [
          { name: { $regex: search, $options: 'i' } },
          { sku: { $regex: search, $options: 'i' } },
          { barcode: { $regex: search, $options: 'i' } }
        ]
      };
    }

    // Limit to 50 items for standard list view
    const products = await Product.find(query).limit(50).sort({ createdAt: -1 });
    
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    // Strip empty category to avoid ObjectId cast error
    if (body.category === '' || body.category === null) {
      delete body.category;
    }
    if (body.supplierId === '' || body.supplierId === null) {
      delete body.supplierId;
    }
    
    const product = await Product.create(body);
    
    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    await dbConnect();
    const body = await request.json();
    
    if (Array.isArray(body)) {
      const updates = body.map(p => ({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { barcode: p.barcode } }
        }
      }));
      await Product.bulkWrite(updates);
      return NextResponse.json({ success: true, message: 'Bulk update successful' });
    }

    const { _id, ...updateData } = body;
    const product = await Product.findByIdAndUpdate(_id, updateData, { new: true });
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
