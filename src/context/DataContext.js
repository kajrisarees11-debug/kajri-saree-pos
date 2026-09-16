'use client';
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNetworkStatus } from './NetworkStatusContext';

const DataContext = createContext(null);

/**
 * Global data provider — Local-First SQLite Strategy.
 *
 * All API routes now hit the local SQLite database running in the Node/Electron process.
 * This guarantees 0ms latency and 100% offline uptime without needing IndexedDB caching.
 */
export function DataProvider({ children }) {
  const { isOnline } = useNetworkStatus();

  const [products, setProducts]   = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expenses, setExpenses]   = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [invoices, setInvoices]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [lastSynced, setLastSynced] = useState(null);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [prodRes, custRes, suppRes, expRes, purchRes, invRes] = await Promise.all([
        fetch('/api/products').then(r => r.json()),
        fetch('/api/customers').then(r => r.json()),
        fetch('/api/suppliers').then(r => r.json()),
        fetch('/api/expenses').then(r => r.json()),
        fetch('/api/purchases').then(r => r.json()),
        fetch('/api/invoices').then(r => r.json()),
      ]);

      if (prodRes.success) setProducts(prodRes.data);
      if (custRes.success) setCustomers(custRes.data);
      if (suppRes.success) setSuppliers(suppRes.data);
      if (expRes.success) setExpenses(expRes.data);
      if (purchRes.success) setPurchases(purchRes.data);
      if (invRes.success) setInvoices(invRes.data);
      
      setLastSynced(new Date());
      console.log('[DataContext] ⚡ Loaded data from local SQLite database.');
    } catch (err) {
      console.error('[DataContext] Failed to load from local API:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // ── Background Sync Engine Trigger ──
  useEffect(() => {
    if (!isOnline) return;
    
    // Ping the sync engine every 15 seconds to push local changes to cloud
    const interval = setInterval(() => {
      fetch('/api/sync').catch(() => {});
    }, 15000);
    
    return () => clearInterval(interval);
  }, [isOnline]);

  // ── Refresh single collection after a mutation ──
  const refresh = useCallback(async (collection) => {
    try {
      const url = `/api/${collection}`;
      const res = await fetch(url);
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
      }
    } catch (err) {
      console.error(`[DataContext] Failed to refresh ${collection}:`, err);
    }
  }, []);

  return (
    <DataContext.Provider value={{
      products, customers, suppliers, expenses, purchases, invoices,
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
