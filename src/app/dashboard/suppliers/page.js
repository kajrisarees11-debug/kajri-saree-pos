'use client';
import { useState } from 'react';
import { Truck, Plus, IndianRupee, WifiOff } from 'lucide-react';
import { useData } from '@/context/DataContext';

export default function SuppliersPage() {
  const { suppliers, loading, isOnline, refresh } = useData();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ name: '', contactPerson: '', phone: '', gstNumber: '', address: '' });


  const handleAddSupplier = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSupplier)
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setNewSupplier({ name: '', contactPerson: '', phone: '', gstNumber: '', address: '' });
        fetchSuppliers();
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add supplier');
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Manage Suppliers</h1>
          <p className="text-gray-500 text-sm mt-1">Track wholesale vendors and payable balances.</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-primary hover:bg-primary-light text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-blue-100 text-blue-600 mr-4">
            <Truck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Suppliers</p>
            <p className="text-2xl font-bold text-gray-900">{suppliers.length}</p>
          </div>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center">
          <div className="p-3 rounded-full bg-red-100 text-red-600 mr-4">
            <IndianRupee className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Payable (Debt)</p>
            <p className="text-2xl font-bold text-gray-900">
              ₹{suppliers.reduce((sum, s) => sum + (s.payableBalance || 0), 0).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <th className="px-6 py-4 font-medium">Supplier Details</th>
                <th className="px-6 py-4 font-medium">Contact</th>
                <th className="px-6 py-4 font-medium text-right">Total Purchased</th>
                <th className="px-6 py-4 font-medium text-right">Payable Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {suppliers.map((sup) => (
                <tr key={sup._id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{sup.name}</div>
                    <div className="text-xs text-gray-500 mt-1">GST: {sup.gstNumber || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900">{sup.contactPerson || '-'}</div>
                    <div className="text-xs text-gray-500">{sup.phone}</div>
                  </td>
                  <td className="px-6 py-4 font-medium text-right text-gray-900">
                    ₹{(sup.purchaseHistory || 0).toLocaleString()}
                  </td>
                  <td className="px-6 py-4 font-medium text-right">
                    {(sup.payableBalance || 0) > 0 ? (
                      <span className="text-red-600">₹{sup.payableBalance.toLocaleString()}</span>
                    ) : (
                      <span className="text-green-600">Settled</span>
                    )}
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && !loading && (
                <tr>
                  <td colSpan="4" className="px-6 py-8 text-center text-gray-500">No suppliers added yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Add New Supplier</h3>
            <form onSubmit={handleAddSupplier} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company/Supplier Name</label>
                <input 
                  type="text" 
                  required
                  value={newSupplier.name}
                  onChange={e => setNewSupplier({...newSupplier, name: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                <input 
                  type="text" 
                  value={newSupplier.contactPerson}
                  onChange={e => setNewSupplier({...newSupplier, contactPerson: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input 
                  type="text" 
                  required
                  value={newSupplier.phone}
                  onChange={e => setNewSupplier({...newSupplier, phone: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GST Number (Optional)</label>
                <input 
                  type="text" 
                  value={newSupplier.gstNumber}
                  onChange={e => setNewSupplier({...newSupplier, gstNumber: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary uppercase"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <textarea 
                  rows="2"
                  value={newSupplier.address}
                  onChange={e => setNewSupplier({...newSupplier, address: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary"
                ></textarea>
              </div>
              <div className="flex gap-3 justify-end mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-light transition-colors font-medium text-sm"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
