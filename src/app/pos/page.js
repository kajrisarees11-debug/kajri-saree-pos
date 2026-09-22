'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Search, Plus, Minus, Trash2, UserPlus, CreditCard, Banknote, 
  History, Printer, WifiOff, X, Package, Check, Phone, User
} from 'lucide-react';
import { useNetworkStatus } from '@/context/NetworkStatusContext';
import {
  cacheProducts,
  cacheCustomers,
  getCachedProductByBarcode,
  searchCachedProducts,
  getCachedProducts,
  getCachedCustomers,
  saveOfflineInvoice,
} from '@/lib/offlineSync';

// A short id persisted per browser/device, used only to keep offline-generated
// invoice numbers from colliding across terminals (or after a clock change).
function getDeviceId() {
  if (typeof window === 'undefined') return 'srv';
  try {
    let id = localStorage.getItem('kajri_pos_device_id');
    if (!id) {
      id = Math.random().toString(36).slice(2, 8);
      localStorage.setItem('kajri_pos_device_id', id);
    }
    return id;
  } catch {
    return 'nols';
  }
}

function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

export default function POSPage() {
  const [cart, setCart] = useState([]);
  const [barcodeInput, setBarcodeInput] = useState('');
  const [customer, setCustomer] = useState(null);
  const [discount, setDiscount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [offlineSaved, setOfflineSaved] = useState(false);
  // Set when window.open() for the receipt tab was blocked — most likely
  // because it fired well after the click that started checkout (e.g. the
  // offline-fallback path only reaches this point after a 10s timeout, long
  // past any browser's popup-blocker exemption window). The sale itself is
  // always safely saved either way; this only affects whether a receipt
  // actually opened, so it needs a visible, persistent way to retry rather
  // than silently vanishing.
  const [blockedReceiptUrl, setBlockedReceiptUrl] = useState(null);

  // Live search state
  const [searchResults, setSearchResults] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);

  // Browse modal state
  const [isBrowseOpen, setIsBrowseOpen] = useState(false);
  const [allProducts, setAllProducts] = useState([]);
  const [browseSearch, setBrowseSearch] = useState('');
  const [loadingBrowse, setLoadingBrowse] = useState(false);

  // Customer modal state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [customerList, setCustomerList] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerMobile, setNewCustomerMobile] = useState('');
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);

  const { isOnline, refreshPendingCount } = useNetworkStatus();
  const barcodeInputRef = useRef(null);
  const searchDropdownRef = useRef(null);

  // Keep focus on barcode input unless inside another input
  useEffect(() => {
    barcodeInputRef.current?.focus();
    const handleGlobalClick = (e) => {
      if (
        document.activeElement.tagName !== 'INPUT' && 
        document.activeElement.tagName !== 'TEXTAREA' &&
        !isBrowseOpen &&
        !isCustomerModalOpen
      ) {
        barcodeInputRef.current?.focus();
      }
    };
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, [isBrowseOpen, isCustomerModalOpen]);

  // Pre-cache products & customers
  const loadAndCacheData = useCallback(async () => {
    try {
      if (isOnline) {
        const [prodRes, custRes] = await Promise.all([
          fetch('/api/products'),
          fetch('/api/customers')
        ]);
        const [prodData, custData] = await Promise.all([prodRes.json(), custRes.json()]);
        if (prodData.success) {
          await cacheProducts(prodData.data);
          setAllProducts(prodData.data);
        }
        if (custData.success) {
          await cacheCustomers(custData.data);
          setCustomerList(custData.data);
        }
      } else {
        const [cachedProds, cachedCusts] = await Promise.all([
          getCachedProducts(),
          getCachedCustomers()
        ]);
        setAllProducts(cachedProds);
        setCustomerList(cachedCusts);
      }
    } catch (err) {
      console.warn('[POS] Could not pre-cache data:', err);
    }
  }, [isOnline]);

  useEffect(() => {
    const t = setTimeout(() => loadAndCacheData(), 0);
    return () => clearTimeout(t);
  }, [loadAndCacheData]);

  // Debounced search suggestions as user types
  useEffect(() => {
    const term = barcodeInput.trim();
    if (!term) {
      setTimeout(() => {
        setSearchResults([]);
        setSelectedIndex(-1);
      }, 0);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        if (!isOnline) {
          const results = await searchCachedProducts(term);
          setSearchResults(results.slice(0, 8));
        } else {
          const res = await fetch(`/api/products?search=${encodeURIComponent(term)}`);
          const data = await res.json();
          if (data.success) {
            setSearchResults(data.data.slice(0, 8));
          } else {
            setSearchResults([]);
          }
        }
      } catch (err) {
        console.error('Search error:', err);
        const cached = await searchCachedProducts(term);
        setSearchResults(cached.slice(0, 8));
      } finally {
        setIsSearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [barcodeInput, isOnline]);

  const addToCart = (product) => {
    if (!product) return;
    const cleanProduct = {
      ...product,
      price: product.price || 0,
      taxRate: product.taxRate || 0,
      mrp: product.mrp || product.price || 0
    };

    setCart(prev => {
      const existing = prev.find(item => item._id === cleanProduct._id);
      if (existing) {
        return prev.map(item => 
          item._id === cleanProduct._id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [{ ...cleanProduct, quantity: 1, itemDiscount: 0 }, ...prev];
    });

    setBarcodeInput('');
    setSearchResults([]);
    setSelectedIndex(-1);
    barcodeInputRef.current?.focus();
  };

  // Keyboard navigation for search dropdown
  const handleKeyDown = (e) => {
    if (searchResults.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev < searchResults.length - 1 ? prev + 1 : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : searchResults.length - 1));
        return;
      }
      if (e.key === 'Escape') {
        setSearchResults([]);
        setSelectedIndex(-1);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && searchResults[selectedIndex]) {
        addToCart(searchResults[selectedIndex]);
      } else {
        handleDirectBarcodeSubmit();
      }
    }
  };

  // Direct barcode submit (scanner punch)
  const handleDirectBarcodeSubmit = async () => {
    const code = barcodeInput.trim();
    if (!code) return;

    let product = null;

    // Both branches require an EXACT barcode/SKU match here — the backing
    // search is a case-insensitive SUBSTRING match, so a scanned code that's
    // damaged/mistyped or genuinely unregistered but happens to be a
    // substring of some OTHER product's SKU/name must be reported as "not
    // found", not silently add that unrelated product to the cart at its
    // own price with no warning.
    const exactMatch = (list) => list.find(p => p.barcode === code || p.sku?.toLowerCase() === code.toLowerCase()) || null;

    if (!isOnline) {
      product = await getCachedProductByBarcode(code);
      if (!product) {
        const results = await searchCachedProducts(code);
        product = exactMatch(results);
      }
    } else {
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(code)}`);
        const data = await res.json();
        if (data.success && data.data.length > 0) {
          product = exactMatch(data.data);
        }
      } catch {
        product = await getCachedProductByBarcode(code);
      }
    }

    if (product) {
      addToCart(product);
    } else {
      alert(`Product with barcode/SKU "${code}" not found!`);
      setBarcodeInput('');
    }
  };

  const updateQuantity = (id, change) => {
    setCart(prev => prev.map(item => {
      if (item._id === id) {
        const newQty = Math.max(1, item.quantity + change);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const removeItem = (id) => {
    setCart(prev => prev.filter(item => item._id !== id));
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0);
  const taxTotal = cart.reduce((sum, item) => sum + ((((item.price || 0) * (item.taxRate || 0)) / 100) * item.quantity), 0);
  const grandTotal = Math.max(0, subtotal + taxTotal - Number(discount || 0));
  const balance = amountPaid ? Number(amountPaid) - grandTotal : 0;

  // Checkout execution
  // window.open() only bypasses the popup blocker within a short window
  // after a user gesture. That's fine right after the click that starts
  // checkout, but the offline-fallback path only calls this once a 10s
  // AbortController timeout has already elapsed — well past that window on
  // most browsers, so the call silently returns null with no receipt tab
  // and no error to catch. Surface a visible retry instead of losing that.
  const openReceipt = (url) => {
    const win = window.open(url, '_blank');
    if (!win) setBlockedReceiptUrl(url);
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsCheckingOut(true);

    // One idempotency key per checkout attempt, reused for BOTH the online
    // POST and (if that fails) the offline-queued copy of the same sale. If
    // the online request actually succeeded server-side but the response
    // was lost before we saw it, the server recognizes this key on the
    // later offline-sync retry and returns the original invoice instead of
    // creating a second, fully-processed duplicate sale.
    const idempotencyKey = generateIdempotencyKey();

    const invoicePayload = {
      idempotencyKey,
      customerId: customer?._id || null,
      items: cart.map(item => ({
        productId: item._id,
        name: item.name,
        quantity: item.quantity,
        price: item.price || 0,
        mrp: item.mrp || item.price || 0,
        tax: item.taxRate || 0,
        total: (item.price || 0) * item.quantity
      })),
      subTotal: subtotal,
      taxTotal: taxTotal,
      discountTotal: Number(discount || 0),
      grandTotal: grandTotal,
      paymentMethod: paymentMethod,
      amountPaid: amountPaid ? Number(amountPaid) : grandTotal,
      balance: Math.max(0, balance)
      // invoiceNumber intentionally omitted — the server assigns one. The
      // client used to generate its own (`INV-${Date.now()}`), which could
      // collide across terminals or after a clock adjustment.
    };

    // Saves the sale to the local offline queue and resets the cart/UI.
    // Shared by the "already known offline" path and the "online attempt
    // failed or timed out" path below, so both end up in the same place.
    const fallBackToOffline = async () => {
      // A device-unique, collision-resistant invoice number for the offline
      // queue/receipt (the server still assigns the real one once this syncs).
      // eslint-disable-next-line react-hooks/purity -- runs inside an event handler, not render
      const offlineInvoiceNumber = `OFF-${getDeviceId()}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const offlinePayload = { ...invoicePayload, invoiceNumber: offlineInvoiceNumber };

      try {
        await saveOfflineInvoice(offlinePayload);
      } catch (queueErr) {
        // The sale isn't on the server AND couldn't be queued locally — it
        // would otherwise vanish with no trace anywhere but the console.
        console.error('[POS] CRITICAL: failed to save sale both online and offline:', queueErr);
        alert('CRITICAL: This sale could not be saved online OR offline. Please write down the items and amount manually, then contact support. Do not hand over goods until this is resolved.');
        return;
      }

      alert('Network error — Bill saved offline to local queue.');
      await refreshPendingCount();
      setOfflineSaved(true);
      setTimeout(() => setOfflineSaved(false), 4000);

      // Print a receipt now from the local data — there's no server _id yet
      // to fetch by, so stash the full (name-enriched) invoice for the
      // receipt tab to read directly instead of never printing one at all.
      try {
        sessionStorage.setItem('kajri_offline_receipt', JSON.stringify({
          ...offlinePayload,
          createdAt: new Date().toISOString(),
        }));
        openReceipt('/pos/receipt?offline=1');
      } catch (storageErr) {
        console.error('[POS] Could not open offline receipt:', storageErr);
      }

      setCart([]);
      setCustomer(null);
      setDiscount(0);
      setAmountPaid('');
      setPaymentMethod('Cash');
      barcodeInputRef.current?.focus();
    };

    try {
      // Already known to be offline (e.g. the OFFLINE MODE banner is up) —
      // go straight to the local queue instead of firing a request that can
      // only time out.
      if (!isOnline) {
        await fallBackToOffline();
        return;
      }

      // A hard timeout guards against a request that neither succeeds nor
      // fails outright — a blackholed connection, or Chrome DevTools'
      // "offline" simulation, stalls fetch() forever instead of rejecting it
      // the way a real dropped connection usually does, which otherwise left
      // checkout stuck on "Saving..." with the sale recorded nowhere.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      let res;
      try {
        res = await fetch('/api/invoices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(invoicePayload),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      const data = await res.json();

      if (data.success) {
        setCart([]);
        setCustomer(null);
        setDiscount(0);
        setAmountPaid('');
        setPaymentMethod('Cash');
        barcodeInputRef.current?.focus();
        openReceipt(`/pos/receipt?id=${data.data._id}`);
      } else {
        alert(`Checkout Failed: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      await fallBackToOffline();
    } finally {
      setIsCheckingOut(false);
    }
  };

  // Handle new customer creation
  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    if (!newCustomerName || !newCustomerMobile) return;

    try {
      const res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCustomerName, mobileNumber: newCustomerMobile })
      });
      const data = await res.json();
      if (data.success) {
        setCustomer(data.data);
        setIsCustomerModalOpen(false);
        setNewCustomerName('');
        setNewCustomerMobile('');
        loadAndCacheData();
      } else {
        alert(`Failed to add customer: ${data.error}`);
      }
    } catch (err) {
      console.error(err);
      alert('Error creating customer');
    }
  };

  // Filtered browse list
  const filteredBrowseProducts = allProducts.filter(p => 
    p.name?.toLowerCase().includes(browseSearch.toLowerCase()) ||
    p.sku?.toLowerCase().includes(browseSearch.toLowerCase()) ||
    p.barcode?.includes(browseSearch) ||
    p.fabric?.toLowerCase().includes(browseSearch.toLowerCase())
  );

  // Filtered customer list
  const filteredCustomerList = customerList.filter(c =>
    c.name?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.mobileNumber?.includes(customerSearch)
  );

  return (
    <div className="flex-1 flex flex-col md:flex-row w-full h-full relative">
      
      {/* Offline saved toast */}
      {offlineSaved && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-orange-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-2 animate-bounce">
          <WifiOff className="w-5 h-5" /> Bill saved offline! Will auto-sync when internet reconnects.
        </div>
      )}

      {/* Receipt popup was blocked — stays up until manually dismissed/opened,
          since a customer could otherwise walk away with no receipt printed
          and nobody would notice. Clicking this button is itself a fresh user
          gesture, so window.open() here is not blocked. */}
      {blockedReceiptUrl && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl text-sm font-bold flex items-center gap-3">
          <Printer className="w-5 h-5 shrink-0" />
          <span>The sale was saved, but the receipt tab was blocked by the browser.</span>
          <button
            type="button"
            onClick={() => { window.open(blockedReceiptUrl, '_blank'); setBlockedReceiptUrl(null); }}
            className="bg-white text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
          >
            Open Receipt
          </button>
          <button type="button" onClick={() => setBlockedReceiptUrl(null)} className="text-white/80 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Left Area: Product Search & Cart */}
      <div className="flex-1 flex flex-col bg-white border-r border-gray-200">
        
        {/* Search Bar with Live Suggestions Dropdown */}
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-3 relative z-30">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              ref={barcodeInputRef}
              type="text" 
              value={barcodeInput}
              onChange={(e) => {
                // Reset synchronously on every keystroke, not just once the
                // debounced search effect replaces searchResults 150ms
                // later — a barcode scanner types+Enters well under that
                // delay, so without this, an Enter arriving before the
                // debounce fires would still see a PRIOR dropdown
                // selection (from earlier arrow-key browsing) and add that
                // stale, unrelated product to the cart instead of the
                // barcode actually just scanned.
                setSelectedIndex(-1);
                setBarcodeInput(e.target.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Scan Barcode or Type Saree Name / SKU (e.g. Silk, BSS-001)..." 
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-primary shadow-sm bg-white"
              autoComplete="off"
            />

            {/* Live Search Suggestions Dropdown */}
            {searchResults.length > 0 && (
              <div 
                ref={searchDropdownRef}
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-80 overflow-y-auto z-50 divide-y divide-gray-100"
              >
                <div className="px-3 py-1.5 bg-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider flex justify-between">
                  <span>Search Suggestions (Use ↑ ↓ and Enter)</span>
                  <span>{searchResults.length} found</span>
                </div>
                {searchResults.map((product, idx) => (
                  <div
                    key={product._id}
                    onClick={() => addToCart(product)}
                    className={`px-4 py-3 flex items-center justify-between cursor-pointer transition-colors ${
                      idx === selectedIndex ? 'bg-primary/10 text-primary' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-500 font-bold shrink-0">
                        {product.coverImage ? (
                          <img src={product.coverImage} alt="" className="w-full h-full object-cover rounded-lg" />
                        ) : (
                          <Package className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-900 leading-tight">{product.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">
                          SKU: {product.sku} {product.barcode ? `| Barcode: ${product.barcode}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm text-gray-900">₹{(product.price || 0).toLocaleString()}</p>
                      <p className={`text-[11px] font-medium ${product.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button 
            onClick={() => {
              setIsBrowseOpen(true);
              if (allProducts.length === 0) loadAndCacheData();
            }}
            className="bg-primary hover:bg-primary-light text-white px-5 py-3 rounded-lg font-bold text-sm transition-colors flex items-center gap-2 shadow-sm shrink-0"
          >
            <Package className="w-4 h-4" /> Browse Catalog
          </button>
        </div>

        {/* Cart Headers */}
        <div className="grid grid-cols-12 gap-2 px-6 py-3 bg-gray-100 border-b border-gray-200 text-xs font-bold text-gray-600 uppercase tracking-wider">
          <div className="col-span-5">Item</div>
          <div className="col-span-2 text-center">Price</div>
          <div className="col-span-2 text-center">Qty</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1"></div>
        </div>

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto bg-white">
          {cart.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 p-8">
              <History className="w-16 h-16 mb-4 text-gray-200" />
              <p className="text-lg font-bold text-gray-700">Cart is empty</p>
              <p className="text-sm text-gray-500 mt-1 text-center">
                Scan a barcode, type in the search bar, or click &quot;Browse Catalog&quot; to add sarees.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {cart.map((item) => (
                <div key={item._id} className="grid grid-cols-12 gap-2 px-6 py-4 items-center hover:bg-orange-50/30 transition-colors">
                  <div className="col-span-5">
                    <div className="font-bold text-gray-900 leading-tight">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-1 font-mono">{item.sku}</div>
                    {/* Stock-exhausted warning: shown when qty billed exceeds digital stock */}
                    {item.quantity > (item.stock ?? 0) && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 rounded-full leading-none">
                          ⚠️ Low Stock ({item.stock ?? 0} left)
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 text-center font-medium">
                    ₹{(item.price || 0).toLocaleString()}
                  </div>
                  <div className="col-span-2 flex items-center justify-center">
                    <div className={`flex items-center border rounded-md bg-white ${item.quantity > (item.stock ?? 0) ? 'border-amber-400' : 'border-gray-300'}`}>
                      <button onClick={() => updateQuantity(item._id, -1)} className="px-2 py-1 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-l-md"><Minus className="w-4 h-4" /></button>
                      <input type="number" readOnly value={item.quantity} className="w-10 text-center text-sm font-bold border-x border-gray-300 py-1 outline-none" />
                      <button onClick={() => updateQuantity(item._id, 1)} className="px-2 py-1 text-gray-500 hover:text-primary hover:bg-gray-100 rounded-r-md"><Plus className="w-4 h-4" /></button>
                    </div>
                  </div>
                  <div className="col-span-2 text-right font-bold text-gray-900 text-lg">
                    ₹{((item.price || 0) * item.quantity).toLocaleString()}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <button onClick={() => removeItem(item._id)} className="text-gray-400 hover:text-red-500 p-2">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right Area: Checkout & Calculations */}
      <div className="w-full md:w-96 bg-gray-50 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)] z-10 shrink-0">
        
        {/* Customer Select */}
        <div className="p-4 bg-white border-b border-gray-200">
          {customer ? (
            <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
              <div>
                <div className="font-bold text-primary flex items-center gap-1.5 text-sm">
                  <User className="w-4 h-4" /> {customer.name}
                </div>
                <div className="text-xs text-gray-600 flex items-center gap-1 mt-0.5">
                  <Phone className="w-3 h-3" /> {customer.mobileNumber || customer.mobile || '-'}
                </div>
                {customer.outstandingBalance > 0 && (
                  <div className="text-[11px] text-red-600 font-bold mt-1">
                    Pending Udhaar: ₹{customer.outstandingBalance.toLocaleString()}
                  </div>
                )}
              </div>
              <button onClick={() => setCustomer(null)} className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg"><Trash2 className="w-4 h-4" /></button>
            </div>
          ) : (
            <button 
              onClick={() => setIsCustomerModalOpen(true)}
              className="flex items-center justify-center gap-2 w-full py-3 border border-dashed border-gray-300 rounded-lg text-gray-600 hover:text-primary hover:border-primary hover:bg-primary/5 transition-colors font-bold text-sm bg-gray-50"
            >
              <UserPlus className="w-4 h-4" /> Select / Add Customer
            </button>
          )}
        </div>

        {/* Calculations */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col justify-end space-y-4 text-gray-700">
          <div className="flex justify-between items-center text-sm">
            <span>Subtotal ({cart.reduce((s, i) => s + i.quantity, 0)} items)</span>
            <span className="font-bold">₹{subtotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span>GST Tax (Estimated)</span>
            <span className="font-bold">₹{taxTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-green-600 font-medium">Discount</span>
            <div className="flex items-center">
              <span className="text-green-600 mr-1 font-bold">- ₹</span>
              <input 
                type="number" 
                value={discount || ''} 
                onChange={(e) => setDiscount(Number(e.target.value))}
                placeholder="0.00"
                className="w-20 text-right border-b border-gray-300 focus:border-primary outline-none bg-transparent font-bold text-green-600" 
              />
            </div>
          </div>
          <div className="pt-4 border-t border-gray-300">
            <div className="flex justify-between items-end">
              <span className="text-gray-500 text-lg uppercase tracking-wider font-bold">Total Pay</span>
              <span className="text-4xl font-black text-gray-900">
                ₹{grandTotal.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </span>
            </div>
          </div>
        </div>

        {/* Payment & Checkout */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <button 
              onClick={() => setPaymentMethod('Cash')}
              className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-lg border-2 transition-all font-bold text-xs ${paymentMethod === 'Cash' ? 'border-primary text-primary bg-primary/5' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              <Banknote className="w-5 h-5" />
              CASH
            </button>
            <button 
              onClick={() => setPaymentMethod('UPI')}
              className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-lg border-2 transition-all font-bold text-xs ${paymentMethod === 'UPI' ? 'border-primary text-primary bg-primary/5' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              <CreditCard className="w-5 h-5" />
              UPI/CARD
            </button>
            <button 
              onClick={() => setPaymentMethod('Udhaar')}
              className={`py-2.5 flex flex-col items-center justify-center gap-1 rounded-lg border-2 transition-all font-bold text-xs ${paymentMethod === 'Udhaar' ? 'border-red-600 text-red-600 bg-red-50' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}
            >
              <UserPlus className="w-5 h-5" />
              UDHAAR
            </button>
          </div>

          {paymentMethod === 'Cash' && (
            <div className="mb-4">
              <label className="block text-xs font-bold text-gray-500 mb-1">Amount Tendered</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-500">₹</span>
                <input 
                  type="number" 
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(e.target.value)}
                  className="w-full pl-8 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-lg font-bold text-lg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                  placeholder={grandTotal > 0 ? grandTotal.toFixed(2) : '0.00'}
                />
              </div>
              {balance > 0 && (
                <div className="mt-2 text-right text-sm">
                  <span className="text-gray-500 font-medium">Return Change: </span>
                  <span className="font-bold text-orange-600">₹{balance.toFixed(2)}</span>
                </div>
              )}
            </div>
          )}

          <button 
            onClick={handleCheckout}
            disabled={cart.length === 0 || isCheckingOut}
            className={`w-full py-4 text-white rounded-lg font-black text-xl flex items-center justify-center gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg ${
              isOnline
                ? 'bg-[#059669] hover:bg-[#047857]'
                : 'bg-orange-600 hover:bg-orange-700'
            }`}
          >
            {isCheckingOut ? 'Saving...' : isOnline ? 'CHECKOUT' : '⚡ SAVE OFFLINE'}
            {!isCheckingOut && <Printer className="w-5 h-5" />}
          </button>
        </div>

      </div>

      {/* ─── MODAL: Browse Product Catalog ─── */}
      {isBrowseOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div>
                <h3 className="text-xl font-bold text-gray-900">Product Catalog</h3>
                <p className="text-xs text-gray-500 mt-0.5">Browse and click to add sarees directly to cart</p>
              </div>
              <button 
                onClick={() => setIsBrowseOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-2 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Search */}
            <div className="p-4 border-b border-gray-200 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text"
                  value={browseSearch}
                  onChange={(e) => setBrowseSearch(e.target.value)}
                  placeholder="Filter by name, SKU, barcode, fabric..."
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
            </div>

            {/* Product Grid */}
            <div className="flex-1 overflow-y-auto p-6">
              {filteredBrowseProducts.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
                  <p className="font-bold text-gray-600">No products found</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {filteredBrowseProducts.map((p) => (
                    <div 
                      key={p._id}
                      className="border border-gray-200 rounded-xl p-4 flex flex-col justify-between hover:border-primary hover:shadow-md transition-all bg-white"
                    >
                      <div>
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-600">{p.sku}</span>
                          <span className={`text-xs font-bold ${p.stock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {p.stock} left
                          </span>
                        </div>
                        <h4 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2">{p.name}</h4>
                        {p.fabric && <p className="text-xs text-gray-500 mt-1">Fabric: {p.fabric}</p>}
                      </div>
                      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-lg font-black text-gray-900">₹{(p.price || 0).toLocaleString()}</span>
                        <button
                          onClick={() => addToCart(p)}
                          className="bg-primary hover:bg-primary-light text-white text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL: Select / Add Customer ─── */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900">Select or Add Customer</h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Add Form */}
            <form onSubmit={handleCreateCustomer} className="p-4 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">+ Quick Add New Customer</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input 
                  type="text" 
                  placeholder="Customer Name *" 
                  required
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:border-primary"
                />
                <input 
                  type="text" 
                  placeholder="Mobile Number *" 
                  required
                  value={newCustomerMobile}
                  onChange={(e) => setNewCustomerMobile(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white outline-none focus:border-primary"
                />
              </div>
              <button 
                type="submit"
                className="w-full bg-primary text-white text-xs font-bold py-2 rounded-lg hover:bg-primary-light transition-colors"
              >
                Save & Select
              </button>
            </form>

            {/* Search Existing */}
            <div className="p-4 border-b border-gray-200">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input 
                  type="text"
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search existing customer by name or phone..."
                  className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Existing Customers List */}
            <div className="flex-1 overflow-y-auto p-4 divide-y divide-gray-100">
              <div 
                onClick={() => {
                  setCustomer({ name: 'Walk-in Customer', mobile: '' });
                  setIsCustomerModalOpen(false);
                }}
                className="py-2.5 px-3 rounded-lg hover:bg-gray-50 cursor-pointer flex justify-between items-center"
              >
                <div>
                  <p className="font-bold text-sm text-gray-900">Walk-in Customer</p>
                  <p className="text-xs text-gray-500">Default generic buyer</p>
                </div>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">Select</span>
              </div>

              {filteredCustomerList.map(c => (
                <div 
                  key={c._id}
                  onClick={() => {
                    setCustomer(c);
                    setIsCustomerModalOpen(false);
                  }}
                  className="py-2.5 px-3 rounded-lg hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                >
                  <div>
                    <p className="font-bold text-sm text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{c.mobileNumber || c.mobile}</p>
                  </div>
                  <div className="text-right">
                    {c.outstandingBalance > 0 ? (
                      <span className="text-xs text-red-600 font-bold block">Udhaar: ₹{c.outstandingBalance}</span>
                    ) : (
                      <span className="text-xs text-green-600 font-medium block">Clear</span>
                    )}
                    <span className="text-xs text-primary font-bold">Select</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
