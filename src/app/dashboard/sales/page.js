'use client';
import { useState } from 'react';
import { Search, Printer, FileText, Undo2, WifiOff } from 'lucide-react';
import Link from 'next/link';
import { useData } from '@/context/DataContext';

export default function SalesHistoryPage() {
  const { invoices, loading, isOnline, refresh } = useData();
  const [search, setSearch] = useState('');

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [returnItems, setReturnItems] = useState({}); // { itemId: quantityToReturn }



  const handleOpenReturn = (invoice) => {
    setSelectedInvoice(invoice);
    setReturnItems({});
    setReturnModalOpen(true);
  };

  const handleReturnItemChange = (itemId, qty, maxQty) => {
    const val = Number(qty);
    if (val < 0) return;
    if (val > maxQty) return;
    
    setReturnItems(prev => ({
      ...prev,
      [itemId]: val
    }));
  };

  const handleProcessReturn = async () => {
    const itemsToReturn = Object.entries(returnItems)
      .map(([itemIdx, qty]) => ({ itemIdx: parseInt(itemIdx), returnQty: qty }))
      .filter(i => i.returnQty > 0);

    if (itemsToReturn.length === 0) {
      alert('Please specify quantity for at least one item to return.');
      return;
    }

    const returnPayload = itemsToReturn.map(({ itemIdx, returnQty }) => {
      const item = selectedInvoice.items[itemIdx];
      return {
        productId: item.productId?._id || item.productId,
        returnQty,
        refundAmount: (item.total / item.quantity) * returnQty,
      };
    });

    try {
      const res = await fetch(`/api/invoices/${selectedInvoice._id}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: returnPayload,
          reason: '',
          refundTotal: returnPayload.reduce((s, i) => s + i.refundAmount, 0),
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('Return processed successfully. Stock has been updated.');
        setReturnModalOpen(false);
        refresh('invoices');
        refresh('products');
      } else {
        alert('Failed to process return: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error processing return');
    }
  };

  const filteredInvoices = invoices.filter(inv =>
    (inv.invoiceNumber || '').toLowerCase().includes(search.toLowerCase()) ||
    (inv.customerId?.name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-6xl mx-auto">
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4" /> Offline mode — viewing only. Returns require internet.
        </div>
      )}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sales History</h1>
          <p className="text-gray-500 text-sm mt-1">View past invoices, reprint receipts, and process returns.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex items-center">
          <div className="relative w-full max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by invoice number or customer name..."
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
                <th className="px-6 py-4 font-medium">Date</th>
                <th className="px-6 py-4 font-medium">Invoice No</th>
                <th className="px-6 py-4 font-medium">Customer</th>
                <th className="px-6 py-4 font-medium text-right">Amount (₹)</th>
                <th className="px-6 py-4 font-medium text-center">Payment</th>
                <th className="px-6 py-4 font-medium text-center">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-gray-500">Loading invoices...</td>
                </tr>
              ) : filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-6 py-10 text-center text-gray-500">No invoices found.</td>
                </tr>
              ) : (
                filteredInvoices.map((invoice) => (
                  <tr key={invoice._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {new Date(invoice.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 font-bold text-gray-900">
                      {invoice.invoiceNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {invoice.customerId?.name || 'Walk-in Customer'}
                    </td>
                    <td className="px-6 py-4 font-medium text-right text-gray-900">
                      ₹{invoice.grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                        invoice.paymentMethod === 'Cash' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {invoice.paymentMethod}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {invoice.status === 'Returned' ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Returned
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right flex justify-end gap-2">
                      <Link href={`/pos/receipt?id=${invoice._id}`} target="_blank" className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Print Receipt">
                        <Printer className="w-4 h-4" />
                      </Link>
                      <Link href={`/pos/invoice?id=${invoice._id}`} target="_blank" className="p-2 text-gray-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="Print A4 Invoice">
                        <FileText className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleOpenReturn(invoice)} disabled={invoice.status === 'Returned'} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50" title="Process Return">
                        <Undo2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Process Return Modal */}
      {returnModalOpen && selectedInvoice && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-2">Process Return / Refund</h3>
            <p className="text-sm text-gray-500 mb-6">Invoice: {selectedInvoice.invoiceNumber}</p>
            
            <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Item</th>
                    <th className="px-4 py-3 font-medium text-center">Purchased Qty</th>
                    <th className="px-4 py-3 font-medium text-right">Price</th>
                    <th className="px-4 py-3 font-medium text-center">Return Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.productId?.name || item.name || 'Unknown'}</td>
                      <td className="px-4 py-3 text-center">{item.quantity}</td>
                      <td className="px-4 py-3 text-right">₹{(item.price || item.unitPrice || 0).toFixed(2)}</td>
                      <td className="px-4 py-3 text-center">
                        <input 
                          type="number" 
                          min="0" 
                          max={item.quantity} 
                          value={returnItems[idx] || ''}
                          onChange={(e) => handleReturnItemChange(idx, e.target.value, item.quantity)}
                          placeholder="0"
                          className="w-16 p-1.5 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-orange-50 text-orange-800 p-4 rounded-lg text-sm mb-6">
              <strong>Note:</strong> Processing a return will automatically add the returned quantities back to the stock inventory. If the original invoice had pending Udhaar, it will be automatically deducted.
            </div>

            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setReturnModalOpen(false)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium text-sm">Cancel</button>
              <button onClick={handleProcessReturn} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm flex items-center gap-2">
                <Undo2 className="w-4 h-4" /> Confirm Return
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
