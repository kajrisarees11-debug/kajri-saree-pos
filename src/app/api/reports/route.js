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

      // Matches the Profit & Loss report's revenue definition: only
      // 'Completed' invoices count toward sales/tax, and a 'Returned'
      // invoice's refundTotal (the amount actually paid back — a
      // partially-returned invoice is marked 'Returned' in full but its
      // grandTotal was never entirely refunded) is netted out separately.
      // Previously this summed grandTotal/taxTotal over BOTH 'Completed' AND
      // 'Returned' invoices with no refund offset at all, so a store with
      // any returns showed a different, inflated "Total Sales" here than on
      // the P&L page for the identical period.
      const [salesAgg, returnsAgg, purchaseAgg, breakdownAgg] = await Promise.all([
        POSInvoice.aggregate([
          { $match: { status: 'Completed' } },
          { $group: { _id: null, totalSales: { $sum: '$grandTotal' }, totalTax: { $sum: '$taxTotal' } } },
        ]),
        POSInvoice.aggregate([
          { $match: { status: 'Returned' } },
          { $group: { _id: null, totalRefunded: { $sum: '$refundTotal' } } },
        ]),
        Purchase.aggregate([
          { $match: { status: { $ne: 'Cancelled' } } },
          { $group: { _id: null, totalPurchases: { $sum: '$totalAmount' } } },
        ]),
        POSInvoice.aggregate([
          { $match: { status: 'Completed' } },
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

      totalSales = (salesAgg[0]?.totalSales || 0) - (returnsAgg[0]?.totalRefunded || 0);
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

      // See the matching comment in the IS_CLOUD branch above — only
      // 'Completed' invoices count toward sales/tax, netted against
      // 'Returned' invoices' actual refundTotal, to match the P&L report.
      const salesStats = db.prepare(`
        SELECT
          SUM(grandTotal) as totalSales,
          SUM(taxTotal) as totalTax,
          COUNT(*) as count
        FROM invoices
        WHERE status = 'Completed'
      `).get();

      const returnsStats = db.prepare(`
        SELECT SUM(refundTotal) as totalRefunded
        FROM invoices
        WHERE status = 'Returned'
      `).get();

      const purchaseStats = db.prepare(`
        SELECT SUM(totalAmount) as totalPurchases
        FROM purchases
        WHERE status != 'Cancelled'
      `).get();

      totalSales = (salesStats.totalSales || 0) - (returnsStats.totalRefunded || 0);
      totalTax = salesStats.totalTax || 0;
      totalPurchases = purchaseStats.totalPurchases || 0;

      const rows = db.prepare(`
        SELECT
          date(createdAt) as dateStr,
          SUM(grandTotal) as totalAmount,
          SUM(taxTotal) as tax,
          COUNT(*) as invoices
        FROM invoices
        WHERE status = 'Completed'
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
