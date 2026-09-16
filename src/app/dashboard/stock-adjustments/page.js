'use client';
import { useState, useEffect } from 'react';
import { useData } from '@/context/DataContext';
import { 
  Warehouse, Plus, Search, ChevronDown, Save, 
  ArrowUp, ArrowDown, AlertTriangle, X, Check
} from 'lucide-react';

export default function StockAdjustmentsPage() {
  const { products, refresh } = useData();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [adjType, setAdjType] = useState('add'); // 'add' | 'subtract'
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [recentAdj, setRecentAdj] = useState([]);

  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    return p.name?.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
  });

  const openModal = (product) => {
    setSelected(product);
    setAdjType('add');
    setQuantity('');
    setReason('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!selected || !quantity || isNaN(Number(quantity)) || Number(quantity) <= 0) return;
    setSaving(true);
    try {
      const delta = adjType === 'add' ? Number(quantity) : -Number(quantity);
      const newStock = Math.max(0, (selected.stock || 0) + delta);
      const res = await fetch(`/api/products/${selected._id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock: newStock }),
      });
      const data = await res.json();
      if (data.success) {
        setRecentAdj(prev => [{
          product: selected.name,
          type: adjType,
          qty: Number(quantity),
          before: selected.stock,
          after: newStock,
          reason,
          at: new Date().toLocaleTimeString(),
        }, ...prev].slice(0, 20));
        await refresh('products');
        setToast({ type: 'success', msg: `Stock updated: ${selected.name} → ${newStock}` });
        setModalOpen(false);
      } else {
        setToast({ type: 'error', msg: data.error || 'Failed to update stock' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
    }
  };

  const stockColor = (stock) => {
    if (stock === 0) return 'text-red-600 font-bold';
    if (stock <= 5) return 'text-orange-600 font-semibold';
    return 'text-green-700 font-semibold';
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Stock Adjustments</h1>
          <p className="text-sm text-gray-500 mt-0.5">Add or subtract stock for products manually</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search product or SKU…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>

      {/* Products table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Product</th>
              <th className="px-5 py-3 text-left font-medium">SKU</th>
              <th className="px-5 py-3 text-left font-medium">Category</th>
              <th className="px-5 py-3 text-center font-medium">Current Stock</th>
              <th className="px-5 py-3 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.slice(0, 50).map(p => (
              <tr key={p._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900 max-w-[220px] truncate">{p.name}</td>
                <td className="px-5 py-3 text-gray-500 text-xs font-mono">{p.sku}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{p.subCategory || p.sareeType || '—'}</td>
                <td className={`px-5 py-3 text-center text-sm ${stockColor(p.stock || 0)}`}>
                  {p.stock || 0}
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => openModal(p)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adjust
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="5" className="px-5 py-10 text-center text-gray-400">No products found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent adjustments */}
      {recentAdj.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Recent Adjustments (This Session)</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {recentAdj.map((adj, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4 text-sm">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${adj.type === 'add' ? 'bg-green-100' : 'bg-red-100'}`}>
                  {adj.type === 'add' ? <ArrowUp className="w-3.5 h-3.5 text-green-600" /> : <ArrowDown className="w-3.5 h-3.5 text-red-600" />}
                </div>
                <div className="flex-1">
                  <span className="font-medium text-gray-900">{adj.product}</span>
                  {adj.reason && <span className="text-gray-400 ml-2 text-xs">— {adj.reason}</span>}
                </div>
                <div className="text-gray-500">
                  {adj.before} → <span className="font-bold text-gray-900">{adj.after}</span>
                </div>
                <div className="text-xs text-gray-400">{adj.at}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Adjustment Modal */}
      {modalOpen && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Adjust Stock</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="font-semibold text-gray-900">{selected.name}</p>
                <p className="text-xs text-gray-500 mt-0.5">SKU: {selected.sku} · Current stock: <strong>{selected.stock || 0}</strong></p>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'add', label: 'Add Stock', icon: ArrowUp, color: 'border-green-500 bg-green-50 text-green-700' },
                    { id: 'subtract', label: 'Remove Stock', icon: ArrowDown, color: 'border-red-500 bg-red-50 text-red-700' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => setAdjType(opt.id)}
                      className={`flex items-center gap-2 p-3 rounded-lg border-2 text-sm font-semibold transition-all ${adjType === opt.id ? opt.color : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
                    >
                      <opt.icon className="w-4 h-4" /> {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Quantity</label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  placeholder="Enter quantity…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  autoFocus
                />
                {quantity && !isNaN(Number(quantity)) && (
                  <p className="text-xs text-gray-500 mt-1.5">
                    New stock will be: <strong className="text-gray-900">{Math.max(0, (selected.stock || 0) + (adjType === 'add' ? Number(quantity) : -Number(quantity)))}</strong>
                  </p>
                )}
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Reason (optional)</label>
                <input
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="e.g. New stock received, Damaged goods…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !quantity || Number(quantity) <= 0}
                className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
