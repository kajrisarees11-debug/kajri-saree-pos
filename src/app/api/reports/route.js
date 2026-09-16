import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const salesStats = db.prepare(`
      SELECT 
        SUM(grandTotal) as totalSales,
        SUM(taxTotal) as totalTax,
        COUNT(*) as count
      FROM invoices 
      WHERE status != 'Cancelled'
    `).get();

    const purchaseStats = db.prepare(`
      SELECT SUM(totalAmount) as totalPurchases
      FROM purchases 
      WHERE status != 'Cancelled'
    `).get();

    const totalSales = salesStats.totalSales || 0;
    const totalTax = salesStats.totalTax || 0;
    const totalPurchases = purchaseStats.totalPurchases || 0;
    const profit = totalSales - totalPurchases;

    // Daily breakdown for the last 30 days
    const breakdown = db.prepare(`
      SELECT 
        date(createdAt) as dateStr,
        SUM(grandTotal) as totalAmount,
        SUM(taxTotal) as tax,
        COUNT(*) as invoices
      FROM invoices 
      WHERE status != 'Cancelled'
      GROUP BY date(createdAt)
      ORDER BY date(createdAt) DESC
      LIMIT 30
    `).all();

    return NextResponse.json({ 
      success: true, 
      data: {
        stats: {
          sales: totalSales,
          purchases: totalPurchases,
          profit: profit,
          taxes: totalTax
        },
        breakdown: breakdown.map(b => ({
          date: b.dateStr,
          invoicesGenerated: b.invoices,
          totalAmount: b.totalAmount,
          tax: b.tax
        }))
      } 
    });
  } catch (error) {
    console.error('Reports API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate report' }, { status: 500 });
  }
}
