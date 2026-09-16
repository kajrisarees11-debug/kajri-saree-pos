'use client';
import { useState, useEffect, useRef } from 'react';
import { Printer, RefreshCcw, Search, X, CheckSquare, Square, Sliders, Copy } from 'lucide-react';
import { useData } from '@/context/DataContext';

export default function BarcodePage() {
  // Sourced from the shared DataContext (not its own independent fetch) so a
  // barcode change made here is immediately visible on Products/POS without
  // needing a full page reload, and vice versa.
  const { products: sharedProducts, loading, refresh } = useData();
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');

  // Print modal state
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [labelQuantities, setLabelQuantities] = useState({}); // { productId: qty }
  const [labelSize, setLabelSize] = useState('standard'); // 'standard' (50x25mm), 'compact' (38x25mm), 'a4' (sheet)

  // Overlay local-only UI state (`selected`) onto the shared product list,
  // re-syncing whenever it changes (e.g. after refresh('products')).
  useEffect(() => {
    setProducts(prev => sharedProducts.map(p => {
      const existing = prev.find(x => x._id === p._id);
      return { ...p, selected: existing?.selected || false };
    }));
    setLabelQuantities(prev => {
      const next = { ...prev };
      sharedProducts.forEach(p => { if (!(p._id in next)) next[p._id] = 1; });
      return next;
    });
  }, [sharedProducts]);

  const toggleSelect = (id) => {
    setProducts(products.map(p => p._id === id ? { ...p, selected: !p.selected } : p));
  };

  const toggleAll = (e) => {
    const isChecked = e.target.checked;
    setProducts(products.map(p => ({ ...p, selected: isChecked })));
  };

  const generateMissingBarcodes = async () => {
    const updatedProducts = products.map(p => {
      if (!p.barcode) {
        const generated = '890' + Math.floor(1000000000 + Math.random() * 9000000000).toString();
        return { ...p, barcode: generated, isModified: true };
      }
      return p;
    });

    const modified = updatedProducts.filter(p => p.isModified);
    if (modified.length === 0) {
      alert("All products already have barcodes!");
      return;
    }

    // Don't apply the generated barcodes to local state until the server
    // has actually confirmed the write — otherwise a failed/rejected save
    // still leaves the UI (and anything printed from it) showing barcodes
    // that were never persisted.
    try {
      const res = await fetch('/api/products', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(modified)
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server rejected the update (status ${res.status})`);
      }
      setProducts(updatedProducts);
      await refresh('products'); // so Products/POS/etc. pick up the new barcodes immediately
      alert(`Generated barcodes for ${modified.length} products!`);
    } catch (err) {
      console.error("Failed to save barcodes:", err);
      alert(`Failed to generate barcodes: ${err.message}`);
    }
  };

  const handleOpenPrint = (singleProduct = null) => {
    if (singleProduct) {
      setProducts(prev => prev.map(p => ({ ...p, selected: p._id === singleProduct._id })));
    }
    const selected = singleProduct ? [singleProduct] : products.filter(p => p.selected);
    if (selected.length === 0) {
      alert("Please select at least one product to print barcodes.");
      return;
    }
    setIsPrintModalOpen(true);
  };

  const handlePrintNow = () => {
    window.print();
  };

  const handleQtyChange = (productId, val) => {
    const qty = Math.max(1, parseInt(val) || 1);
    setLabelQuantities(prev => ({ ...prev, [productId]: qty }));
  };

  const selectedProducts = products.filter(p => p.selected);

  // Generate flat array of labels to render based on quantity
  const labelsToPrint = [];
  selectedProducts.forEach(p => {
    const qty = labelQuantities[p._id] || 1;
    for (let i = 0; i < qty; i++) {
      labelsToPrint.push({ ...p, labelIndex: i });
    }
  });

  const filteredProducts = products.filter(p => 
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.sku?.toLowerCase().includes(search.toLowerCase()) ||
    p.barcode?.includes(search)
  );

  return (
    <div className="max-w-6xl mx-auto">
      
      {/* Non-Print Page UI */}
      <div className="print:hidden">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Barcode Management & Label Printing</h1>
            <p className="text-gray-500 text-sm mt-1">Generate barcodes and print professional adhesive price stickers.</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={generateMissingBarcodes} 
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg hover:bg-gray-50 transition-colors text-sm font-medium shadow-sm"
            >
              <RefreshCcw className="w-4 h-4" /> Auto-Generate Missing
            </button>
            <button 
              onClick={() => handleOpenPrint()} 
              disabled={selectedProducts.length === 0}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-primary-light transition-colors text-sm font-bold shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4" /> Print Selected Labels ({selectedProducts.length})
            </button>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between gap-4">
            <div className="relative w-full max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search by product name, SKU, or barcode..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary text-sm"
              />
            </div>
            <div className="text-xs text-gray-500 font-medium">
              Showing {filteredProducts.length} products • {selectedProducts.length} selected
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-4 w-12 text-center">
                    <input 
                      type="checkbox" 
                      onChange={toggleAll} 
                      checked={products.length > 0 && products.every(p => p.selected)}
                      className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" 
                    />
                  </th>
                  <th className="px-6 py-4 font-medium">Product Details</th>
                  <th className="px-6 py-4 font-medium">SKU</th>
                  <th className="px-6 py-4 font-medium">Barcode</th>
                  <th className="px-6 py-4 font-medium text-center">Label Preview</th>
                  <th className="px-6 py-4 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">Loading products...</td>
                  </tr>
                ) : filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">No products found.</td>
                  </tr>
                ) : (
                  filteredProducts.map((product) => (
                    <tr key={product._id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-4 text-center">
                        <input 
                          type="checkbox" 
                          checked={!!product.selected}
                          onChange={() => toggleSelect(product._id)}
                          className="rounded border-gray-300 text-primary focus:ring-primary w-4 h-4 cursor-pointer" 
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-gray-900">{product.name}</div>
                        <div className="text-xs text-gray-500">Price: ₹{(product.price || 0).toLocaleString()} • Stock: {product.stock || 0}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-mono text-gray-700">
                        {product.sku}
                      </td>
                      <td className="px-6 py-4">
                        {product.barcode ? (
                          <span className="inline-flex font-mono text-xs bg-gray-100 px-2.5 py-1 rounded border border-gray-200 font-bold text-gray-800">
                            {product.barcode}
                          </span>
                        ) : (
                          <span className="text-xs bg-orange-50 text-orange-600 font-bold px-2 py-1 rounded border border-orange-200">
                            Missing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        {product.barcode ? (
                          <div className="inline-block border border-gray-300 rounded p-1.5 text-center text-[10px] w-36 bg-white shadow-2xs font-sans">
                            <div className="font-bold text-[9px] uppercase tracking-wider text-gray-900 truncate">KAJRI SAREES</div>
                            <div className="truncate text-gray-700 font-medium text-[9px]">{product.name}</div>
                            {/* Barcode Visual Bars */}
                            <div className="h-5 my-1 flex items-center justify-center gap-[1.5px] px-1 overflow-hidden bg-white">
                              {product.barcode.split('').map((char, i) => (
                                <span 
                                  key={i} 
                                  className="bg-black inline-block h-full" 
                                  style={{ width: `${(parseInt(char, 10) % 3) + 1}px` }} 
                                />
                              ))}
                            </div>
                            <div className="font-mono text-[9px] tracking-widest text-gray-800">{product.barcode}</div>
                            <div className="font-bold text-[10px] text-gray-900 mt-0.5">MRP: ₹{(product.price || 0).toLocaleString()}</div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">Generate barcode first</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => handleOpenPrint(product)}
                          disabled={!product.barcode}
                          className="inline-flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <Printer className="w-3.5 h-3.5" /> Print Label
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ─── PRINT PREVIEW MODAL & PRINT STYLES ─── */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs print:p-0 print:static print:bg-transparent">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print:max-w-none print:w-full print:max-h-none print:shadow-none print:rounded-none">
            
            {/* Modal Header (Hidden during browser print) */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50 print:hidden">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Barcode Label Print Preview</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ready to print {labelsToPrint.length} sticker {labelsToPrint.length === 1 ? 'label' : 'labels'} for {selectedProducts.length} {selectedProducts.length === 1 ? 'item' : 'items'}.
                </p>
              </div>
              <button onClick={() => setIsPrintModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-2 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Print Settings Toolbar (Hidden during print) */}
            <div className="p-4 border-b border-gray-200 bg-white flex flex-wrap items-center justify-between gap-4 print:hidden">
              <div className="flex items-center gap-4">
                <span className="text-xs font-bold text-gray-700 uppercase">Label Format:</span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setLabelSize('standard')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${labelSize === 'standard' ? 'bg-primary text-white border-primary' : 'bg-gray-100 text-gray-700 border-gray-200'}`}
                  >
                    Thermal 50x25mm
                  </button>
                  <button 
                    onClick={() => setLabelSize('compact')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${labelSize === 'compact' ? 'bg-primary text-white border-primary' : 'bg-gray-100 text-gray-700 border-gray-200'}`}
                  >
                    Compact 38x25mm
                  </button>
                  <button 
                    onClick={() => setLabelSize('a4')}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${labelSize === 'a4' ? 'bg-primary text-white border-primary' : 'bg-gray-100 text-gray-700 border-gray-200'}`}
                  >
                    A4 Sheet Grid (24-up)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button 
                  onClick={handlePrintNow}
                  className="flex items-center gap-2 bg-primary hover:bg-primary-light text-white text-sm font-bold px-6 py-2 rounded-lg shadow-md transition-colors"
                >
                  <Printer className="w-4 h-4" /> Send to Printer Now
                </button>
              </div>
            </div>

            {/* Label Quantity Config list (Hidden during print) */}
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center gap-4 text-xs print:hidden">
              <span className="font-bold text-gray-600">Quantities per item:</span>
              {selectedProducts.map(p => (
                <div key={p._id} className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-gray-200">
                  <span className="font-medium text-gray-800 truncate max-w-[120px]">{p.name}:</span>
                  <input 
                    type="number" 
                    min="1" 
                    max="100" 
                    value={labelQuantities[p._id] || 1}
                    onChange={(e) => handleQtyChange(p._id, e.target.value)}
                    className="w-12 text-center font-bold text-primary border border-gray-300 rounded px-1 py-0.5 outline-none"
                  />
                  <span className="text-gray-400 text-[10px]">pcs</span>
                </div>
              ))}
            </div>

            {/* ─── ACTUAL PRINTABLE STICKERS CANVAS ─── */}
            <div className="flex-1 overflow-y-auto p-6 bg-gray-200/60 print:bg-white print:p-0 print:m-0 print:overflow-visible">
              <div 
                className={`mx-auto bg-white p-4 print:p-0 transition-all ${
                  labelSize === 'a4' 
                    ? 'w-[210mm] min-h-[297mm] grid grid-cols-3 gap-3 p-8 border border-gray-300 print:w-full print:border-none print:shadow-none' 
                    : 'flex flex-wrap justify-center gap-3'
                }`}
              >
                {labelsToPrint.map((item, idx) => (
                  <div
                    key={`${item._id}-${idx}`}
                    className={`bg-white border border-gray-400 p-2 text-center flex flex-col justify-between rounded-sm shadow-xs print:shadow-none print:border-black ${
                      labelSize === 'compact' ? 'w-[38mm] h-[25mm] p-1' : 'w-[50mm] h-[30mm]'
                    }`}
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                  >
                    {/* Store Title */}
                    <div className="font-black text-[10px] uppercase tracking-wider text-gray-900 border-b border-gray-200 pb-0.5">
                      KAJRI SAREES
                    </div>

                    {/* Saree Name & SKU */}
                    <div className="my-0.5 leading-tight">
                      <p className="font-bold text-[9px] text-gray-800 truncate">{item.name}</p>
                      <p className="text-[8px] font-mono text-gray-600">SKU: {item.sku}</p>
                    </div>

                    {/* Barcode Graphic Lines */}
                    <div className="h-6 flex items-center justify-center gap-[1.5px] px-1 bg-white overflow-hidden">
                      {(item.barcode || '8900000000000').split('').map((char, i) => (
                        <span
                          key={i}
                          className="bg-black inline-block h-full"
                          style={{
                            width: `${((parseInt(char, 10) || 1) % 3) + 1.2}px`,
                          }}
                        />
                      ))}
                    </div>

                    {/* Barcode Number & MRP */}
                    <div className="flex items-center justify-between text-[9px] font-mono font-bold text-gray-900 pt-0.5 border-t border-gray-200">
                      <span className="tracking-wider">{item.barcode}</span>
                      <span className="font-sans font-black text-[10px]">₹{(item.price || 0).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Modal Footer (Hidden during print) */}
            <div className="p-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between print:hidden">
              <span className="text-xs text-gray-500">
                Tip: In browser print dialog, select &quot;Layout: Portrait&quot; and set &quot;Margins: None / Minimum&quot;.
              </span>
              <div className="flex gap-2">
                <button 
                  onClick={() => setIsPrintModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 text-xs font-bold"
                >
                  Close
                </button>
                <button 
                  onClick={handlePrintNow}
                  className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary-light text-xs font-bold flex items-center gap-2 shadow"
                >
                  <Printer className="w-3.5 h-3.5" /> Print Labels ({labelsToPrint.length})
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
