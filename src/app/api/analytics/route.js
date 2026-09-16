import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics
 * Dashboard KPI data — reads entirely from local SQLite.
 */
export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Today's Sales
    const todayInvoices = db.prepare(`
      SELECT * FROM invoices
      WHERE createdAt >= ? AND createdAt <= ? AND status != 'Cancelled'
    `).all(startOfDay.toISOString(), endOfDay.toISOString());

    const todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);

    // 2. Low Stock Items (stock <= 5)
    const lowStockCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE stock > 0 AND stock <= 5 AND status != 'Inactive'`).get().c;
    const outOfStockCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE stock = 0 AND status != 'Inactive'`).get().c;

    // 3. Pending Udhaar
    const udhaarResult = db.prepare(`
      SELECT COUNT(*) as count, SUM(outstandingBalance) as total FROM customers WHERE outstandingBalance > 0
    `).get();

    // 4. Recent invoices (last 5) with customer name joined
    const recentInvoices = db.prepare(`
      SELECT i.*, c.name as customerName
      FROM invoices i
      LEFT JOIN customers c ON i.customerId = c._id
      ORDER BY i.createdAt DESC
      LIMIT 5
    `).all().map(inv => ({
      ...inv,
      items: inv.items ? JSON.parse(inv.items) : [],
      customerId: inv.customerId ? { _id: inv.customerId, name: inv.customerName } : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        todaySales,
        invoicesGenerated: todayInvoices.length,
        recentInvoices,
        lowStockCount: lowStockCount + outOfStockCount,
        outOfStockCount,
        pendingUdhaar: udhaarResult.total || 0,
        udhaarCustomerCount: udhaarResult.count || 0,
      }
    });
  } catch (error) {
    console.error('[Analytics API Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
