'use client';
import { useEffect, useState } from 'react';
import { Printer, Download, RefreshCw } from 'lucide-react';

export default function BalanceSheetPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounting = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/accounting');
      const json = await res.json();
      if (json.success) {
        setData(json.data.balanceSheet);
      } else {
        setError(json.error || 'Failed to load balance sheet.');
      }
    } catch (err) {
      console.error(err);
      setError(err.message || 'Network error.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounting();
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <p className="text-red-600 font-medium">Couldn&apos;t load the balance sheet: {error}</p>
        <button onClick={fetchAccounting} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition-colors text-sm font-medium">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <RefreshCw className="w-8 h-8 text-primary animate-spin" />
        <span className="ml-3 text-gray-500 font-medium">Computing Balance Sheet...</span>
      </div>
    );
  }

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val);

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <div className="flex justify-between items-center mb-8 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>
          <p className="text-gray-500 text-sm mt-1">Snapshot of Assets, Liabilities, and Equity.</p>
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
          <p className="text-gray-500 font-medium">Balance Sheet as of {new Date().toLocaleDateString('en-GB')}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200 print:grid-cols-2 print:divide-x">
          
          {/* Liabilities & Equity */}
          <div>
            <div className="bg-gray-50 px-6 py-3 font-semibold text-gray-700 border-b border-gray-200">
              Liabilities & Equity
            </div>
            <div className="p-6 min-h-[400px]">
              {/* Equity */}
              <h3 className="font-bold text-gray-800 mb-2 underline decoration-gray-300 underline-offset-4">Capital Account</h3>
              <div className="space-y-3 mb-6">
                {data.equity.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.account}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>

              {/* Current Liabilities */}
              <h3 className="font-bold text-gray-800 mb-2 underline decoration-gray-300 underline-offset-4">Current Liabilities</h3>
              <div className="space-y-3">
                {data.liabilities.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.account}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-primary/5 px-6 py-4 border-t border-gray-200 flex justify-between items-center print:border-t-2 print:border-gray-800">
              <span className="font-bold text-gray-900">Total Liabilities & Equity</span>
              <span className="font-bold text-primary text-lg">{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
            </div>
          </div>

          {/* Assets */}
          <div>
            <div className="bg-gray-50 px-6 py-3 font-semibold text-gray-700 border-b border-gray-200">
              Assets
            </div>
            <div className="p-6 min-h-[400px]">
              
              {/* Current Assets */}
              <h3 className="font-bold text-gray-800 mb-2 underline decoration-gray-300 underline-offset-4">Current Assets</h3>
              <div className="space-y-3">
                {data.assets.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <span className="text-gray-600">{item.account}</span>
                    <span className="font-medium text-gray-900">{formatCurrency(item.amount)}</span>
                  </div>
                ))}
              </div>
              
            </div>
            
            <div className="bg-primary/5 px-6 py-4 border-t border-gray-200 flex justify-between items-center print:border-t-2 print:border-gray-800">
              <span className="font-bold text-gray-900">Total Assets</span>
              <span className="font-bold text-primary text-lg">{formatCurrency(data.totalAssets)}</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
