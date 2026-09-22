import { NextResponse } from 'next/server';
import '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getRawTotalsCloud() {
  const { default: Product } = await import('@/lib/models/Product');
  const { default: POSCustomer } = await import('@/lib/models/POSCustomer');
  const { default: Supplier } = await import('@/lib/models/Supplier');
  const { default: POSInvoice } = await import('@/lib/models/POSInvoice');
  const { default: Purchase } = await import('@/lib/models/Purchase');
  const { default: Expense } = await import('@/lib/models/Expense');

  // Sales/tax are aggregated from 'Completed' invoices only — the same
  // definition the P&L report uses — with a 'Returned' invoice's actual
  // refundTotal aggregated separately so it can be subtracted from Cash In
  // below. Previously this summed grandTotal/taxTotal over 'Completed' AND
  // 'Returned' invoices with no refund offset anywhere, overstating Sales
  // Revenue, Tax Payable, and Cash & Bank as if a refunded sale's cash were
  // still in the till.
  const [invAgg, arAgg, apAgg, salesAgg, returnsAgg, purchAgg, expAgg] = await Promise.all([
    Product.aggregate([{ $match: { stock: { $gt: 0 } } }, { $group: { _id: null, val: { $sum: { $multiply: ['$stock', '$purchasePrice'] } } } }]),
    POSCustomer.aggregate([{ $group: { _id: null, val: { $sum: '$outstandingBalance' } } }]),
    Supplier.aggregate([{ $group: { _id: null, val: { $sum: '$payableBalance' } } }]),
    POSInvoice.aggregate([{ $match: { status: 'Completed' } }, { $group: { _id: null, sales: { $sum: { $subtract: ['$grandTotal', '$taxTotal'] } }, tax: { $sum: '$taxTotal' } } }]),
    POSInvoice.aggregate([{ $match: { status: 'Returned' } }, { $group: { _id: null, val: { $sum: '$refundTotal' } } }]),
    Purchase.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, val: { $sum: '$totalAmount' } } }]),
    Expense.aggregate([{ $group: { _id: null, val: { $sum: '$amount' } } }]),
  ]);

  return {
    inventory: invAgg[0]?.val || 0,
    accountsReceivable: arAgg[0]?.val || 0,
    accountsPayable: apAgg[0]?.val || 0,
    totalSales: salesAgg[0]?.sales || 0,
    taxPayable: salesAgg[0]?.tax || 0,
    totalRefunded: returnsAgg[0]?.val || 0,
    totalPurchases: purchAgg[0]?.val || 0,
    totalExpenses: expAgg[0]?.val || 0,
  };
}

export async function GET() {
  try {
    await dbConnect();
    const totals = await getRawTotalsCloud();

    // The raw totals (sales, purchases, expenses) alone don't paint a
    // complete accounting picture. We compute the derived metrics here
    // (Gross Profit, Net Profit, Cash In Hand) so the client dashboard just
    // renders them.
    const grossProfit = totals.totalSales - (totals.inventory || 0); // Simplified COGS
    const netProfit = totals.totalSales - totals.totalPurchases - totals.totalExpenses;
    
    // (sales + tax) is the gross money taken in; refundTotal is the gross money handed back out
    const cashInHand = (totals.totalSales + totals.taxPayable) 
                     - totals.totalRefunded
                     - totals.totalPurchases 
                     - totals.totalExpenses 
                     - totals.accountsReceivable 
                     + totals.accountsPayable;

    return NextResponse.json({
      success: true,
      data: {
        ...totals,
        grossProfit,
        netProfit,
        cashAndBank: cashInHand
      }
    });
  } catch (error) {
    console.error('Accounting API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate accounting reports' }, { status: 500 });
  }
}
