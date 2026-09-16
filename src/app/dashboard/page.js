'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { 
  IndianRupee, Package, ShoppingCart, TrendingUp, WifiOff,
  AlertTriangle, Users, ArrowRight, ReceiptText, Truck,
  CheckCircle2, Clock, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { useData } from '@/context/DataContext';

// ─── Tiny inline SVG sparkline ────────────────────────────────────────────────
function Sparkline({ data, color = '#800000', height = 36 }) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} className="opacity-60">
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Gradient area fill */}
      <polyline
        points={`0,${height} ${pts} ${w},${height}`}
        fill={`${color}20`}
        stroke="none"
      />
    </svg>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPICard({ label, value, sub, subColor = 'text-gray-500', icon: Icon, iconColor, sparkData, href }) {
  const card = (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow cursor-pointer group">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${iconColor} flex items-center justify-center`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        {sparkData && <Sparkline data={sparkData} color={iconColor?.includes('primary') ? '#800000' : iconColor?.includes('blue') ? '#2563eb' : iconColor?.includes('orange') ? '#ea580c' : '#dc2626'} />}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
        {sub && <p className={`text-xs mt-1 font-medium ${subColor} flex items-center gap-1`}>{sub}</p>}
      </div>
    </div>
  );
  return href ? <Link href={href}>{card}</Link> : card;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    Completed: 'bg-green-100 text-green-700',
    Returned:  'bg-orange-100 text-orange-700',
    Cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

// ─── Main dashboard ───────────────────────────────────────────────────────────
export default function DashboardHome() {
  const { invoices, products, customers, purchases, expenses, loading, lastSynced, isOnline } = useData();

  const analytics = useMemo(() => {
    const now     = new Date();
    const today   = new Date(now).setHours(0, 0, 0, 0);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Today's invoices
    const todayInvoices = invoices.filter(inv => {
      const d = new Date(inv.createdAt || inv.date).setHours(0, 0, 0, 0);
      return d === today;
    });
    const todaySales = todayInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);

    // ── This month
    const monthInvoices = invoices.filter(inv => new Date(inv.createdAt || inv.date) >= thisMonth);
    const monthSales = monthInvoices.reduce((s, inv) => s + (inv.grandTotal || 0), 0);

    // ── Weekly sparkline (last 7 days)
    const weeklyData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      d.setHours(0, 0, 0, 0);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      return invoices
        .filter(inv => {
          const id = new Date(inv.createdAt || inv.date);
          return id >= d && id < next;
        })
        .reduce((s, inv) => s + (inv.grandTotal || 0), 0);
    });

    // ── Udhaar (outstanding balances)
    const udhaarCustomers = customers.filter(c => (c.outstandingBalance || 0) > 0);
    const pendingUdhaar   = udhaarCustomers.reduce((s, c) => s + (c.outstandingBalance || 0), 0);

    // ── Inventory
    const lowStockItems = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) <= 5);
    const outOfStock    = products.filter(p => (p.stock || 0) === 0 && p.status !== 'Inactive');

    // ── Recent invoices (last 8)
    const recentInvoices = [...invoices]
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date))
      .slice(0, 8);

    // ── Top products by sales
    const productSales = {};
    invoices.forEach(inv => {
      (inv.items || []).forEach(item => {
        const id = item.productId?._id || item.productId;
        if (id) productSales[id] = (productSales[id] || 0) + (item.total || 0);
      });
    });
    const topProducts = products
      .filter(p => productSales[p._id])
      .sort((a, b) => (productSales[b._id] || 0) - (productSales[a._id] || 0))
      .slice(0, 5)
      .map(p => ({ ...p, totalSales: productSales[p._id] || 0 }));

    // ── This month purchases & expenses
    const monthPurchases = purchases
      .filter(p => new Date(p.createdAt || p.date) >= thisMonth)
      .reduce((s, p) => s + (p.totalAmount || 0), 0);
    const monthExpenses = expenses
      .filter(e => new Date(e.createdAt || e.date) >= thisMonth)
      .reduce((s, e) => s + (e.amount || 0), 0);
    const grossProfit = monthSales - monthPurchases - monthExpenses;

    return {
      todaySales, monthSales, weeklyData,
      invoicesGenerated: todayInvoices.length,
      pendingUdhaar, udhaarCount: udhaarCustomers.length,
      lowStockItems, outOfStock,
      recentInvoices, topProducts,
      monthPurchases, monthExpenses, grossProfit,
    };
  }, [invoices, products, customers, purchases, expenses]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {/* ── Offline / sync status bar ── */}
      {!isOnline && (
        <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4 flex-shrink-0" />
          <span>Offline mode — showing data from local cache.</span>
          {lastSynced && (
            <span className="text-orange-500 text-xs ml-auto">
              Last synced: {new Date(lastSynced).toLocaleTimeString()}
            </span>
          )}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        <Link
          href="/pos"
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          <ShoppingCart className="w-4 h-4" />
          New Sale (F2)
        </Link>
      </div>

      {/* ── KPI Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Today's Sales"
          value={`₹${analytics.todaySales.toLocaleString('en-IN')}`}
          sub={<><TrendingUp className="w-3 h-3" /> {analytics.invoicesGenerated} invoice{analytics.invoicesGenerated !== 1 ? 's' : ''} today</>}
          subColor="text-green-600"
          icon={IndianRupee}
          iconColor="bg-primary"
          sparkData={analytics.weeklyData}
          href="/dashboard/sales"
        />
        <KPICard
          label="Month Sales"
          value={`₹${analytics.monthSales.toLocaleString('en-IN')}`}
          sub={<><ArrowUpRight className="w-3 h-3" /> ₹{analytics.grossProfit.toLocaleString('en-IN')} est. profit</>}
          subColor={analytics.grossProfit >= 0 ? 'text-green-600' : 'text-red-600'}
          icon={TrendingUp}
          iconColor="bg-blue-600"
          href="/dashboard/reports"
        />
        <KPICard
          label="Pending Udhaar"
          value={`₹${analytics.pendingUdhaar.toLocaleString('en-IN')}`}
          sub={`${analytics.udhaarCount} customer${analytics.udhaarCount !== 1 ? 's' : ''} with balance`}
          subColor={analytics.pendingUdhaar > 0 ? 'text-red-600' : 'text-green-600'}
          icon={Users}
          iconColor="bg-red-500"
          href="/dashboard/customers"
        />
        <KPICard
          label="Low / Out of Stock"
          value={`${analytics.lowStockItems.length + analytics.outOfStock.length}`}
          sub={`${analytics.outOfStock.length} out of stock, ${analytics.lowStockItems.length} low`}
          subColor={analytics.outOfStock.length > 0 ? 'text-orange-600' : 'text-yellow-600'}
          icon={Package}
          iconColor="bg-orange-500"
          href="/dashboard/products"
        />
      </div>

      {/* ── Main content grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Invoices – 2 cols */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 text-sm">Recent Invoices</h3>
            <Link href="/dashboard/sales" className="text-xs text-primary hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-xs">
                  <th className="px-5 py-3 font-medium text-left">Invoice #</th>
                  <th className="px-5 py-3 font-medium text-left">Customer</th>
                  <th className="px-5 py-3 font-medium text-left">Payment</th>
                  <th className="px-5 py-3 font-medium text-right">Amount</th>
                  <th className="px-5 py-3 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-5 py-3">
                          <div className="h-3 bg-gray-100 rounded animate-pulse w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : analytics.recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-5 py-10 text-center text-gray-400 text-sm">
                      No invoices yet. <Link href="/pos" className="text-primary underline">Create your first sale</Link>
                    </td>
                  </tr>
                ) : (
                  analytics.recentInvoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-3 font-semibold text-primary text-xs">{inv.invoiceNumber}</td>
                      <td className="px-5 py-3 text-gray-700">
                        {inv.customerId?.name || inv.customerId || 'Walk-in'}
                      </td>
                      <td className="px-5 py-3">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                          {inv.paymentMethod}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-gray-900">
                        ₹{(inv.grandTotal || 0).toLocaleString('en-IN')}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <StatusBadge status={inv.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          
          {/* Quick Actions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {[
                { label: 'New Sale',         href: '/pos',                     icon: ShoppingCart, color: 'bg-primary/10 text-primary' },
                { label: 'Add Product',      href: '/dashboard/products',       icon: Package,      color: 'bg-blue-50 text-blue-600' },
                { label: 'Stock Inward',     href: '/dashboard/purchases',      icon: Truck,        color: 'bg-green-50 text-green-600' },
                { label: 'Add Expense',      href: '/dashboard/expenses',       icon: IndianRupee,  color: 'bg-orange-50 text-orange-600' },
                { label: 'Print Barcodes',   href: '/dashboard/barcodes',       icon: ReceiptText,  color: 'bg-purple-50 text-purple-600' },
              ].map(({ label, href, icon: Icon, color }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-gray-700 text-sm group"
                >
                  <div className={`w-7 h-7 rounded-md ${color} flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  {label}
                  <ArrowRight className="w-3 h-3 ml-auto text-gray-300 group-hover:text-gray-400 transition-colors" />
                </Link>
              ))}
            </div>
          </div>

          {/* Low Stock Alert */}
          {(analytics.lowStockItems.length > 0 || analytics.outOfStock.length > 0) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-orange-600" />
                <h3 className="font-semibold text-orange-900 text-sm">Stock Alerts</h3>
              </div>
              <div className="space-y-2">
                {[...analytics.outOfStock.slice(0, 3), ...analytics.lowStockItems.slice(0, 3)].map(p => (
                  <div key={p._id} className="flex items-center justify-between">
                    <span className="text-xs text-orange-800 truncate max-w-[160px]">{p.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.stock === 0 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
                      {p.stock === 0 ? 'Out' : `${p.stock} left`}
                    </span>
                  </div>
                ))}
              </div>
              <Link href="/dashboard/products" className="text-xs text-orange-700 hover:underline mt-2 flex items-center gap-1">
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          )}

          {/* Month summary mini card */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-semibold text-gray-900 text-sm mb-3">This Month</h3>
            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><ArrowUpRight className="w-3.5 h-3.5 text-green-500" />Sales</span>
                <span className="font-semibold text-gray-900">₹{analytics.monthSales.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><ArrowDownRight className="w-3.5 h-3.5 text-red-500" />Purchases</span>
                <span className="font-semibold text-gray-900">₹{analytics.monthPurchases.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-500 flex items-center gap-1.5"><ArrowDownRight className="w-3.5 h-3.5 text-orange-500" />Expenses</span>
                <span className="font-semibold text-gray-900">₹{analytics.monthExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="border-t border-gray-100 pt-2.5 flex justify-between items-center text-sm font-bold">
                <span className={analytics.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}>Est. Profit</span>
                <span className={analytics.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}>
                  ₹{analytics.grossProfit.toLocaleString('en-IN')}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
