import { NextResponse } from 'next/server';
import { IS_CLOUD } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let totalSales = 0;
    let totalTax = 0;
    let totalPurchases = 0;
    let breakdown = [];

    if (IS_CLOUD) {
      await dbConnect();
      const { default: POSInvoice } = await import('@/lib/models/POSInvoice');
      const { default: Purchase } = await import('@/lib/models/Purchase');

      const [salesAgg, purchaseAgg, breakdownAgg] = await Promise.all([
        POSInvoice.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          { $group: { _id: null, totalSales: { $sum: '$grandTotal' }, totalTax: { $sum: '$taxTotal' } } },
        ]),
        Purchase.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } },
        ]),
        POSInvoice.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$createdAt' } } },
              totalAmount: { $sum: '$grandTotal' },
              tax: { $sum: '$taxTotal' },
              invoices: { $sum: 1 },
            },
          },
          { $sort: { _id: -1 } },
          { $limit: 30 },
        ]),
      ]);

      totalSales = salesAgg[0]?.totalSales || 0;
      totalTax = salesAgg[0]?.totalTax || 0;
      totalPurchases = purchaseAgg[0]?.totalPurchases || 0;
      breakdown = breakdownAgg.map((b) => ({
        date: b._id,
        invoicesGenerated: b.invoices,
        totalAmount: b.totalAmount,
        tax: b.tax,
      }));
    } else {
      const db = require('@/lib/sqlite').default;

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

      totalSales = salesStats.totalSales || 0;
      totalTax = salesStats.totalTax || 0;
      totalPurchases = purchaseStats.totalPurchases || 0;

      const rows = db.prepare(`
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

      breakdown = rows.map(b => ({
        date: b.dateStr,
        invoicesGenerated: b.invoices,
        totalAmount: b.totalAmount,
        tax: b.tax
      }));
    }

    const profit = totalSales - totalPurchases;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          sales: totalSales,
          purchases: totalPurchases,
          profit: profit,
          taxes: totalTax
        },
        breakdown
      }
    });
  } catch (error) {
    console.error('Reports API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate report' }, { status: 500 });
  }
}
