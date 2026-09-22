import { NextResponse } from 'next/server';
import '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now);startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);endOfDay.setHours(23, 59, 59, 999);

    await dbConnect();
    const [POSInvoice, Product, POSCustomer] = await Promise.all([
      import('@/lib/models/POSInvoice').then(m => m.default),
      import('@/lib/models/Product').then(m => m.default),
      import('@/lib/models/POSCustomer').then(m => m.default),
    ]);

    const [todayInvoices, lowStockCount, outOfStockCount, udhaarResult, recentInvoices] = await Promise.all([
      POSInvoice.find({ createdAt: { $gte: startOfDay, $lte: endOfDay }, status: { $ne: 'Cancelled' } }).lean(),
      Product.countDocuments({ stock: { $gt: 0, $lte: 5 }, status: { $ne: 'Inactive' } }),
      Product.countDocuments({ stock: 0, status: { $ne: 'Inactive' } }),
      POSCustomer.aggregate([
        { $match: { outstandingBalance: { $gt: 0 } } },
        { $group: { _id: null, total: { $sum: '$outstandingBalance' }, count: { $sum: 1 } } }
      ]),
      POSInvoice.find({}).sort({ createdAt: -1 }).limit(5).lean(),
    ]);

    const todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const udhaar = udhaarResult[0] || { total: 0, count: 0 };

    // Enrich recent invoices with customer names via one batched lookup
    // instead of a separate findById round-trip per invoice.
    const customerIds = [...new Set(recentInvoices.filter(inv => inv.customerId).map(inv => inv.customerId.toString()))];
    const customerDocs = customerIds.length
      ? await POSCustomer.find({ _id: { $in: customerIds } }).lean()
      : [];
    const customerById = new Map(customerDocs.map(c => [c._id.toString(), { _id: c._id.toString(), name: c.name }]));
    const enrichedInvoices = recentInvoices.map(inv => ({
      ...inv,
      _id: inv._id.toString(),
      items: inv.items || [],
      customerId: inv.customerId ? (customerById.get(inv.customerId.toString()) || null) : null,
    }));

    return NextResponse.json({
      success: true,
      data: {
        todaySales,
        invoicesGenerated: todayInvoices.length,
        recentInvoices: enrichedInvoices,
        lowStockCount: lowStockCount + outOfStockCount,
        outOfStockCount,
        pendingUdhaar: udhaar.total || 0,
        udhaarCustomerCount: udhaar.count || 0,
      }
    });
  } catch (error) {
    console.error('[Analytics API Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
