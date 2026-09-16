'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, IndianRupee, FileText, Plus, WifiOff } from 'lucide-react';
import { useData } from '@/context/DataContext';

export default function CustomersPage() {
  const { customers, loading, isOnline, refresh } = useData();
  const router = useRouter();
  const [search, setSearch] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: '', mobileNumber: '', address: '' });



  const handleAddCustomer = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCustomer)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setNewCustomer({ name: '', mobileNumber: '', address: '' });
        refresh('customers');
      } else {
        alert('Failed to add customer: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error adding customer');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name?.toLowerCase().includes(search.toLowerCase()) || 
    c.mobileNumber?.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto">
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4" /> Offline mode — showing cached data. Changes require internet.
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Retail Customers (Udhaar)</h1>
          <p className="text-gray-500 text-sm mt-1">Manage POS customers and track credit ledgers.</p>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition-colors text-sm font-medium">
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
            <Search className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Customers</p>
            <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-red-100 text-red-600 mr-4">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Pending Udhaar</p>
            <p className="text-2xl font-bold text-gray-900">
              ₹{customers.reduce((sum, c) => sum + (c.outstandingBalance || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name or mobile..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
            />
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-medium">Customer Name</th>
                <th className="px-6 py-4 font-medium">Mobile Number</th>
                <th className="px-6 py-4 font-medium text-right">Total Purchases</th>
                <th className="px-6 py-4 font-medium text-right">Pending Udhaar</th>
                <th className="px-6 py-4 font-medium text-center">Last Visit</th>
                <th className="px-6 py-4 font-medium text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredCustomers.map((customer) => (
                <tr key={customer._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">{customer.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{customer.mobileNumber}</td>
                  <td className="px-6 py-4 font-medium text-right text-gray-900">₹{(customer.totalPurchases || 0).toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-right">
                    {(customer.outstandingBalance || 0) > 0 ? (
                      <span className="text-red-600">₹{customer.outstandingBalance.toLocaleString()}</span>
                    ) : (
                      <span className="text-green-600">Settled</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-center text-gray-600">
                    {customer.lastPurchaseDate ? new Date(customer.lastPurchaseDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => router.push(`/dashboard/reports/party?customerId=${customer._id}`)}
                      className="text-primary hover:text-primary-light flex items-center justify-center w-full gap-1 text-sm font-medium"
                    >
                      <FileText className="w-4 h-4" /> Ledger
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Customer</h3>
            <form onSubmit={handleAddCustomer} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
                <input type="text" required value={newCustomer.name} onChange={e => setNewCustomer({...newCustomer, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mobile Number *</label>
                <input type="text" required value={newCustomer.mobileNumber} onChange={e => setNewCustomer({...newCustomer, mobileNumber: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea rows="3" value={newCustomer.address} onChange={e => setNewCustomer({...newCustomer, address: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"></textarea>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors font-medium text-sm">Save Customer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
