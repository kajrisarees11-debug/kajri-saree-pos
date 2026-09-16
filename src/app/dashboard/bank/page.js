'use client';
import { useState, useMemo } from 'react';
import { useData } from '@/context/DataContext';
import { Building2, Plus, ArrowUp, ArrowDown, X, Check, AlertTriangle, Wallet } from 'lucide-react';

const DEFAULT_BANKS = [
  { id: 'hdfc', name: 'HDFC Bank', accountNo: '', ifsc: '', balance: 0 },
];

export default function BankPage() {
  const { invoices, expenses, purchases } = useData();
  const [banks, setBanks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ name: '', accountNo: '', ifsc: '', openingBalance: '' });
  const [toast, setToast] = useState(null);
  const [txnModal, setTxnModal] = useState(null); // { bankId, type }
  const [txnForm, setTxnForm] = useState({ amount: '', description: '' });
  const [manualTxns, setManualTxns] = useState([]);

  // Derive bank transactions from invoices where payment = Bank Transfer / Card / UPI
  const bankTxns = useMemo(() => {
    const entries = [];
    invoices
      .filter(inv => ['Bank Transfer', 'Card', 'UPI', 'Cheque'].includes(inv.paymentMethod) && inv.status === 'Completed')
      .forEach(inv => {
        entries.push({
          id: inv._id,
          date: new Date(inv.createdAt || inv.date),
          type: 'in',
          amount: inv.grandTotal || 0,
          description: `Sale – ${inv.invoiceNumber} (${inv.paymentMethod})`,
          category: 'Sales Receipt',
        });
      });

    expenses
      .filter(e => ['Bank Transfer', 'Card', 'UPI', 'Cheque', 'NEFT', 'IMPS'].includes(e.paymentMethod))
      .forEach(e => {
        entries.push({
          id: e._id,
          date: new Date(e.createdAt || e.date),
          type: 'out',
          amount: e.amount || 0,
          description: e.description || e.category,
          category: 'Expense',
        });
      });

    manualTxns.forEach(t => entries.push({ ...t, date: new Date(t.date) }));
    return entries.sort((a, b) => b.date - a.date);
  }, [invoices, expenses, manualTxns]);

  const totalIn  = bankTxns.filter(t => t.type === 'in').reduce((s, t) => s + t.amount, 0);
  const totalOut = bankTxns.filter(t => t.type === 'out').reduce((s, t) => s + t.amount, 0);
  const openingBalance = banks.reduce((s, b) => s + (b.openingBalance || 0), 0);
  const netBalance = openingBalance + totalIn - totalOut;

  const addBank = () => {
    if (!form.name) return;
    setBanks(prev => [...prev, { ...form, id: `bank_${Date.now()}`, openingBalance: Number(form.openingBalance) || 0 }]);
    setForm({ name: '', accountNo: '', ifsc: '', openingBalance: '' });
    setModalOpen(false);
    setToast({ type: 'success', msg: 'Bank account added.' });
    setTimeout(() => setToast(null), 3000);
  };

  const addTxn = () => {
    if (!txnForm.amount || Number(txnForm.amount) <= 0) return;
    setManualTxns(prev => [...prev, {
      id: `manual_${Date.now()}`,
      date: new Date().toISOString(),
      type: txnModal.type,
      amount: Number(txnForm.amount),
      description: txnForm.description || (txnModal.type === 'in' ? 'Bank Receipt' : 'Bank Payment'),
      category: 'Manual',
    }]);
    setTxnModal(null);
    setTxnForm({ amount: '', description: '' });
    setToast({ type: 'success', msg: 'Transaction recorded.' });
    setTimeout(() => setToast(null), 3000);
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
          <h1 className="text-xl font-bold text-gray-900">Bank Accounts</h1>
          <p className="text-sm text-gray-500 mt-0.5">Track bank receipts, payments, and balances</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setTxnModal({ type: 'out' })}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 border border-gray-200 rounded-lg text-red-600 hover:bg-red-50 transition-colors">
            <ArrowDown className="w-4 h-4" /> Pay Out
          </button>
          <button onClick={() => setTxnModal({ type: 'in' })}
            className="flex items-center gap-1.5 text-sm font-semibold px-3 py-2 border border-gray-200 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
            <ArrowUp className="w-4 h-4" /> Receive
          </button>
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-primary/90 transition-colors shadow-sm">
            <Plus className="w-4 h-4" /> Add Account
          </button>
        </div>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Total Receipts</p>
          <p className="text-xl font-bold text-green-600">₹{totalIn.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 text-center">
          <p className="text-xs text-gray-600 font-semibold mb-1">Net Bank Balance</p>
          <p className={`text-2xl font-bold ${netBalance >= 0 ? 'text-primary' : 'text-red-600'}`}>
            ₹{netBalance.toLocaleString('en-IN')}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
          <p className="text-xs text-gray-500 font-medium mb-1">Total Payments</p>
          <p className="text-xl font-bold text-red-600">₹{totalOut.toLocaleString('en-IN')}</p>
        </div>
      </div>

      {/* Bank Account Cards */}
      {banks.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {banks.map(bank => (
            <div key={bank.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-900">{bank.name}</p>
                {bank.accountNo && <p className="text-xs text-gray-400 font-mono mt-0.5">A/C: {bank.accountNo}</p>}
                {bank.ifsc && <p className="text-xs text-gray-400 font-mono">IFSC: {bank.ifsc}</p>}
                <p className="text-sm font-semibold text-primary mt-2">
                  Opening: ₹{(bank.openingBalance || 0).toLocaleString('en-IN')}
                </p>
              </div>
              <button onClick={() => setBanks(prev => prev.filter(b => b.id !== bank.id))}
                className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-red-500 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {banks.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Wallet className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">
            Add a bank account above to track opening balances. All bank/UPI/card transactions from invoices and expenses are automatically shown below.
          </p>
        </div>
      )}

      {/* Transaction Log */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Bank Transaction Log</h3>
          <p className="text-xs text-gray-400 mt-0.5">Auto-aggregated from Sales (Card/UPI/Bank) and Expenses</p>
        </div>
        <div className="divide-y divide-gray-50">
          {bankTxns.length === 0 && (
            <p className="px-5 py-10 text-center text-gray-400 text-sm">No bank transactions yet.</p>
          )}
          {bankTxns.map((e, i) => (
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

      {/* Add Bank Account Modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">Add Bank Account</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Bank Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. HDFC Bank, SBI"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" autoFocus />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Account Number</label>
                <input value={form.accountNo} onChange={e => setForm(f => ({ ...f, accountNo: e.target.value }))} placeholder="XXXX XXXX XXXX"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">IFSC Code</label>
                <input value={form.ifsc} onChange={e => setForm(f => ({ ...f, ifsc: e.target.value }))} placeholder="e.g. HDFC0001234"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Opening Balance (₹)</label>
                <input type="number" min="0" value={form.openingBalance} onChange={e => setForm(f => ({ ...f, openingBalance: e.target.value }))} placeholder="0.00"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setModalOpen(false)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={addBank} disabled={!form.name} className="flex-1 py-2.5 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">Add Account</button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Transaction Modal */}
      {txnModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h2 className="font-bold text-gray-900">{txnModal.type === 'in' ? 'Record Bank Receipt' : 'Record Bank Payment'}</h2>
              <button onClick={() => setTxnModal(null)} className="p-1 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Amount (₹) *</label>
                <input type="number" min="1" value={txnForm.amount} onChange={e => setTxnForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" autoFocus
                  className="w-full px-3 py-3 border border-gray-200 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 mb-1.5 block">Description</label>
                <input value={txnForm.description} onChange={e => setTxnForm(f => ({ ...f, description: e.target.value }))} placeholder="Add a note…"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
              </div>
            </div>
            <div className="p-5 border-t border-gray-100 flex gap-3">
              <button onClick={() => setTxnModal(null)} className="flex-1 py-2.5 border border-gray-200 rounded-lg text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={addTxn} disabled={!txnForm.amount || Number(txnForm.amount) <= 0}
                className={`flex-1 py-2.5 text-white rounded-lg text-sm font-semibold disabled:opacity-50 ${txnModal.type === 'in' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}>
                Record {txnModal.type === 'in' ? 'Receipt' : 'Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
