import { NextResponse } from 'next/server';
import { IS_CLOUD } from '@/lib/dataAdapter';
import dbConnect from '@/lib/db';

export const dynamic = 'force-dynamic';

async function getRawTotalsCloud() {
  const { default: Product } = await import('@/lib/models/Product');
  const { default: POSCustomer } = await import('@/lib/models/POSCustomer');
  const { default: Supplier } = await import('@/lib/models/Supplier');
  const { default: POSInvoice } = await import('@/lib/models/POSInvoice');
  const { default: Purchase } = await import('@/lib/models/Purchase');
  const { default: Expense } = await import('@/lib/models/Expense');

  const [invAgg, arAgg, apAgg, salesAgg, purchAgg, expAgg] = await Promise.all([
    Product.aggregate([{ $match: { stock: { $gt: 0 } } }, { $group: { _id: null, val: { $sum: { $multiply: ['$stock', '$purchasePrice'] } } } }]),
    POSCustomer.aggregate([{ $group: { _id: null, val: { $sum: '$outstandingBalance' } } }]),
    Supplier.aggregate([{ $group: { _id: null, val: { $sum: '$payableBalance' } } }]),
    POSInvoice.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, sales: { $sum: { $subtract: ['$grandTotal', '$taxTotal'] } }, tax: { $sum: '$taxTotal' } } }]),
    Purchase.aggregate([{ $match: { status: { $ne: 'Cancelled' } } }, { $group: { _id: null, val: { $sum: '$totalAmount' } } }]),
    Expense.aggregate([{ $group: { _id: null, val: { $sum: '$amount' } } }]),
  ]);

  return {
    inventory: invAgg[0]?.val || 0,
    accountsReceivable: arAgg[0]?.val || 0,
    accountsPayable: apAgg[0]?.val || 0,
    totalSales: salesAgg[0]?.sales || 0,
    taxPayable: salesAgg[0]?.tax || 0,
    totalPurchases: purchAgg[0]?.val || 0,
    totalExpenses: expAgg[0]?.val || 0,
  };
}

function getRawTotalsSqlite() {
  const db = require('@/lib/sqlite').default;

  const invQuery = db.prepare('SELECT SUM(stock * purchasePrice) as val FROM products WHERE stock > 0').get();
  const arQuery = db.prepare('SELECT SUM(outstandingBalance) as val FROM customers').get();
  const apQuery = db.prepare('SELECT SUM(payableBalance) as val FROM suppliers').get();
  const salesQuery = db.prepare('SELECT SUM(grandTotal - taxTotal) as sales, SUM(taxTotal) as tax FROM invoices WHERE status != \'Cancelled\'').get();
  const purchQuery = db.prepare('SELECT SUM(totalAmount) as val FROM purchases WHERE status != \'Cancelled\'').get();
  const expQuery = db.prepare('SELECT SUM(amount) as val FROM expenses').get();

  return {
    inventory: invQuery.val || 0,
    accountsReceivable: arQuery.val || 0,
    accountsPayable: apQuery.val || 0,
    totalSales: salesQuery.sales || 0,
    taxPayable: salesQuery.tax || 0,
    totalPurchases: purchQuery.val || 0,
    totalExpenses: expQuery.val || 0,
  };
}

export async function GET() {
  try {
    let totals;
    if (IS_CLOUD) {
      await dbConnect();
      totals = await getRawTotalsCloud();
    } else {
      totals = getRawTotalsSqlite();
    }

    const { inventory, accountsReceivable, accountsPayable, totalSales, taxPayable, totalPurchases, totalExpenses } = totals;
    const grossSales = totalSales + taxPayable;

    // Cash In = Gross Sales - Uncollected Accounts Receivable
    const cashIn = grossSales - accountsReceivable;
    // Cash Out = (Purchases - Unpaid Accounts Payable) + Expenses
    const cashOut = (totalPurchases - accountsPayable) + totalExpenses;
    const cashAndBank = cashIn - cashOut;

    // Derived Capital / Retained Earnings to balance the equation
    // Debits = Inventory + AR + Cash + Purchases + Expenses
    // Credits = AP + Sales + Tax + Capital
    // Mathematically: Capital = Inventory - Tax (if starting from 0)
    const capital = inventory - taxPayable;

    // Profit = Sales - Purchases - Expenses
    const netProfit = totalSales - totalPurchases - totalExpenses;

    const data = {
      trialBalance: {
        debits: [
          { account: 'Closing Stock (Inventory)', amount: inventory },
          { account: 'Accounts Receivable (Debtors)', amount: accountsReceivable },
          { account: 'Cash & Bank Balances', amount: Math.max(0, cashAndBank) },
          { account: 'Purchases (COGS)', amount: totalPurchases },
          { account: 'Operating Expenses', amount: totalExpenses }
        ],
        credits: [
          { account: 'Accounts Payable (Creditors)', amount: accountsPayable },
          { account: 'Sales Revenue', amount: totalSales },
          { account: 'Tax Payable (GST)', amount: taxPayable },
          { account: 'Capital & Retained Earnings', amount: Math.max(0, capital) },
          { account: 'Overdraft / Negative Cash', amount: cashAndBank < 0 ? Math.abs(cashAndBank) : 0 },
          { account: 'Capital Deficit', amount: capital < 0 ? Math.abs(capital) : 0 }
        ]
      },
      balanceSheet: {
        assets: [
          { account: 'Cash & Bank', amount: Math.max(0, cashAndBank) },
          { account: 'Accounts Receivable', amount: accountsReceivable },
          { account: 'Closing Stock', amount: inventory }
        ],
        liabilities: [
          { account: 'Accounts Payable', amount: accountsPayable },
          { account: 'Tax Payable', amount: taxPayable },
          { account: 'Overdraft (Negative Cash)', amount: cashAndBank < 0 ? Math.abs(cashAndBank) : 0 }
        ],
        equity: [
          { account: 'Opening Capital (Derived)', amount: capital - netProfit },
          { account: 'Net Profit / (Loss)', amount: netProfit }
        ]
      }
    };

    // Filter out 0 amounts for cleaner UI, except for key accounts
    data.trialBalance.debits = data.trialBalance.debits.filter(d => d.amount !== 0);
    data.trialBalance.credits = data.trialBalance.credits.filter(c => c.amount !== 0);

    // Calculate Totals
    data.trialBalance.totalDebit = data.trialBalance.debits.reduce((sum, item) => sum + item.amount, 0);
    data.trialBalance.totalCredit = data.trialBalance.credits.reduce((sum, item) => sum + item.amount, 0);

    data.balanceSheet.totalAssets = data.balanceSheet.assets.reduce((sum, item) => sum + item.amount, 0);
    data.balanceSheet.totalLiabilitiesAndEquity =
      data.balanceSheet.liabilities.reduce((sum, item) => sum + item.amount, 0) +
      data.balanceSheet.equity.reduce((sum, item) => sum + item.amount, 0);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Accounting API Error:', error);
    return NextResponse.json({ success: false, error: 'Failed to generate accounting reports' }, { status: 500 });
  }
}
