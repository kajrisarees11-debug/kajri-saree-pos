'use client';
import { useState, useMemo, useEffect, Suspense } from 'react';
import { useData } from '@/context/DataContext';
import { useSearchParams } from 'next/navigation';
import { BookOpen, Search, ArrowLeft, Download, ArrowUp, ArrowDown } from 'lucide-react';

function PartyStatementContent() {
  const { customers, invoices, expenses } = useData();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  // Auto-select customer if customerId is in URL query
  useEffect(() => {
    const cid = searchParams.get('customerId');
    if (cid && customers.length > 0 && !selected) {
      const found = customers.find(c => c._id === cid);
      if (found) setSelected(found);
    }
  }, [searchParams, customers, selected]);

  const filtered = customers.filter(c => c.name?.toLowerCase().includes(search.toLowerCase()) || c.mobileNumber?.includes(search));

  const statement = useMemo(() => {
    if (!selected) return [];
    const entries = [];
    // Invoices for this customer
    invoices
      .filter(inv => {
        const cid = inv.customerId?._id || inv.customerId;
        return cid === selected._id;
      })
      .forEach(inv => {
        entries.push({
          date: new Date(inv.createdAt || inv.date),
          type: 'invoice',
          description: `Invoice ${inv.invoiceNumber}`,
          debit: inv.grandTotal || 0,
          credit: inv.amountPaid || 0,
          ref: inv.invoiceNumber,
        });
      });
    return entries.sort((a, b) => a.date - b.date);
  }, [selected, invoices]);

  const balance = statement.reduce((s, e) => s + (e.debit || 0) - (e.credit || 0), 0);

  if (selected) {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{selected.name}</h1>
            <p className="text-sm text-gray-500">{selected.mobile} · Account Statement</p>
          </div>
          <div className={`text-right`}>
            <p className="text-xs text-gray-500 font-medium">Outstanding Balance</p>
            <p className={`text-xl font-bold ${balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              {balance > 0 ? `₹${balance.toLocaleString('en-IN')} Dr` : `₹${Math.abs(balance).toLocaleString('en-IN')} Cr`}
            </p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
                <th className="px-5 py-3 text-left font-medium">Date</th>
                <th className="px-5 py-3 text-left font-medium">Description</th>
                <th className="px-5 py-3 text-right font-medium">Debit (Dr)</th>
                <th className="px-5 py-3 text-right font-medium">Credit (Cr)</th>
                <th className="px-5 py-3 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {statement.length === 0 && (
                <tr><td colSpan="5" className="px-5 py-10 text-center text-gray-400">No transactions found.</td></tr>
              )}
              {(() => {
                let running = 0;
                return statement.map((e, i) => {
                  running += (e.debit || 0) - (e.credit || 0);
                  return (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500 text-xs">{e.date.toLocaleDateString('en-IN')}</td>
                      <td className="px-5 py-3 font-medium text-gray-900">{e.description}</td>
                      <td className="px-5 py-3 text-right text-red-600 font-semibold">{e.debit ? `₹${e.debit.toLocaleString('en-IN')}` : '—'}</td>
                      <td className="px-5 py-3 text-right text-green-600 font-semibold">{e.credit ? `₹${e.credit.toLocaleString('en-IN')}` : '—'}</td>
                      <td className={`px-5 py-3 text-right font-bold text-sm ${running >= 0 ? 'text-red-700' : 'text-green-700'}`}>
                        ₹{Math.abs(running).toLocaleString('en-IN')} {running >= 0 ? 'Dr' : 'Cr'}
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Party Statement</h1>
        <p className="text-sm text-gray-500 mt-0.5">View per-customer ledger and outstanding balances</p>
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search customer…"
          className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white"
        />
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs border-b border-gray-100">
              <th className="px-5 py-3 text-left font-medium">Customer</th>
              <th className="px-5 py-3 text-left font-medium">Mobile</th>
              <th className="px-5 py-3 text-right font-medium">Outstanding</th>
              <th className="px-5 py-3 text-center font-medium">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map(c => (
              <tr key={c._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-5 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-5 py-3 text-gray-500 text-xs">{c.mobileNumber || '—'}</td>
                <td className={`px-5 py-3 text-right font-bold text-sm ${(c.outstandingBalance || 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {(c.outstandingBalance || 0) > 0 ? `₹${c.outstandingBalance.toLocaleString('en-IN')} Dr` : '₹0'}
                </td>
                <td className="px-5 py-3 text-center">
                  <button onClick={() => setSelected(c)}
                    className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                  >View Statement</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan="4" className="px-5 py-10 text-center text-gray-400">No customers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function PartyStatementPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-gray-500">Loading statement...</div>}>
      <PartyStatementContent />
    </Suspense>
  );
}
