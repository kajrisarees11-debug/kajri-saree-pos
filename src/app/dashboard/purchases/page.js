'use client';
import { useState, useEffect, useRef } from 'react';
import { Plus, Search, Trash2, WifiOff } from 'lucide-react';
import { useData } from '@/context/DataContext';

export default function PurchasesPage() {
  const { purchases, suppliers, products, loading, isOnline, refresh } = useData();


  // Form states
  const [showNewPurchase, setShowNewPurchase] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('Paid');
  const [items, setItems] = useState([]);
  
  // Product Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const searchTimeoutRef = useRef(null);

  // Local Product Search
  useEffect(() => {
    if (!searchQuery) {
      setTimeout(() => setSearchResults([]), 0);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = products.filter(p => 
      p.name?.toLowerCase().includes(q) || 
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.includes(q)
    ).slice(0, 10);
    setTimeout(() => setSearchResults(results), 0);
  }, [searchQuery, products]);

  const addItemToPurchase = (product) => {
    const exists = items.find(i => i.productId === product._id);
    if (exists) {
      setItems(items.map(i => i.productId === product._id ? { ...i, quantity: i.quantity + 1 } : i));
    } else {
      setItems([...items, {
        productId: product._id,
        name: product.name,
        quantity: 1,
        purchasePrice: product.purchasePrice || 0,
        tax: product.taxRate || 0
      }]);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = Number(value);
    setItems(newItems);
  };

  const removeItem = (index) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const subTotal = items.reduce((sum, item) => sum + (item.purchasePrice * item.quantity), 0);
  const taxTotal = items.reduce((sum, item) => sum + (((item.purchasePrice * item.tax) / 100) * item.quantity), 0);
  const grandTotal = subTotal + taxTotal;

  const handleSavePurchase = async () => {
    if (!isOnline) {
      alert("Purchases can only be recorded when online. Please reconnect.");
      return;
    }
    if (!supplierId || !invoiceNumber || items.length === 0) {
      alert("Please fill supplier, invoice number, and add at least one item.");
      return;
    }

    const payload = {
      supplierId,
      invoiceNumber,
      date,
      items: items.map(i => ({
        productId: i.productId,
        quantity: i.quantity,
        purchasePrice: i.purchasePrice,
        tax: i.tax,
        total: (i.purchasePrice * i.quantity) + (((i.purchasePrice * i.tax) / 100) * i.quantity)
      })),
      totalAmount: grandTotal,
      status
    };

    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        alert("Purchase saved successfully. Stock updated!");
        setShowNewPurchase(false);
        setSupplierId('');
        setInvoiceNumber('');
        setItems([]);
        refresh('purchases');
        refresh('products'); // Refresh products since stock changed
      } else {
        alert("Failed to save: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Error saving purchase");
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {!isOnline && (
        <div className="mb-4 flex items-center gap-2 bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2.5 rounded-lg text-sm font-medium">
          <WifiOff className="w-4 h-4" /> Offline mode — viewing only. Stock inward requires internet.
        </div>
      )}
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Purchases & Stock Inward</h1>
          <p className="text-gray-500 text-sm mt-1">Record supplier invoices to automatically increase inventory.</p>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowNewPurchase(!showNewPurchase)}
            className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary-light transition-colors text-sm font-medium"
          >
            {showNewPurchase ? 'Back to List' : <><Plus className="w-4 h-4" /> New Stock Entry</>}
          </button>
        </div>
      </div>

      {showNewPurchase ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-bold mb-6">Create Purchase Entry</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
              <select 
                value={supplierId} onChange={(e) => setSupplierId(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              >
                <option value="">Select Supplier</option>
                {suppliers.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Number</label>
              <input 
                type="text" 
                value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)}
                placeholder="e.g. INV-1234" 
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input 
                type="date" 
                value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Status</label>
              <select 
                value={status} onChange={(e) => setStatus(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none"
              >
                <option value="Paid">Paid (Cash/Bank)</option>
                <option value="Pending">Pending (Credit)</option>
              </select>
            </div>
          </div>

          <div className="mb-4 relative">
            <label className="block text-sm font-bold text-gray-700 mb-1">Search Products to Add</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name, SKU, barcode..." 
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary outline-none" 
              />
            </div>
            {searchResults.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {searchResults.map(p => (
                  <div 
                    key={p._id} 
                    onClick={() => addItemToPurchase(p)}
                    className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                  >
                    <div>
                      <div className="font-medium text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-500">SKU: {p.sku} | Stock: {p.stock}</div>
                    </div>
                    <div className="text-sm font-bold text-gray-700">₹{p.purchasePrice || 0}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <table className="w-full text-left border-collapse">
              <thead className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-medium w-1/3">Product Name</th>
                  <th className="px-4 py-3 font-medium">Qty</th>
                  <th className="px-4 py-3 font-medium">Purchase Price (₹)</th>
                  <th className="px-4 py-3 font-medium">Tax (%)</th>
                  <th className="px-4 py-3 font-medium">Total (₹)</th>
                  <th className="px-4 py-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-4 py-8 text-center text-gray-500">No items added yet. Search above to add products.</td>
                  </tr>
                ) : (
                  items.map((item, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                      <td className="px-4 py-3">
                        <input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(idx, 'quantity', e.target.value)} className="w-20 p-1.5 border border-gray-300 rounded focus:border-primary outline-none" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min="0" step="0.01" value={item.purchasePrice} onChange={(e) => updateItem(idx, 'purchasePrice', e.target.value)} className="w-24 p-1.5 border border-gray-300 rounded focus:border-primary outline-none" />
                      </td>
                      <td className="px-4 py-3">
                        <input type="number" min="0" max="100" value={item.tax} onChange={(e) => updateItem(idx, 'tax', e.target.value)} className="w-20 p-1.5 border border-gray-300 rounded focus:border-primary outline-none" />
                      </td>
                      <td className="px-4 py-3 font-bold text-gray-900">
                        {((item.purchasePrice * item.quantity) + (((item.purchasePrice * item.tax) / 100) * item.quantity)).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => removeItem(idx)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-5 h-5 ml-auto" /></button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {items.length > 0 && (
            <div className="flex justify-end mb-6">
              <div className="w-64 bg-gray-50 p-4 rounded-lg border border-gray-200">
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-gray-600">Subtotal:</span>
                  <span className="font-medium">₹ {subTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between mb-2 text-sm">
                  <span className="text-gray-600">Tax Total:</span>
                  <span className="font-medium">₹ {taxTotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-gray-200 text-lg font-bold">
                  <span>Grand Total:</span>
                  <span>₹ {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 border-t pt-4">
            <button onClick={() => setShowNewPurchase(false)} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
            <button onClick={handleSavePurchase} disabled={items.length === 0} className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light font-medium disabled:opacity-50">Save & Update Stock</button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by invoice or supplier..."
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
                  <th className="px-6 py-4 font-medium">Supplier</th>
                  <th className="px-6 py-4 font-medium text-right">Items</th>
                  <th className="px-6 py-4 font-medium text-right">Total Amount</th>
                  <th className="px-6 py-4 font-medium text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">Loading purchases...</td>
                  </tr>
                ) : purchases.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-10 text-center text-gray-500">No purchases found.</td>
                  </tr>
                ) : purchases.map((purchase) => (
                  <tr key={purchase._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 text-sm">{new Date(purchase.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 font-medium text-primary">{purchase.invoiceNumber}</td>
                    <td className="px-6 py-4 text-sm">{purchase.supplierId?.name || 'Unknown'}</td>
                    <td className="px-6 py-4 text-sm text-right">{purchase.items?.length || 0}</td>
                    <td className="px-6 py-4 font-medium text-right">₹{purchase.totalAmount.toLocaleString()}</td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        purchase.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {purchase.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
