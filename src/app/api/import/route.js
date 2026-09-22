import { NextResponse } from 'next/server';
import { generateObjectId } from '@/lib/dataAdapter';
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
  } catch (error) {
    console.error('[Import API Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
