import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const barcode = searchParams.get('barcode');

    let query = 'SELECT * FROM products';
    const params = [];

    if (barcode) {
      query += ' WHERE barcode = ?';
      params.push(barcode);
    } else if (search) {
      query += ' WHERE name LIKE ? OR sku LIKE ? OR barcode LIKE ?';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY createdAt DESC LIMIT 50';

    const stmt = db.prepare(query);
    const products = stmt.all(...params).map(p => ({
      ...p,
      images: p.images ? JSON.parse(p.images) : []
    }));
    
    return NextResponse.json({ success: true, data: products });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    
    const _id = body._id || generateObjectId();
    const timestamp = new Date().toISOString();
    
    const productData = {
      _id,
      name: body.name || '',
      sku: body.sku || null,
      barcode: body.barcode || null,
      description: body.description || null,
      price: body.price || 0,
      purchasePrice: body.purchasePrice || 0,
      stock: body.stock || 0,
      minStock: body.minStock || 5,
      categoryId: body.category || body.categoryId || null,
      subCategory: body.subCategory || null,
      supplierId: body.supplierId || null,
      images: JSON.stringify(body.images || []),
      fabric: body.fabric || null,
      colour: body.colour || null,
      sareeType: body.sareeType || null,
      brand: body.brand || null,
      design: body.design || null,
      status: body.status || 'Active',
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const columns = Object.keys(productData);
    const placeholders = columns.map(() => '?').join(', ');
    const values = Object.values(productData);

    const stmt = db.prepare(`INSERT INTO products (${columns.join(', ')}) VALUES (${placeholders})`);
    
    db.transaction(() => {
      stmt.run(...values);
      queueSync('INSERT', 'products', _id, productData);
    })();
    
    // Return parsed JSON format for the client
    const returnData = { ...productData, images: body.images || [] };
    
    return NextResponse.json({ success: true, data: returnData }, { status: 201 });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const timestamp = new Date().toISOString();
    
    // Handle bulk update
    if (Array.isArray(body)) {
      const updateStmt = db.prepare(`UPDATE products SET barcode = ?, updatedAt = ? WHERE _id = ?`);
      
      db.transaction(() => {
        for (const p of body) {
          updateStmt.run(p.barcode, timestamp, p._id);
          queueSync('UPDATE', 'products', p._id, { barcode: p.barcode, updatedAt: timestamp });
        }
      })();
      return NextResponse.json({ success: true, message: 'Bulk update successful' });
    }

    // Handle single update
    const { _id, ...updateData } = body;
    if (!_id) throw new Error('_id is required');

    updateData.updatedAt = timestamp;
    if (updateData.images) {
      updateData.images = JSON.stringify(updateData.images);
    }
    if (updateData.category) {
      updateData.categoryId = updateData.category;
      delete updateData.category;
    }

    const setClauses = Object.keys(updateData).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updateData);
    
    const stmt = db.prepare(`UPDATE products SET ${setClauses} WHERE _id = ?`);
    
    db.transaction(() => {
      stmt.run(...values, _id);
      queueSync('UPDATE', 'products', _id, updateData);
    })();

    const updatedProduct = db.prepare('SELECT * FROM products WHERE _id = ?').get(_id);
    if (updatedProduct) {
      updatedProduct.images = updatedProduct.images ? JSON.parse(updatedProduct.images) : [];
    }

    return NextResponse.json({ success: true, data: updatedProduct });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 400 });
  }
}
