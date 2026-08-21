'use client';
import { useMemo } from 'react';
import { IndianRupee, Package, ShoppingCart, TrendingUp, WifiOff } from 'lucide-react';
import { useData } from '@/context/DataContext';

export default function DashboardHome() {
  const { invoices, products, customers, isOnline } = useData();

  const analytics = useMemo(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    
    // Invoices might have 'createdAt' or 'date'
    const todayInvoices = invoices.filter(inv => {
      const invDate = new Date(inv.createdAt || inv.date).setHours(0, 0, 0, 0);
      return invDate === today;
    });

    const todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.grandTotal || 0), 0);
    const invoicesGenerated = todayInvoices.length;
    
    // Sort descending by date
    const recentInvoices = [...invoices].sort((a, b) => 
      new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)
    ).slice(0, 5);
    
    const lowStockCount = products.filter(p => (p.stock || 0) < 5).length;
    
    const pendingUdhaar = customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0);
    const udhaarCustomerCount = customers.filter(c => (c.outstandingBalance || 0) > 0).length;

    return {
      todaySales,
      invoicesGenerated,
      recentInvoices,
      lowStockCount,
      pendingUdhaar,
      udhaarCustomerCount
    };
  }, [invoices, products, customers]);
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4" /> Offline mode — dashboard is showing data from your local cache.
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Overview of today&apos;s retail operations.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <IndianRupee className="w-16 h-16 text-primary" />
          </div>
          <p className="text-sm font-medium text-gray-500 relative z-10">Today&apos;s Sales</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2 relative z-10">₹{analytics.todaySales.toLocaleString()}</h3>
          <p className="text-xs text-green-600 mt-2 font-medium flex items-center gap-1 relative z-10">
            <TrendingUp className="w-3 h-3" /> +12% from yesterday
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <ShoppingCart className="w-16 h-16 text-blue-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 relative z-10">Invoices Generated</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2 relative z-10">{analytics.invoicesGenerated}</h3>
          <p className="text-xs text-gray-500 mt-2 relative z-10">For today</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <Package className="w-16 h-16 text-orange-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 relative z-10">Low Stock Items</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2 relative z-10">{analytics.lowStockCount}</h3>
          <p className="text-xs text-orange-600 mt-2 font-medium relative z-10">Needs reordering soon</p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
            <IndianRupee className="w-16 h-16 text-red-600" />
          </div>
          <p className="text-sm font-medium text-gray-500 relative z-10">Pending Udhaar</p>
          <h3 className="text-3xl font-bold text-gray-900 mt-2 relative z-10">₹{analytics.pendingUdhaar.toLocaleString()}</h3>
          <p className="text-xs text-red-600 mt-2 font-medium relative z-10">Across {analytics.udhaarCustomerCount} customers</p>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-bold text-gray-900">Recent Invoices</h3>
            <a href="/dashboard/invoices" className="text-sm text-primary hover:underline">View All</a>
          </div>
          <div className="p-0">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="p-4 font-medium">Inv No</th>
                  <th className="p-4 font-medium">Customer</th>
                  <th className="p-4 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {analytics.recentInvoices.map((inv) => (
                  <tr key={inv._id}>
                    <td className="p-4 font-medium text-primary">{inv.invoiceNumber}</td>
                    <td className="p-4">{inv.customerId ? inv.customerId.name : 'Walk-in'}</td>
                    <td className="p-4 text-right font-bold">₹{inv.grandTotal.toLocaleString()}</td>
                  </tr>
                ))}
                {analytics.recentInvoices.length === 0 && (
                  <tr>
                    <td colSpan="3" className="p-4 text-center text-gray-500">No invoices today.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="font-bold text-gray-900 mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-4">
            <a href="/pos" className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors text-gray-700 font-medium">
              <ShoppingCart className="w-8 h-8 mb-2" />
              New Sale
            </a>
            <a href="/dashboard/purchases" className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors text-gray-700 font-medium">
              <Package className="w-8 h-8 mb-2" />
              Stock Inward
            </a>
            <a href="/dashboard/products" className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors text-gray-700 font-medium">
              <Package className="w-8 h-8 mb-2" />
              Products
            </a>
            <a href="/dashboard/barcodes" className="flex flex-col items-center justify-center p-6 bg-gray-50 border border-gray-200 rounded-lg hover:border-primary hover:text-primary transition-colors text-gray-700 font-medium">
              <Package className="w-8 h-8 mb-2" />
              Print Barcodes
            </a>
          </div>
        </div>
      </div>
      
    </div>
  );
}
