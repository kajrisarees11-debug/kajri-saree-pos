import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import Product from '@/lib/models/Product';
import { parse } from 'csv-parse/sync';

export async function POST(request) {
  try {
    await dbConnect();
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
      trim: true
    });

    let successCount = 0;
    let errors = [];

    // Map Vyapar standard columns to our MongoDB Schema
    // Vyapar common headers: 'Item Name', 'Item Code', 'Sale Price', 'Purchase Price', 'Current Stock', 'Category'
    
    for (const row of records) {
      try {
        const name = row['Item Name'] || row['Name'] || row['Item'];
        if (!name) continue;

        const sku = row['Item Code'] || row['SKU'] || '';
        const price = parseFloat(row['Sale Price']) || 0;
        const purchasePrice = parseFloat(row['Purchase Price']) || 0;
        const stock = parseInt(row['Current Stock']) || 0;
        const category = row['Category'] || 'General';
        
        // Ensure barcode exists. Vyapar might not have it, so fallback to SKU, or generate a random one
        let barcode = row['Barcode'] || sku;
        if (!barcode) {
          barcode = Math.floor(1000000000000 + Math.random() * 9000000000000).toString();
        }

        // Upsert logic: Update if SKU/Barcode exists, otherwise insert
        await Product.findOneAndUpdate(
          { $or: [{ sku: sku && sku !== '' ? sku : 'DUMMY_NEVER_MATCH' }, { barcode }] },
          {
            $set: {
              name,
              price,
              purchasePrice,
              category,
              sku: sku || barcode
            },
            $inc: { stock: stock } // We add the imported stock to current
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        successCount++;
      } catch (err) {
        errors.push(`Failed to process row: ${err.message}`);
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `Successfully imported/updated ${successCount} products.`,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
