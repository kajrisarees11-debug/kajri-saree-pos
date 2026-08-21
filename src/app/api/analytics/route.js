import { NextResponse } from 'next/server';
import dbConnect from '@/lib/db';
import POSInvoice from '@/lib/models/POSInvoice';
import Product from '@/lib/models/Product';
import POSCustomer from '@/lib/models/POSCustomer';

export async function GET() {
  try {
    await dbConnect();

    // 1. Today's Sales
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todayInvoices = await POSInvoice.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    }).populate('customerId');

    const todaySales = todayInvoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
    const invoicesGenerated = todayInvoices.length;

    // 2. Low Stock Items (Stock <= 10)
    const lowStockCount = await Product.countDocuments({ stock: { $lte: 10 } });

    // 3. Pending Udhaar
    const customersWithUdhaar = await POSCustomer.find({ outstandingBalance: { $gt: 0 } });
    const pendingUdhaar = customersWithUdhaar.reduce((sum, c) => sum + c.outstandingBalance, 0);
    const udhaarCustomerCount = customersWithUdhaar.length;

    return NextResponse.json({
      success: true,
      data: {
        todaySales,
        invoicesGenerated,
        recentInvoices: todayInvoices.slice(0, 5),
        lowStockCount,
        pendingUdhaar,
        udhaarCustomerCount
      }
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
