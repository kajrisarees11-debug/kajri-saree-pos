'use client';
import { useMemo, useState } from 'react';
import { useData } from '@/context/DataContext';
import { PieChart, Search, Download } from 'lucide-react';

export default function ItemWiseSalesPage() {
  const { invoices, products } = useData();
  const [search, setSearch] = useState('');

  const itemSales = useMemo(() => {
    const map = {};
    invoices.filter(inv => inv.status === 'Completed').forEach(inv => {
      (inv.items || []).forEach(item => {
        const pid = item.productId?._id || item.productId;
        const name = item.productId?.name || pid || 'Unknown';
        if (!map[pid]) {
          map[pid] = { name, qty: 0, revenue: 0, profit: 0 };
        }
        map[pid].qty     += item.quantity || 0;
        map[pid].revenue += item.total    || 0;
        // Rough profit estimate if we have purchase price
        const prod = products.find(p => p._id === pid);
        if (prod?.purchasePrice) {
          map[pid].profit += (item.total || 0) - (prod.purchasePrice * (item.quantity || 0));
        }
      });
    });
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [invoices, products]);

  const totalRevenue = itemSales.reduce((s, i) => s + i.revenue, 0);

  const filtered = itemSales.filter(i => i.name?.toLowerCase().includes(search.toLowerCase()));

  const exportCSV = () => {
    const rows = [['Product', 'Qty Sold', 'Revenue', 'Profit', 'Revenue %'], ...filtered.map(i => [i.name, i.qty, i.revenue.toFixed(2), i.profit.toFixed(2), totalRevenue > 0 ? (i.revenue/totalRevenue*100).toFixed(1)+'%' : '0%'])];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `item-sales-${new Date().toLocaleDateString('en-IN').replace(/\//g,'-')}.csv`;
    a.click();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Item-wise Sales</h1>
          <p className="text-sm text-gray-500 mt-0.5">{itemSales.length} products sold · ₹{totalRevenue.toLocaleString('en-IN')} total revenue</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
          <Download className="w-4 h-4" /> Export
        </button>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">#</th>
              <th className="px-5 py-3 text-left font-medium">Product</th>
              <th className="px-5 py-3 text-center font-medium">Qty Sold</th>
              <th className="px-5 py-3 text-right font-medium">Revenue</th>
              <th className="px-5 py-3 text-right font-medium">Est. Profit</th>
              <th className="px-5 py-3 text-right font-medium">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((item, idx) => {
              const share = totalRevenue > 0 ? item.revenue / totalRevenue * 100 : 0;
              return (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="px-5 py-3 text-gray-400 text-xs font-medium">{idx + 1}</td>
                  <td className="px-5 py-3 font-medium text-gray-900 max-w-[200px] truncate">{item.name}</td>
                  <td className="px-5 py-3 text-center font-semibold text-gray-900">{item.qty}</td>
                  <td className="px-5 py-3 text-right font-bold text-gray-900">₹{item.revenue.toLocaleString('en-IN')}</td>
                  <td className={`px-5 py-3 text-right font-semibold text-sm ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.profit !== 0 ? `₹${item.profit.toLocaleString('en-IN')}` : '—'}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${share}%` }} />
                      </div>
                      <span className="text-xs text-gray-500 w-10 text-right">{share.toFixed(1)}%</span>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan="6" className="px-5 py-10 text-center text-gray-400">No sales data yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
