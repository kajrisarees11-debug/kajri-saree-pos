import { NextResponse } from 'next/server';
import db from '@/lib/sqlite';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // 1. Inventory Value (Stock * Purchase Price)
    const invQuery = db.prepare('SELECT SUM(stock * purchasePrice) as val FROM products WHERE stock > 0').get();
    const inventory = invQuery.val || 0;

    // 2. Accounts Receivable (Sundry Debtors)
    const arQuery = db.prepare('SELECT SUM(outstandingBalance) as val FROM customers').get();
    const accountsReceivable = arQuery.val || 0;

    // 3. Accounts Payable (Sundry Creditors)
    const apQuery = db.prepare('SELECT SUM(payableBalance) as val FROM suppliers').get();
    const accountsPayable = apQuery.val || 0;

    // 4. Sales & Tax
    const salesQuery = db.prepare('SELECT SUM(grandTotal - taxTotal) as sales, SUM(taxTotal) as tax FROM invoices WHERE status != \'Cancelled\'').get();
    const totalSales = salesQuery.sales || 0;
    const taxPayable = salesQuery.tax || 0;
    const grossSales = totalSales + taxPayable;

    // 5. Purchases
    const purchQuery = db.prepare('SELECT SUM(totalAmount) as val FROM purchases WHERE status != \'Cancelled\'').get();
    const totalPurchases = purchQuery.val || 0;

    // 6. Expenses
    const expQuery = db.prepare('SELECT SUM(amount) as val FROM expenses').get();
    const totalExpenses = expQuery.val || 0;

    // 7. Derived Cash & Bank
    // Cash In = Gross Sales - Uncollected Accounts Receivable
    const cashIn = grossSales - accountsReceivable;
    // Cash Out = (Purchases - Unpaid Accounts Payable) + Expenses
    const cashOut = (totalPurchases - accountsPayable) + totalExpenses;
    const cashAndBank = cashIn - cashOut;

    // 8. Derived Capital / Retained Earnings to balance the equation
    // Debits = Inventory + AR + Cash + Purchases + Expenses
    // Credits = AP + Sales + Tax + Capital
    // Mathematically: Capital = Inventory - Tax (if starting from 0)
    const capital = inventory - taxPayable;

    // Calculate Net Profit for Balance Sheet
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
