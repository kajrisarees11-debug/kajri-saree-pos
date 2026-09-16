import { NextResponse } from 'next/server';
import { products } from '@/lib/dataAdapter';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const product = await products.getById(id);

    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('API Error [products/:id GET]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await products.getById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const product = await products.update(id, body);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('API Error [products/:id PUT]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await products.getById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    const product = await products.update(id, body);
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('API Error [products/:id PATCH]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;

    const existing = await products.getById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }

    await products.delete(id);
    return NextResponse.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    console.error('API Error [products/:id DELETE]:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
