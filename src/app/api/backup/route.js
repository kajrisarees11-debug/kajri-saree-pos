import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

/**
 * GET /api/backup
 * Export full local SQLite database as a downloadable JSON file.
 * Reads from SQLite — works 100% offline.
 */
export async function GET() {
  try {
    const products  = db.prepare('SELECT * FROM products').all().map(p => ({ ...p, images: p.images ? JSON.parse(p.images) : [] }));
    const customers = db.prepare('SELECT * FROM customers').all();
    const suppliers = db.prepare('SELECT * FROM suppliers').all();
    const invoices  = db.prepare('SELECT * FROM invoices').all().map(inv => ({ ...inv, items: inv.items ? JSON.parse(inv.items) : [] }));
    const purchases = db.prepare('SELECT * FROM purchases').all().map(p => ({ ...p, items: p.items ? JSON.parse(p.items) : [] }));
    const expenses  = db.prepare('SELECT * FROM expenses').all();
    const ledgers   = db.prepare('SELECT * FROM ledgers').all();
    const settings  = db.prepare('SELECT * FROM settings').all();

    const dump = {
      timestamp: new Date().toISOString(),
      version: '2.0',
      source: 'kajri-pos-sqlite',
      data: {
        products,
        customers,
        suppliers,
        invoices,
        purchases,
        expenses,
        ledgers,
        settings,
      },
    };

    return new NextResponse(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="kajri_pos_backup_${new Date().getTime()}.json"`,
      },
    });
  } catch (error) {
    console.error('[Backup Error]', error);
    return NextResponse.json({ success: false, error: 'Failed to generate backup' }, { status: 500 });
  }
}
