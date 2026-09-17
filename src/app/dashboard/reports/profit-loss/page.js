'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { TrendingUp, TrendingDown, Download, Calendar } from 'lucide-react';

function fmt(n) { return `₹${(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const PERIODS = [
  { id: 'today',      label: 'Today' },
  { id: 'this_week',  label: 'This Week' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year',  label: 'This Year' },
  { id: 'custom',     label: 'Custom' },
];

function getRange(period, customStart, customEnd) {
  const now = new Date();
  const today = new Date(now); today.setHours(0,0,0,0);
  switch (period) {
    case 'today':      return [today, now];
    case 'this_week': {
      const s = new Date(today); s.setDate(today.getDate() - today.getDay());
      return [s, now];
    }
    case 'this_month': return [new Date(now.getFullYear(), now.getMonth(), 1), now];
    case 'last_month': {
      const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
      return [s, e];
    }
    case 'this_year':  return [new Date(now.getFullYear(), 0, 1), now];
    case 'custom':     return [new Date(customStart || today), new Date(customEnd || now)];
    default:           return [new Date(0), now];
  }
}

function Row({ label, value, bold, indent, color, border }) {
  return (
    <div className={`flex justify-between items-center py-2.5 px-4 ${border ? 'border-t border-gray-200 mt-1' : ''} ${bold ? 'bg-gray-50 rounded-lg' : ''}`}>
      <span className={`text-sm ${indent ? 'pl-4 text-gray-500' : bold ? 'font-bold text-gray-900' : 'text-gray-700'}`}>{label}</span>
      <span className={`text-sm font-semibold ${color || (bold ? 'text-gray-900' : 'text-gray-700')} ${bold ? 'text-base font-bold' : ''}`}>{fmt(value)}</span>
    </div>
  );
}

export default function ProfitLossPage() {
  const { invoices, purchases, expenses } = useData();
  const [period, setPeriod] = useState('this_month');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd]   = useState('');

  const report = useMemo(() => {
    const [from, to] = getRange(period, customStart, customEnd);

    const inRange = (d) => { const dt = new Date(d); return dt >= from && dt <= to; };

    // ── Revenue
    const saleInvoices = invoices.filter(inv => inv.status === 'Completed' && inRange(inv.createdAt || inv.date));
    const returnInvoices = invoices.filter(inv => inv.status === 'Returned' && inRange(inv.createdAt || inv.date));

    const grossRevenue   = saleInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    // Use the actual refunded amount, not the full original sale — an
    // invoice with even a single-item partial return is marked 'Returned'
    // in full, but only refundTotal was ever actually paid back.
    const salesReturns   = returnInvoices.reduce((s, inv) => s + (inv.refundTotal || 0), 0);
    const netRevenue     = grossRevenue - salesReturns;

    const taxCollected   = saleInvoices.reduce((s, inv) => s + (inv.taxTotal || 0), 0);
    const discountsGiven = saleInvoices.reduce((s, inv) => s + (inv.discountTotal || 0), 0);

    // ── Cost of Goods (from purchases)
    // Net each purchase by refundTotal (mirroring how sales returns are
    // netted above) instead of dropping a Returned purchase's cost
    // entirely — a ₹50,000 purchase with a single ₹1,000 defective-item
    // return is marked status='Returned' in full, but ₹49,000 of it is
    // genuinely-kept inventory cost that was still incurred.
    const periodPurchases = purchases.filter(p => inRange(p.createdAt || p.date));
    const totalPurchases  = periodPurchases.reduce((s, p) => s + Math.max(0, (p.totalAmount || 0) - (p.refundTotal || 0)), 0);

    // ── Gross Profit
    const grossProfit = netRevenue - totalPurchases;
    const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue * 100) : 0;

    // ── Operating Expenses
    const periodExpenses = expenses.filter(e => inRange(e.createdAt || e.date));
    const totalExpenses  = periodExpenses.reduce((s, e) => s + (e.amount || 0), 0);

    // Expense breakdown
    const expByCategory = {};
    periodExpenses.forEach(e => {
      const cat = e.category || 'Other';
      expByCategory[cat] = (expByCategory[cat] || 0) + (e.amount || 0);
    });

    // ── Net Profit
    const netProfit  = grossProfit - totalExpenses;
    const netMargin  = netRevenue > 0 ? (netProfit / netRevenue * 100) : 0;

    // ── Payment method breakdown
    const paymentBreakdown = {};
    saleInvoices.forEach(inv => {
      paymentBreakdown[inv.paymentMethod] = (paymentBreakdown[inv.paymentMethod] || 0) + (inv.grandTotal || 0);
    });

    return {
      from, to,
      grossRevenue, salesReturns, netRevenue,
      taxCollected, discountsGiven,
      totalPurchases,
      grossProfit, grossMargin,
      totalExpenses, expByCategory,
      netProfit, netMargin,
      invoiceCount: saleInvoices.length,
      paymentBreakdown,
    };
  }, [invoices, purchases, expenses, period, customStart, customEnd]);

  const handleExportCSV = () => {
    if (!report) return;

    const csvContent = [
      ["Metric", "Amount (INR)"],
      ["Gross Revenue", report.grossRevenue],
      ["Less: Sales Returns", -report.salesReturns],
      ["Less: Discounts Given", -report.discountsGiven],
      ["Net Revenue", report.netRevenue],
      [],
      ["Total Purchases (COGS)", report.totalPurchases],
      ["Gross Profit", report.grossProfit],
      [],
      ["Operating Expenses"],
      ...Object.entries(report.expByCategory).map(([cat, amt]) => [cat, -amt]),
      ["Total Expenses", -report.totalExpenses],
      [],
      ["Net Profit", report.netProfit]
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `profit_loss_${period}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Profit & Loss</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {report.from.toLocaleDateString('en-IN')} – {report.to.toLocaleDateString('en-IN')}
          </p>
        </div>
        <button onClick={handleExportCSV} className="flex items-center gap-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>

      {/* Period selector */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex flex-wrap gap-2 items-center">
        <Calendar className="w-4 h-4 text-gray-400" />
        {PERIODS.map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${period === p.id ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
          >{p.label}</button>
        ))}
        {period === 'custom' && (
          <div className="flex items-center gap-2 ml-2">
            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <span className="text-xs text-gray-400">to</span>
            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30" />
          </div>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Net Revenue</p>
          <p className="text-xl font-bold text-gray-900">{fmt(report.netRevenue)}</p>
          <p className="text-xs text-gray-400 mt-0.5">{report.invoiceCount} invoices</p>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 text-center ${report.grossProfit >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-gray-600 font-medium mb-1">Gross Profit</p>
          <p className={`text-xl font-bold ${report.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>{fmt(report.grossProfit)}</p>
          <p className={`text-xs mt-0.5 ${report.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{report.grossMargin.toFixed(1)}% margin</p>
        </div>
        <div className={`rounded-xl border shadow-sm p-4 text-center ${report.netProfit >= 0 ? 'bg-primary/5 border-primary/20' : 'bg-red-50 border-red-200'}`}>
          <p className="text-xs text-gray-600 font-medium mb-1">Net Profit</p>
          <p className={`text-xl font-bold ${report.netProfit >= 0 ? 'text-primary' : 'text-red-700'}`}>{fmt(report.netProfit)}</p>
          <p className={`text-xs mt-0.5 ${report.netProfit >= 0 ? 'text-primary/70' : 'text-red-600'}`}>{report.netMargin.toFixed(1)}% margin</p>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-900 text-sm">Statement of Profit & Loss</h3>
        </div>
        <div className="py-2 space-y-0.5">
          <div className="px-4 py-1.5"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Revenue</p></div>
          <Row label="Gross Sales" value={report.grossRevenue} />
          <Row label="Less: Sales Returns" value={-report.salesReturns} indent color={report.salesReturns > 0 ? 'text-red-600' : undefined} />
          <Row label="Less: Discounts Given" value={-report.discountsGiven} indent color={report.discountsGiven > 0 ? 'text-orange-600' : undefined} />
          <Row label="Net Revenue" value={report.netRevenue} bold />

          <div className="px-4 py-1.5 mt-2"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Cost of Goods Sold</p></div>
          <Row label="Total Purchases" value={report.totalPurchases} color="text-red-600" />
          <Row label="Gross Profit" value={report.grossProfit} bold color={report.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'} />

          <div className="px-4 py-1.5 mt-2"><p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Operating Expenses</p></div>
          {Object.entries(report.expByCategory).map(([cat, amt]) => (
            <Row key={cat} label={cat} value={amt} indent color="text-orange-700" />
          ))}
          <Row label="Total Expenses" value={report.totalExpenses} bold color="text-orange-700" />

          <div className="border-t-2 border-gray-200 mx-4 mt-2" />
          <div className={`flex justify-between items-center py-4 px-4 rounded-lg mx-2 mb-2 mt-1 ${report.netProfit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            <span className={`font-bold text-base ${report.netProfit >= 0 ? 'text-green-900' : 'text-red-900'}`}>
              {report.netProfit >= 0 ? 'Net Profit' : 'Net Loss'}
            </span>
            <span className={`font-bold text-xl ${report.netProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {fmt(report.netProfit)}
            </span>
          </div>
        </div>
      </div>

      {/* Payment method breakdown */}
      {Object.keys(report.paymentBreakdown).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm">Sales by Payment Method</h3>
          </div>
          <div className="p-4 space-y-3">
            {Object.entries(report.paymentBreakdown).map(([method, amount]) => {
              const pct = report.grossRevenue > 0 ? (amount / report.grossRevenue * 100) : 0;
              return (
                <div key={method}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium text-gray-700">{method}</span>
                    <span className="font-semibold text-gray-900">{fmt(amount)} <span className="text-xs text-gray-400">({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
