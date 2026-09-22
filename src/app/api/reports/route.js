import { NextResponse } from 'next/server';
import '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let totalSales = 0;
    let totalTax = 0;
    let totalPurchases = 0;
    let breakdown = [];

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
  } catch (error) {
    console.error('Reports API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate report' }, { status: 500 });
  }
}
