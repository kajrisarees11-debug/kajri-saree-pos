'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNetworkStatus } from './NetworkStatusContext';
import * as offlineSync from '@/lib/offlineSync';

const DataContext = createContext(null);

const COLLECTION_PATHS = {
  products: 'products',
  customers: 'customers',
  suppliers: 'suppliers',
  expenses: 'expenses',
  purchases: 'purchases',
  invoices: 'invoices',
  bankAccounts: 'bank/accounts',
  bankTransactions: 'bank/transactions',
  cashTransactions: 'cash/transactions',
};

// Map collection name to offlineSync cache functions
const CACHE_FNS = {
  products: { cache: offlineSync.cacheProducts, get: offlineSync.getCachedProducts },
  customers: { cache: offlineSync.cacheCustomers, get: offlineSync.getCachedCustomers },
  suppliers: { cache: offlineSync.cacheSuppliers, get: offlineSync.getCachedSuppliers },
  expenses: { cache: offlineSync.cacheExpenses, get: offlineSync.getCachedExpenses },
  purchases: { cache: offlineSync.cachePurchases, get: offlineSync.getCachedPurchases },
  invoices: { cache: offlineSync.cacheInvoices, get: offlineSync.getCachedInvoices },
  bankAccounts: { cache: offlineSync.cacheBankAccounts, get: offlineSync.getCachedBankAccounts },
  bankTransactions: { cache: offlineSync.cacheBankTransactions, get: offlineSync.getCachedBankTransactions },
  cashTransactions: { cache: offlineSync.cacheCashTransactions, get: offlineSync.getCachedCashTransactions },
};

/**
 * Global data provider — PWA Strategy (Online-First with IndexedDB fallback)
 */
export function DataProvider({ children }) {
  const { isOnline, lastSyncResult } = useNetworkStatus();

  const [products, setProducts]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices]   = useState([]);
  const [bankAccounts, setBankAccounts] = useState([]);
  const [bankTransactions, setBankTransactions] = useState([]);
  const [cashTransactions, setCashTransactions] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastSynced, setLastSynced] = useState(null);
  const [loadErrors, setLoadErrors] = useState([]);

  // Load a single collection from Network (and cache it), fallback to IndexedDB
  const loadCollection = useCallback(async (name, url, setter) => {
    try {
      if (isOnline) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            setter(data.data);
            if (CACHE_FNS[name]) {
              await CACHE_FNS[name].cache(data.data);
            }
            return { success: true };
          }
        } catch (err) {
          console.warn(`[DataContext] Network fetch failed for ${name}, falling back to offline cache.`, err);
        }
      }
      
      // Fallback to offline cache
      if (CACHE_FNS[name]) {
        const cached = await CACHE_FNS[name].get();
        if (Array.isArray(cached)) {
          setter(cached);
          return { success: true, offline: true };
        }
      }
      
      return { success: false, error: 'Failed to load and no offline cache available.' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }, [isOnline]);

  const loadAllData = useCallback(async () => {
    setLoading(true);

    const fetches = [
      ['products', '/api/products', setProducts],
      ['customers', '/api/customers', setCustomers],
      ['suppliers', '/api/suppliers', setSuppliers],
      ['expenses', '/api/expenses', setExpenses],
      ['purchases', '/api/purchases', setPurchases],
      ['invoices', '/api/invoices', setInvoices],
      ['bankAccounts', '/api/bank/accounts', setBankAccounts],
      ['bankTransactions', '/api/bank/transactions', setBankTransactions],
      ['cashTransactions', '/api/cash/transactions', setCashTransactions],
    ];

    const results = await Promise.all(
      fetches.map(([name, url, setter]) => loadCollection(name, url, setter).then(res => ({ name, res })))
    );

    const failed = results.filter(r => !r.res.success).map(r => r.name);
    
    if (failed.length === 0) {
      console.log(`[DataContext] ⚡ Loaded data ${isOnline ? 'from Cloud API' : 'from Local IDB Cache'}.`);
    } else {
      console.error(`[DataContext] Failed to load: ${failed.join(', ')}`);
    }

    setLoadErrors(failed);
    setLastSynced(new Date());
    setLoading(false);
  }, [loadCollection, isOnline]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Reload after the offline-invoice queue (IndexedDB -> server) syncs
  useEffect(() => {
    if (lastSyncResult && lastSyncResult.synced > 0) {
      loadAllData();
    }
  }, [lastSyncResult, loadAllData]);

  const refresh = useCallback(async (collection) => {
    const path = COLLECTION_PATHS[collection] || collection;
    let setter = null;
    switch (collection) {
      case 'products':  setter = setProducts;  break;
      case 'customers': setter = setCustomers; break;
      case 'suppliers': setter = setSuppliers; break;
      case 'expenses':  setter = setExpenses;  break;
      case 'purchases': setter = setPurchases; break;
      case 'invoices':  setter = setInvoices;  break;
      case 'bankAccounts':     setter = setBankAccounts;     break;
      case 'bankTransactions': setter = setBankTransactions; break;
      case 'cashTransactions': setter = setCashTransactions; break;
    }
    if (setter) {
      await loadCollection(collection, `/api/${path}`, setter);
    }
  }, [loadCollection]);

  return (
    <DataContext.Provider value={{
      products, customers, suppliers, expenses, purchases, invoices,
      bankAccounts, bankTransactions, cashTransactions,
      loading, lastSynced, isOnline, loadErrors,
      refresh,
      reload: loadAllData,
    }}>
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside <DataProvider>');
  return ctx;
}
