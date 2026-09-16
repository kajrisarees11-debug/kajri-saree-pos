import { NextResponse } from 'next/server';
import { IS_CLOUD, generateObjectId } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';
import { parse } from 'csv-parse/sync';

const MAX_IMPORT_ROWS = 20000;

function readRow(row) {
  const name = row['Item Name'] || row['Name'] || row['Item'];
  const sku = row['Item Code'] || row['SKU'] || '';
  let price = parseFloat(row['Sale Price'] || row['Price'] || '0') || 0;
  let purchasePrice = parseFloat(row['Purchase Price'] || row['Cost Price'] || '0') || 0;
  let stock = parseInt(row['Current Stock'] || row['Stock'] || '0') || 0;
  const category = row['Category'] || 'General';
  const barcode = row['Barcode'] || null;

  // Reject nonsensical negative values instead of silently importing them.
  if (price < 0) price = 0;
  if (purchasePrice < 0) purchasePrice = 0;
  if (stock < 0) stock = 0;

  return { name, sku, price, purchasePrice, stock, category, barcode };
}

/**
 * POST /api/import
 * Bulk import products from a Vyapar-compatible CSV, against whichever
 * backend (MongoDB on Vercel, SQLite on desktop) is actually active.
 */
export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }

    const text = await file.text();

    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    if (records.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({
        success: false,
        error: `CSV has ${records.length} rows, which exceeds the ${MAX_IMPORT_ROWS}-row import limit. Split the file and import in batches.`,
      }, { status: 400 });
    }

    let successCount = 0;
    const errors = [];
    const timestamp = new Date().toISOString();

    if (IS_CLOUD) {
      await dbConnect();
      const { default: Product } = await import('@/lib/models/Product');

      for (const row of records) {
        try {
          const { name, sku, price, purchasePrice, stock, category, barcode } = readRow(row);
          if (!name) continue;

          let existing = sku ? await Product.findOne({ sku }) : null;
          if (!existing && barcode) existing = await Product.findOne({ barcode });

          if (existing) {
            existing.name = name;
            existing.price = price;
            existing.purchasePrice = purchasePrice;
            existing.stock = (existing.stock || 0) + stock;
            existing.categoryId = category;
            existing.updatedAt = timestamp;
            await existing.save();
          } else {
            await Product.create({
              _id: generateObjectId(),
              name, sku: sku || null,
              barcode: barcode || generateObjectId().slice(0, 13),
              price, purchasePrice, stock,
              categoryId: category, status: 'Active',
              createdAt: timestamp, updatedAt: timestamp,
            });
          }

          successCount++;
        } catch (err) {
          errors.push(`Row failed: ${err.message}`);
        }
      }
    } else {
      const db = require('@/lib/sqlite').default;
      const { queueSync } = require('@/lib/sqlite');

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
            const parsed = readRow(row);
            const { name, sku, price, purchasePrice, stock, category } = parsed;
            if (!name) continue;
            // Only fall back to a random barcode for a genuinely new product —
            // never reuse the SKU as a barcode, since that can collide with an
            // unrelated product's real barcode and silently overwrite it.
            const barcode = parsed.barcode || Math.floor(1000000000000 + Math.random() * 9000000000000).toString();

            let existing = sku ? findBySku.get(sku) : null;
            if (!existing && parsed.barcode) existing = findByBarcode.get(parsed.barcode);

            if (existing) {
              updateStmt.run(name, price, purchasePrice, stock, category, timestamp, existing._id);
              queueSync('UPDATE', 'products', existing._id, { name, price, purchasePrice, $inc: { stock }, categoryId: category, updatedAt: timestamp });
            } else {
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
    }

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
