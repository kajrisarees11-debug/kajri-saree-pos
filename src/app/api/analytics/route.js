import { NextResponse } from 'next/server';
import { IS_CLOUD } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const now = new Date();
    const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);

    if (IS_CLOUD) {
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

      // Enrich recent invoices with customer names
      const enrichedInvoices = await Promise.all(recentInvoices.map(async inv => {
        let customerData = null;
        if (inv.customerId) {
          const cust = await POSCustomer.findById(inv.customerId).lean();
          if (cust) customerData = { _id: cust._id.toString(), name: cust.name };
        }
        return { ...inv, _id: inv._id.toString(), items: inv.items || [], customerId: customerData };
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
    } else {
      const db = require('@/lib/sqlite').default;

      const todayInvoices = db.prepare(`
        SELECT * FROM invoices
        WHERE createdAt >= ? AND createdAt <= ? AND status != 'Cancelled'
      `).all(startOfDay.toISOString(), endOfDay.toISOString());

      const todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
      const lowStockCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE stock > 0 AND stock <= 5 AND status != 'Inactive'`).get().c;
      const outOfStockCount = db.prepare(`SELECT COUNT(*) as c FROM products WHERE stock = 0 AND status != 'Inactive'`).get().c;
      const udhaarResult = db.prepare(`SELECT COUNT(*) as count, SUM(outstandingBalance) as total FROM customers WHERE outstandingBalance > 0`).get();

      const recentInvoices = db.prepare(`
        SELECT i.*, c.name as customerName FROM invoices i
        LEFT JOIN customers c ON i.customerId = c._id
        ORDER BY i.createdAt DESC LIMIT 5
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
    }
  } catch (error) {
    console.error('[Analytics API Error]', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
