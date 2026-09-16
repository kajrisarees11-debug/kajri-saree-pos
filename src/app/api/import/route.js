import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';
import { parse } from 'csv-parse/sync';

/**
 * POST /api/import
 * Bulk import products from a Vyapar-compatible CSV.
 * Now uses local SQLite instead of MongoDB.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    // Parse CSV
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    let successCount = 0;
    const errors = [];
    const timestamp = new Date().toISOString();

    // Prepare statements
    const findBySku = db.prepare('SELECT * FROM products WHERE sku = ?');
    const findByBarcode = db.prepare('SELECT * FROM products WHERE barcode = ?');
    const updateStmt = db.prepare(`
      UPDATE products SET name=?, price=?, purchasePrice=?, stock=stock+?, categoryId=?, updatedAt=? WHERE _id=?
    `);
    const insertStmt = db.prepare(`
      INSERT INTO products (_id, name, sku, barcode, price, purchasePrice, stock, categoryId, status, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?, ?)
    `);

    db.transaction(() => {
      for (const row of records) {
        try {
          const name = row['Item Name'] || row['Name'] || row['Item'];
          if (!name) continue;

          const sku = row['Item Code'] || row['SKU'] || '';
          const price = parseFloat(row['Sale Price'] || row['Price'] || '0') || 0;
          const purchasePrice = parseFloat(row['Purchase Price'] || row['Cost Price'] || '0') || 0;
          const stock = parseInt(row['Current Stock'] || row['Stock'] || '0') || 0;
          const category = row['Category'] || 'General';
          let barcode = row['Barcode'] || sku || Math.floor(1000000000000 + Math.random() * 9000000000000).toString();

          // Try to find existing product by SKU or barcode
          let existing = sku ? findBySku.get(sku) : null;
          if (!existing && barcode) existing = findByBarcode.get(barcode);

          if (existing) {
            // Update existing
            updateStmt.run(name, price, purchasePrice, stock, category, timestamp, existing._id);
            queueSync('UPDATE', 'products', existing._id, { name, price, purchasePrice, $inc: { stock }, categoryId: category, updatedAt: timestamp });
          } else {
            // Insert new
            const newId = generateObjectId();
            insertStmt.run(newId, name, sku || null, barcode, price, purchasePrice, stock, category, timestamp, timestamp);
            queueSync('INSERT', 'products', newId, { _id: newId, name, sku, barcode, price, purchasePrice, stock, categoryId: category, status: 'Active', createdAt: timestamp, updatedAt: timestamp });
          }

          successCount++;
        } catch (err) {
          errors.push(`Row failed: ${err.message}`);
        }
      }
    })();

    return NextResponse.json({
      success: true,
      message: `Successfully imported/updated ${successCount} products.`,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[Import API Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
