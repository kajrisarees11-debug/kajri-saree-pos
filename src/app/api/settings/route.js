import { NextResponse } from 'next/server';
import db, { generateObjectId, queueSync } from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let config = db.prepare('SELECT * FROM settings LIMIT 1').get();
    if (!config) {
      // Default config
      const defaultId = generateObjectId();
      const timestamp = new Date().toISOString();
      const defaultSettings = {
        _id: defaultId,
        storeName: 'Kajri Sarees',
        phone: '',
        address: '',
        email: '',
        gstin: '24AAAAA0000A1Z5',
        invoicePrefix: 'INV-',
        defaultTaxRate: 5,
        terms: '1. Goods once sold will not be taken back or exchanged.\n2. Subject to Surat jurisdiction only.',
        pageSize: '80mm',
        printerName: '',
        autoPrint: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const columns = Object.keys(defaultSettings);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(defaultSettings);

      db.transaction(() => {
        db.prepare(`INSERT INTO settings (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
        queueSync('INSERT', 'settings', defaultId, defaultSettings);
      })();

      config = defaultSettings;
    }

    // Convert autoPrint integer back to boolean for the frontend
    config.autoPrint = config.autoPrint === 1;

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('Settings GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const timestamp = new Date().toISOString();
    
    // Ensure boolean autoPrint is converted to integer
    if (typeof body.autoPrint === 'boolean') {
      body.autoPrint = body.autoPrint ? 1 : 0;
    }
    
    let config = db.prepare('SELECT * FROM settings LIMIT 1').get();
    
    if (config) {
      // Update existing
      const { _id, createdAt, updatedAt, ...updateFields } = body;
      updateFields.updatedAt = timestamp;
      
      const setClause = Object.keys(updateFields).map(k => `${k} = ?`).join(', ');
      const values = Object.values(updateFields);
      
      db.transaction(() => {
        db.prepare(`UPDATE settings SET ${setClause} WHERE _id = ?`).run(...values, config._id);
        queueSync('UPDATE', 'settings', config._id, updateFields);
      })();
      
      config = db.prepare('SELECT * FROM settings WHERE _id = ?').get(config._id);
    } else {
      // Insert new
      const defaultId = generateObjectId();
      const newSettings = {
        _id: defaultId,
        storeName: body.storeName || '',
        phone: body.phone || '',
        address: body.address || '',
        email: body.email || '',
        gstin: body.gstin || '',
        invoicePrefix: body.invoicePrefix || 'INV-',
        defaultTaxRate: body.defaultTaxRate || 5,
        terms: body.terms || '',
        pageSize: body.pageSize || '80mm',
        printerName: body.printerName || '',
        autoPrint: body.autoPrint || 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      const columns = Object.keys(newSettings);
      const placeholders = columns.map(() => '?').join(', ');
      const values = Object.values(newSettings);

      db.transaction(() => {
        db.prepare(`INSERT INTO settings (${columns.join(', ')}) VALUES (${placeholders})`).run(...values);
        queueSync('INSERT', 'settings', defaultId, newSettings);
      })();
      
      config = newSettings;
    }
    
    config.autoPrint = config.autoPrint === 1;
    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    console.error('Settings POST Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
