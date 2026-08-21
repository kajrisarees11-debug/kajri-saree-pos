'use client';
import { useState, useEffect } from 'react';
import { Download, FileText, Calendar, Filter, PieChart, IndianRupee, TrendingUp } from 'lucide-react';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    sales: 0,
    purchases: 0,
    profit: 0,
    taxes: 0
  });
  const [breakdown, setBreakdown] = useState([]);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch('/api/reports');
        const data = await res.json();
        if (data.success) {
          setStats(data.data.stats);
          setBreakdown(data.data.breakdown);
        }
      } catch (err) {
        console.error("Error fetching reports", err);
      } finally {
        setLoading(false);
      }
    };
    fetchReports();
  }, []);

  const handleExportCSV = () => {
    alert("Exporting CSV...");
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Business Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Generate sales, purchase, and GST reports.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleExportCSV} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium">
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-8 flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
          <div className="relative">
            <Calendar className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select 
              value={dateRange} 
              onChange={(e) => setDateRange(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm bg-white"
            >
              <option value="today">Today</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range...</option>
            </select>
          </div>
        </div>

        {dateRange === 'custom' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="py-2 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="py-2 px-3 border border-gray-300 rounded-lg focus:outline-none focus:border-primary text-sm" />
            </div>
          </>
        )}

        <button className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium">
          <Filter className="w-4 h-4" /> Apply Filters
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <IndianRupee className="w-4 h-4" /> <span className="text-sm font-medium">Total Sales</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">₹{stats.sales.toLocaleString()}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <PieChart className="w-4 h-4" /> <span className="text-sm font-medium">Total Purchases</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">₹{stats.purchases.toLocaleString()}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <TrendingUp className="w-4 h-4 text-green-600" /> <span className="text-sm font-medium">Est. Gross Profit</span>
          </div>
          <div className="text-3xl font-bold text-green-600">₹{stats.profit.toLocaleString()}</div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 text-gray-500 mb-2">
            <FileText className="w-4 h-4" /> <span className="text-sm font-medium">Tax Collected (GST)</span>
          </div>
          <div className="text-3xl font-bold text-gray-900">₹{stats.taxes.toLocaleString()}</div>
        </div>
      </div>

      {/* Reports Table Mockup */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-800">Sales Summary Breakdown</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium text-right">Invoices Generated</th>
                <th className="px-6 py-4 font-medium text-right">Total Amount (₹)</th>
                <th className="px-6 py-4 font-medium text-right">Tax (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm text-gray-700">
              {loading ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-gray-500">Loading reports...</td>
                </tr>
              ) : breakdown.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-10 text-center text-gray-500">No data available.</td>
                </tr>
              ) : (
                breakdown.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{row.date}</td>
                    <td className="px-6 py-4 text-right">{row.invoicesGenerated}</td>
                    <td className="px-6 py-4 text-right">{row.totalAmount.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                    <td className="px-6 py-4 text-right">{row.tax.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
