'use client';
import { useState } from 'react';
import { useData } from '@/context/DataContext';
import { RotateCcw, Search, X, Check, AlertTriangle, ArrowLeft } from 'lucide-react';

export default function SalesReturnsPage() {
  const { invoices, refresh } = useData();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [returnItems, setReturnItems] = useState([]);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  // Only show completed invoices that haven't been returned
  const eligible = invoices.filter(inv => {
    if (inv.status !== 'Completed') return false;
    const q = search.toLowerCase();
    return (
      inv.invoiceNumber?.toLowerCase().includes(q) ||
      (inv.customerId?.name || '').toLowerCase().includes(q)
    );
  });

  const selectInvoice = (inv) => {
    setSelected(inv);
    setReturnItems(inv.items?.map(item => ({ ...item, returnQty: 0 })) || []);
  };

  const totalReturn = returnItems.reduce((s, item) => {
    const perUnit = item.total / (item.quantity || 1);
    return s + perUnit * (item.returnQty || 0);
  }, 0);

  const handleReturn = async () => {
    if (!selected || totalReturn <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/invoices/${selected._id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: returnItems.filter(i => i.returnQty > 0).map(i => ({
            productId: i.productId,
            returnQty: i.returnQty,
            refundAmount: (i.total / i.quantity) * i.returnQty,
          })),
          reason,
          refundTotal: totalReturn,
        }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setToast({ type: 'success', msg: `Return processed. Refund: ₹${totalReturn.toFixed(2)}` });
        await refresh('invoices');
        setSelected(null);
      } else {
        setToast({ type: 'error', msg: data.error || 'Return failed' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 5000);
    }
  };

  if (selected) {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        {toast && (
          <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            {toast.msg}
          </div>
        )}
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to invoice list
        </button>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h2 className="font-bold text-gray-900">Process Return – {selected.invoiceNumber}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Customer: {selected.customerId?.name || 'Walk-in'} · 
              Original total: ₹{(selected.grandTotal || 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="p-5 space-y-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Select items to return</p>
            <div className="space-y-3">
              {returnItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <p className="font-medium text-sm text-gray-900">
                      {item.productId?.name || `Product #${idx + 1}`}
                    </p>
                    <p className="text-xs text-gray-500">
                      Qty sold: {item.quantity} · ₹{((item.total || 0) / (item.quantity || 1)).toFixed(2)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.max(0, (it.returnQty || 0) - 1) } : it))}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors font-bold text-gray-600"
                    >−</button>
                    <span className="w-8 text-center text-sm font-bold text-gray-900">{item.returnQty || 0}</span>
                    <button
                      onClick={() => setReturnItems(prev => prev.map((it, i) => i === idx ? { ...it, returnQty: Math.min(it.quantity, (it.returnQty || 0) + 1) } : it))}
                      className="w-7 h-7 rounded-full border border-gray-200 flex items-center justify-center hover:bg-gray-100 transition-colors font-bold text-gray-600"
                    >+</button>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 w-24 text-right">
                    ₹{((item.total / item.quantity) * (item.returnQty || 0)).toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Return Reason</label>
              <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Defective item, Wrong size…"
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex justify-between items-center">
              <span className="font-semibold text-gray-900">Total Refund Amount</span>
              <span className="text-xl font-bold text-primary">₹{totalReturn.toFixed(2)}</span>
            </div>
            <button
              onClick={handleReturn}
              disabled={saving || totalReturn <= 0}
              className="w-full py-3 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Process Return & Refund
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Sales Returns</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select an invoice to process a return or refund</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by invoice # or customer…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Invoice #</th>
              <th className="px-5 py-3 text-left font-medium">Customer</th>
              <th className="px-5 py-3 text-left font-medium">Date</th>
              <th className="px-5 py-3 text-right font-medium">Total</th>
              <th className="px-5 py-3 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {eligible.slice(0, 50).map(inv => (
              <tr key={inv._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-semibold text-primary text-xs">{inv.invoiceNumber}</td>
                <td className="px-5 py-3 text-gray-700">{inv.customerId?.name || 'Walk-in'}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">
                  {new Date(inv.createdAt || inv.date).toLocaleDateString('en-IN')}
                </td>
                <td className="px-5 py-3 text-right font-bold text-gray-900">
                  ₹{(inv.grandTotal || 0).toLocaleString('en-IN')}
                </td>
                <td className="px-5 py-3 text-center">
                  <button
                    onClick={() => selectInvoice(inv)}
                    className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors flex items-center gap-1.5 mx-auto"
                  >
                    <RotateCcw className="w-3 h-3" /> Return
                  </button>
                </td>
              </tr>
            ))}
            {eligible.length === 0 && (
              <tr>
                <td colSpan="5" className="px-5 py-10 text-center text-gray-400">No eligible invoices found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
