import { NextResponse } from 'next/server';
import { products } from '@/lib/dataAdapter';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const data = await products.getAll({
      search: searchParams.get('search'),
      barcode: searchParams.get('barcode'),
    });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [products GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const data = await products.create(body);
    return NextResponse.json({ success: true, data }, { status: 201 });
  } catch (error) {
    console.error('API Error [products POST]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();

    // Bulk barcode update
    if (Array.isArray(body)) {
      await products.bulkUpdateBarcodes(body);
      return NextResponse.json({ success: true, message: 'Bulk update successful' });
    }

    const { _id } = body;
    if (!_id) throw new Error('_id is required');
    const data = await products.update(_id, body);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('API Error [products PUT]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
