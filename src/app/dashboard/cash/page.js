'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Banknote, Plus, ArrowUp, ArrowDown, Search, Check, AlertTriangle, X } from 'lucide-react';

const CATEGORIES = ['Opening Balance', 'Cash Sale', 'Cash Receipt', 'Cash Payment', 'Expense', 'Other'];

export default function CashPage() {
  const { invoices, expenses, cashTransactions, refresh } = useData();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ type: 'in', amount: '', category: 'Other', description: '', date: new Date().toISOString().split('T')[0] });
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3000);
  };

  // Derive cash ledger from invoices + expenses + manual entries
  const cashLedger = useMemo(() => {
    const entries = [];

    // Cash sales from invoices
    invoices.filter(inv => inv.paymentMethod === 'Cash' && inv.status === 'Completed').forEach(inv => {
      entries.push({
        id: inv._id,
        date: new Date(inv.createdAt || inv.date),
        type: 'in',
        amount: inv.grandTotal || 0,
        description: `Sale – ${inv.invoiceNumber}`,
        category: 'Cash Sale',
      });
    });

    // Cash expenses
    expenses.filter(e => e.paymentMethod === 'Cash').forEach(e => {
      entries.push({
        id: e._id,
        date: new Date(e.createdAt || e.date),
        type: 'out',
        amount: e.amount || 0,
        description: e.description || e.category || 'Expense',
        category: 'Expense',
      });
    });

    // Manual transactions (persisted via /api/cash/transactions)
    cashTransactions.forEach(t => entries.push({ ...t, id: t._id, date: new Date(t.date) }));

    return entries.sort((a, b) => b.date - a.date);
  }, [invoices, expenses, cashTransactions]);

  const balance = cashLedger.reduce((s, e) => e.type === 'in' ? s + e.amount : s - e.amount, 0);

  const handleAdd = async () => {
    if (!form.amount || Number(form.amount) <= 0) return;
    setSaving(true);
    try {
      const res = await fetch('/api/cash/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: Number(form.amount) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to save transaction');

      await refresh('cashTransactions');
      showToast('success', 'Transaction recorded.');
      setModalOpen(false);
      setForm({ type: 'in', amount: '', category: 'Other', description: '', date: new Date().toISOString().split('T')[0] });
    } catch (err) {
      console.error('[Cash] Failed to record transaction:', err);
      showToast('error', err.message || 'Failed to record transaction.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <Check className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cash Transactions</h1>
          <p className="text-sm text-gray-500 mt-0.5">Cash register and petty cash ledger</p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Entry
        </button>
      </div>

      {/* Balance card */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Cash In</p>
          <p className="text-xl font-bold text-green-600">₹{cashLedger.filter(e => e.type === 'in').reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}</p>
        </div>
        <div className="col-span-1 bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-600 font-semibold mb-1">Current Balance</p>
          <p className={`text-2xl font-bold ${balance >= 0 ? 'text-primary' : 'text-red-600'}`}>₹{balance.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Cash Out</p>
          <p className="text-xl font-bold text-red-600">₹{cashLedger.filter(e => e.type === 'out').reduce((s, e) => s + e.amount, 0).toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Transactions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Transaction Log</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {cashLedger.length === 0 && (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">No cash transactions yet.</p>
          )}
          {cashLedger.map((e, i) => (
            <div key={e.id || i} className="flex items-center gap-4 px-5 py-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${e.type === 'in' ? 'bg-green-100' : 'bg-red-100'}`}>
                {e.type === 'in' ? <ArrowUp className="w-4 h-4 text-green-600" /> : <ArrowDown className="w-4 h-4 text-red-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 truncate">{e.description}</p>
                <p className="text-xs text-gray-400">{e.date.toLocaleDateString('en-IN')} · {e.category}</p>
              </div>
              <div className={`font-bold text-sm ${e.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                {e.type === 'in' ? '+' : '-'}₹{e.amount.toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Add Cash Entry</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                {[{ id: 'in', label: 'Cash In', color: 'border-green-500 bg-green-50 text-green-700' }, { id: 'out', label: 'Cash Out', color: 'border-red-500 bg-red-50 text-red-700' }].map(opt => (
                  <button key={opt.id} onClick={() => setForm(f => ({ ...f, type: opt.id }))}
                    className={`flex-1 py-2.5 rounded-lg border-2 text-sm font-semibold transition-all ${form.type === opt.id ? opt.color : 'border-gray-200 text-gray-500'}`}
                  >{opt.label}</button>
                ))}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Amount (₹)</label>
                <input type="number" min="1" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0.00" autoFocus
                  className="w-full px-3 py-3 border border-gray-200 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Category</label>
                <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
                >
                  {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Add description…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Date</label>
                <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button onClick={handleAdd} disabled={!form.amount || Number(form.amount) <= 0 || saving}
                className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >{saving ? 'Saving…' : 'Add Entry'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
