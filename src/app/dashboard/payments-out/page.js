'use client';
import { useState } from 'react';
import { useData } from '@/context/DataContext';
import { CreditCard, Search, Check, AlertTriangle } from 'lucide-react';

export default function PaymentsOutPage() {
  const { suppliers, refresh } = useData();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('Cash');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const filtered = suppliers.filter(s => s.name?.toLowerCase().includes(search.toLowerCase()));

  const handlePay = async () => {
    if (!selected || !amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${selected._id}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(amount), mode, note }),
      });
      const data = await res.json();
      if (data.success || res.ok) {
        setToast({ type: 'success', msg: `₹${amount} paid to ${selected.name}` });
        await refresh('suppliers');
        setSelected(null); setAmount(''); setNote('');
      } else {
        setToast({ type: 'error', msg: data.error || 'Failed to record payment' });
      }
    } catch (e) {
      setToast({ type: 'error', msg: e.message });
    } finally {
      setSaving(false);
      setTimeout(() => setToast(null), 4000);
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
      <div>
        <h1 className="text-xl font-bold text-gray-900">Payments Out (Pay Supplier)</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record payments made to suppliers</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search supplier…"
                className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </div>
          <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
            {filtered.length === 0 && <p className="px-5 py-8 text-center text-gray-400 text-sm">No suppliers found.</p>}
            {filtered.map(s => (
              <button key={s._id} onClick={() => { setSelected(s); setAmount(''); }}
                className={`w-full text-left px-5 py-3.5 flex justify-between items-center hover:bg-gray-50 transition-colors ${selected?._id === s._id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
              >
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{s.name}</p>
                  <p className="text-xs text-gray-500">{s.phone || 'No phone'}</p>
                </div>
                {(s.outstandingBalance || 0) > 0 && (
                  <span className="text-xs font-bold text-orange-600">₹{(s.outstandingBalance || 0).toLocaleString('en-IN')} due</span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
          {!selected ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <CreditCard className="w-10 h-10 mb-2 text-gray-300" />
              <p className="text-sm">Select a supplier to record payment</p>
            </div>
          ) : (
            <>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
                <p className="font-bold text-gray-900">{selected.name}</p>
                {(selected.outstandingBalance || 0) > 0 && (
                  <p className="text-sm text-orange-700 mt-0.5">Payable: <strong>₹{(selected.outstandingBalance || 0).toLocaleString('en-IN')}</strong></p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Amount Paid (₹)</label>
                <input type="number" min="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus
                  className="w-full px-3 py-3 border border-gray-200 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Mode</label>
                <div className="flex gap-2 flex-wrap">
                  {['Cash', 'UPI', 'NEFT/IMPS', 'Cheque'].map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-all ${mode === m ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                    >{m}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Note (optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Reference number, note…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
              <button onClick={handlePay} disabled={saving || !amount || Number(amount) <= 0}
                className="w-full py-3 bg-primary text-white rounded-lg font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />}
                Confirm Payment Made
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
