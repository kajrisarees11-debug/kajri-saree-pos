import { NextResponse } from 'next/server';
import db, { queueSync } from '@/lib/sqlite';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    
    const stmt = db.prepare('SELECT * FROM products WHERE _id = ?');
    const product = stmt.get(id);
    
    if (!product) {
      return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    }
    
    if (product.images) {
      product.images = JSON.parse(product.images);
    }
    
    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const timestamp = new Date().toISOString();
    
    const updateData = { ...body, updatedAt: timestamp };
    
    if (updateData.images) updateData.images = JSON.stringify(updateData.images);
    if (updateData.category) { updateData.categoryId = updateData.category; delete updateData.category; }
    
    const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);
    
    const stmt = db.prepare(`UPDATE products SET ${setClauses} WHERE _id = ?`);
    
    db.transaction(() => {
      const result = stmt.run(...values, id);
      if (result.changes === 0) throw new Error('NOT_FOUND');
      queueSync('UPDATE', 'products', id, updateData);
    })();

    const product = db.prepare('SELECT * FROM products WHERE _id = ?').get(id);
    if (product?.images) product.images = JSON.parse(product.images);

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const timestamp = new Date().toISOString();
    
    const updateData = { ...body, updatedAt: timestamp };
    const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);
    
    const stmt = db.prepare(`UPDATE products SET ${setClauses} WHERE _id = ?`);
    
    db.transaction(() => {
      const result = stmt.run(...values, id);
      if (result.changes === 0) throw new Error('NOT_FOUND');
      queueSync('UPDATE', 'products', id, updateData);
    })();

    const product = db.prepare('SELECT * FROM products WHERE _id = ?').get(id);
    if (product?.images) product.images = JSON.parse(product.images);

    return NextResponse.json({ success: true, data: product });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = await params;
    
    const stmt = db.prepare('DELETE FROM products WHERE _id = ?');
    
    db.transaction(() => {
      const result = stmt.run(id);
      if (result.changes === 0) throw new Error('NOT_FOUND');
      queueSync('DELETE', 'products', id);
    })();

    return NextResponse.json({ success: true, message: 'Product deleted' });
  } catch (error) {
    if (error.message === 'NOT_FOUND') return NextResponse.json({ success: false, error: 'Product not found' }, { status: 404 });
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
