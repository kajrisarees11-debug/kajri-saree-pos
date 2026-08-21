import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import Purchase from '@/lib/models/Purchase';

export async function GET(request) {
  try {
    await dbConnect();
    
    // Very simple aggregation for the sake of the report
    // A robust system would filter by date, but this gets the grand totals
    const salesAgg = await POSInvoice.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { 
          _id: null, 
          totalSales: { $sum: '$grandTotal' },
          totalTax: { $sum: '$taxTotal' },
          count: { $sum: 1 }
        } 
      }
    ]);

    const purchaseAgg = await Purchase.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      { $group: { 
          _id: null, 
          totalPurchases: { $sum: '$totalAmount' }
        } 
      }
    ]);

    const totalSales = salesAgg.length > 0 ? salesAgg[0].totalSales : 0;
    const totalTax = salesAgg.length > 0 ? salesAgg[0].totalTax : 0;
    const totalPurchases = purchaseAgg.length > 0 ? purchaseAgg[0].totalPurchases : 0;
    const count = salesAgg.length > 0 ? salesAgg[0].count : 0;

    // Gross profit = Sales - Purchases (simplified)
    const profit = totalSales - totalPurchases;

    // Daily breakdown for the table (just groups by date string)
    const breakdown = await POSInvoice.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          totalAmount: { $sum: '$grandTotal' },
          tax: { $sum: '$taxTotal' },
          invoices: { $sum: 1 }
        }
      },
      { $sort: { _id: -1 } },
      { $limit: 30 }
    ]);

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
          date: b._id,
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
