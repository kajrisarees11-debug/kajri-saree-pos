'use client';
import { useEffect, useState } from 'react';
import { Printer, RefreshCw } from 'lucide-react';

export default function TrialBalancePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchAccounting = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/reports/accounting');
      const json = await res.json();
      if (json.success) {
        setData(json.data.trialBalance);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounting();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <span className="ml-3 text-gray-500 font-medium">Generating Trial Balance...</span>
      </div>
    );
  }

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(val || 0);

  return (
    <div className="max-w-5xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Trial Balance</h1>
          <p className="text-gray-500 text-sm mt-1">Verifying Debits and Credits mathematically balance.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchAccounting} className="p-2.5 bg-white border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden print:shadow-none print:border-none print:text-sm">
        <div className="p-6 text-center border-b border-gray-200 print:border-b-2 print:border-gray-800">
          <h2 className="text-xl font-bold uppercase tracking-wider text-gray-900">Kajri Sarees</h2>
          <p className="text-gray-500 font-medium">Trial Balance as of {new Date().toLocaleDateString('en-GB')}</p>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200 text-gray-700 text-sm font-semibold">
              <th className="py-3 px-6 border-r border-gray-200 w-1/2">Particulars / Account Head</th>
              <th className="py-3 px-6 border-r border-gray-200 w-1/4 text-right">Debit (₹)</th>
              <th className="py-3 px-6 w-1/4 text-right">Credit (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            
            {/* Debit Balances */}
            {data.debits.map((item, idx) => (
              <tr key={'dr-'+idx} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-6 border-r border-gray-200 text-gray-700 font-medium">{item.account}</td>
                <td className="py-3 px-6 border-r border-gray-200 text-right text-gray-900 font-mono">{formatCurrency(item.amount)}</td>
                <td className="py-3 px-6 text-right text-gray-400 font-mono">-</td>
              </tr>
            ))}

            {/* Credit Balances */}
            {data.credits.map((item, idx) => (
              <tr key={'cr-'+idx} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-6 border-r border-gray-200 text-gray-700 font-medium">{item.account}</td>
                <td className="py-3 px-6 border-r border-gray-200 text-right text-gray-400 font-mono">-</td>
                <td className="py-3 px-6 text-right text-gray-900 font-mono">{formatCurrency(item.amount)}</td>
              </tr>
            ))}
            
          </tbody>
          <tfoot className="bg-primary/5 font-bold text-gray-900 border-t-2 border-gray-300 print:border-t-4 print:border-gray-800">
            <tr>
              <td className="py-4 px-6 border-r border-gray-200 text-right">Grand Total</td>
              <td className="py-4 px-6 border-r border-gray-200 text-right text-lg font-mono text-primary">₹ {formatCurrency(data.totalDebit)}</td>
              <td className="py-4 px-6 text-right text-lg font-mono text-primary">₹ {formatCurrency(data.totalCredit)}</td>
            </tr>
          </tfoot>
        </table>

        {Math.abs(data.totalDebit - data.totalCredit) > 0.1 && (
          <div className="bg-red-50 text-red-700 p-4 text-center font-medium border-t border-red-200 print:hidden">
            Warning: The Trial Balance does not match. Difference: ₹{formatCurrency(Math.abs(data.totalDebit - data.totalCredit))}
          </div>
        )}
      </div>
    </div>
  );
}
