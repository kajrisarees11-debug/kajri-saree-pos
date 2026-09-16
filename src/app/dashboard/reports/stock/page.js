'use client';
import { useData } from '@/context/DataContext';
import { Package, AlertTriangle, Download, Search } from 'lucide-react';
import { useState } from 'react';

export default function StockReportPage() {
  const { products } = useData();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q);
    const stock = p.stock || 0;
    if (filter === 'out_of_stock') return matchSearch && stock === 0;
    if (filter === 'low_stock')    return matchSearch && stock > 0 && stock <= 5;
    if (filter === 'in_stock')     return matchSearch && stock > 5;
    return matchSearch;
  });

  const totalValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.purchasePrice || p.price || 0)), 0);
  const totalSaleValue = products.reduce((s, p) => s + ((p.stock || 0) * (p.price || 0)), 0);

  const exportCSV = () => {
    const rows = [
      ['Name', 'SKU', 'Barcode', 'Category', 'Brand', 'Stock', 'Purchase Price', 'Sale Price', 'Stock Value'],
      ...products.map(p => [
        p.name, p.sku, p.barcode || '', p.subCategory || '', p.brand || '',
        p.stock || 0, p.purchasePrice || '', p.price || '',
        ((p.stock || 0) * (p.purchasePrice || 0)).toFixed(2)
      ])
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `stock-report-${new Date().toLocaleDateString('en-IN').replace(/\//g,'-')}.csv`;
    a.click();
  };

  const stockBadge = (stock) => {
    if (stock === 0) return <span className="text-xs font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Out of Stock</span>;
    if (stock <= 5) return <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">Low Stock</span>;
    return <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">In Stock</span>;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">{products.length} products · {products.filter(p => p.stock === 0).length} out of stock</p>
        </div>
        <button onClick={exportCSV} className="flex items-center gap-2 text-sm font-medium bg-white border border-gray-200 text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors shadow-sm">
          <Download className="w-4 h-4" /> Export CSV
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Total SKUs</p>
          <p className="text-2xl font-bold text-gray-900">{products.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Stock Value (Cost)</p>
          <p className="text-2xl font-bold text-primary">₹{totalValue.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Stock Value (MRP)</p>
          <p className="text-2xl font-bold text-green-700">₹{totalSaleValue.toLocaleString('en-IN')}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product, SKU, brand…"
            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
          />
        </div>
        {['all', 'in_stock', 'low_stock', 'out_of_stock'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all capitalize ${filter === f ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300 bg-white'}`}
          >{f.replace(/_/g, ' ')}</button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Product</th>
              <th className="px-5 py-3 text-left font-medium">SKU / Barcode</th>
              <th className="px-5 py-3 text-left font-medium">Brand / Type</th>
              <th className="px-5 py-3 text-center font-medium">Stock</th>
              <th className="px-5 py-3 text-right font-medium">Cost Price</th>
              <th className="px-5 py-3 text-right font-medium">Sale Price</th>
              <th className="px-5 py-3 text-right font-medium">Stock Value</th>
              <th className="px-5 py-3 text-center font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.slice(0, 100).map(p => (
              <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900 max-w-[180px] truncate">{p.name}</td>
                <td className="px-5 py-3 text-xs font-mono text-gray-500">
                  <div>{p.sku}</div>
                  {p.barcode && <div className="text-gray-400">{p.barcode}</div>}
                </td>
                <td className="px-5 py-3 text-xs text-gray-500">{p.brand || p.sareeType || '—'}</td>
                <td className={`px-5 py-3 text-center font-bold text-sm ${p.stock === 0 ? 'text-red-600' : p.stock <= 5 ? 'text-orange-600' : 'text-green-700'}`}>
                  {p.stock || 0}
                </td>
                <td className="px-5 py-3 text-right text-gray-700">{p.purchasePrice ? `₹${p.purchasePrice.toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-5 py-3 text-right font-medium text-gray-900">{p.price ? `₹${p.price.toLocaleString('en-IN')}` : '—'}</td>
                <td className="px-5 py-3 text-right font-semibold text-primary">
                  ₹{((p.stock || 0) * (p.purchasePrice || p.price || 0)).toLocaleString('en-IN')}
                </td>
                <td className="px-5 py-3 text-center">{stockBadge(p.stock || 0)}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="8" className="px-5 py-10 text-center text-gray-400">No products found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
