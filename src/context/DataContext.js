'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNetworkStatus } from './NetworkStatusContext';

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

/**
 * Global data provider — Local-First SQLite Strategy.
 *
 * All API routes now hit the local SQLite database running in the Node/Electron process.
 * This guarantees 0ms latency and 100% offline uptime without needing IndexedDB caching.
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

  const loadAllData = useCallback(async () => {
    setLoading(true);

    // Each collection is fetched and applied independently — a single
    // endpoint erroring (e.g. a transient hiccup while the local SQLite
    // server is still starting up) must not wipe the other five collections
    // back to empty, which previously happened via a single Promise.all.
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

    const results = await Promise.allSettled(
      fetches.map(([, url]) => fetch(url).then(r => r.json()))
    );

    let anyFailed = false;
    results.forEach((result, i) => {
      const [name, , setter] = fetches[i];
      if (result.status === 'fulfilled' && result.value.success) {
        setter(result.value.data);
      } else {
        anyFailed = true;
        const reason = result.status === 'rejected' ? result.reason : result.value.error;
        console.error(`[DataContext] Failed to load ${name}:`, reason);
      }
    });

    if (!anyFailed) {
      console.log('[DataContext] ⚡ Loaded data from local SQLite database.');
    }
    setLastSynced(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ── Background Sync Engine Trigger ──
  // Pings the local sync_queue -> MongoDB engine every 15s. If it actually
  // pushed or pulled anything, our in-memory collections are now stale, so
  // reload. Previously this fetch's response (and any failure) was silently
  // discarded, so a broken background sync gave no signal anywhere.
  useEffect(() => {
    if (!isOnline) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/sync');
        const data = await res.json();
        if (!data.success) {
          console.error('[DataContext] Background sync reported failure:', data.error);
          return;
        }
        const upProcessed = data.data?.upSync?.processed || 0;
        const downSynced = data.data?.downSync?.synced || 0;
        const stuck = data.data?.upSync?.stuck || 0;
        if (stuck > 0) {
          console.error(`[DataContext] ${stuck} local change(s) still stuck un-synced to the cloud.`);
        }
        if (upProcessed > 0 || downSynced > 0) {
          await loadAllData();
        }
      } catch (err) {
        console.error('[DataContext] Background sync ping failed:', err);
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [isOnline, loadAllData]);

  // ── Reload after the offline-invoice queue (IndexedDB -> server) syncs ──
  // Without this, a queued offline sale only ever appears in Products/Sales/
  // Customers after a manual full page reload.
  useEffect(() => {
    if (lastSyncResult && lastSyncResult.synced > 0) {
      loadAllData();
    }
  }, [lastSyncResult, loadAllData]);

  // ── Refresh single collection after a mutation ──
  const refresh = useCallback(async (collection) => {
    try {
      const path = COLLECTION_PATHS[collection] || collection;
      const res = await fetch(`/api/${path}`);
      const data = await res.json();

      if (!data.success) return;

      const items = data.data;
      switch (collection) {
        case 'products':  setProducts(items);  break;
        case 'customers': setCustomers(items); break;
        case 'suppliers': setSuppliers(items); break;
        case 'expenses':  setExpenses(items);  break;
        case 'purchases': setPurchases(items); break;
        case 'invoices':  setInvoices(items);  break;
        case 'bankAccounts':     setBankAccounts(items);     break;
        case 'bankTransactions': setBankTransactions(items); break;
        case 'cashTransactions': setCashTransactions(items); break;
      }
    } catch (err) {
      console.error(`[DataContext] Failed to refresh ${collection}:`, err);
    }
  }, []);

  return (
    <DataContext.Provider value={{
      products, customers, suppliers, expenses, purchases, invoices,
      bankAccounts, bankTransactions, cashTransactions,
      loading, lastSynced, isOnline,
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
