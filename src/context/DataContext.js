'use client';
import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useNetworkStatus } from './NetworkStatusContext';
import {
  cacheProducts, getCachedProducts,
  cacheCustomers, getCachedCustomers,
  cacheSuppliers, getCachedSuppliers,
  cacheExpenses, getCachedExpenses,
  cachePurchases, getCachedPurchases,
  cacheInvoices, getCachedInvoices,
} from '@/lib/offlineSync';

const DataContext = createContext(null);

/**
 * Global data provider — Cache-First Strategy.
 *
 * Step 1: Always load from IndexedDB immediately (instant display even offline).
 * Step 2: If online, try to fetch fresh data from API in the background.
 *         If API succeeds → update state + re-cache.
 *         If API fails (MongoDB down, no internet) → keep showing cached data silently.
 *
 * This ensures pages always show data regardless of server/internet state.
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

  // ── Step 1: Load from IndexedDB immediately ──
  const loadFromCache = useCallback(async () => {
    try {
      const [prods, custs, supps, exps, purch, invs] = await Promise.all([
        getCachedProducts(),
        getCachedCustomers(),
        getCachedSuppliers(),
        getCachedExpenses(),
        getCachedPurchases(),
        getCachedInvoices(),
      ]);
      // Only update if cache has data (avoid wiping valid state with empty arrays)
      if (prods.length)  setProducts(prods);
      if (custs.length)  setCustomers(custs);
      if (supps.length)  setSuppliers(supps);
      if (exps.length)   setExpenses(exps);
      if (purch.length)  setPurchases(purch);
      if (invs.length)   setInvoices(invs);
      console.log('[DataContext] 📦 Loaded from IndexedDB cache.');
    } catch (err) {
      console.warn('[DataContext] Cache read failed:', err);
    }
  }, []);

  // ── Step 2: Refresh from API if online (background, non-blocking) ──
  const refreshFromAPI = useCallback(async () => {
    try {
      const fetchWithTimeout = (url, ms = 8000) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ms);
        return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
      };

      const [prodRes, custRes, suppRes, expRes, purchRes, invRes] = await Promise.allSettled([
        fetchWithTimeout('/api/products'),
        fetchWithTimeout('/api/customers'),
        fetchWithTimeout('/api/suppliers'),
        fetchWithTimeout('/api/expenses'),
        fetchWithTimeout('/api/purchases'),
        fetchWithTimeout('/api/invoices'),
      ]);

      const parse = async (res) => {
        if (res.status === 'fulfilled' && res.value?.ok) {
          try {
            const json = await res.value.json();
            return json.success ? json.data : null;
          } catch { return null; }
        }
        return null;
      };

      const [prods, custs, supps, exps, purch, invs] = await Promise.all([
        parse(prodRes), parse(custRes), parse(suppRes),
        parse(expRes), parse(purchRes), parse(invRes),
      ]);

      // Only update state + cache for collections that returned valid data
      if (prods) { setProducts(prods);  await cacheProducts(prods); }
      if (custs) { setCustomers(custs); await cacheCustomers(custs); }
      if (supps) { setSuppliers(supps); await cacheSuppliers(supps); }
      if (exps)  { setExpenses(exps);   await cacheExpenses(exps); }
      if (purch) { setPurchases(purch); await cachePurchases(purch); }
      if (invs)  { setInvoices(invs);   await cacheInvoices(invs); }

      const anySuccess = [prods, custs, supps, exps, purch, invs].some(Boolean);
      if (anySuccess) {
        setLastSynced(new Date());
        console.log('[DataContext] ✅ Refreshed from API and re-cached to IndexedDB.');
      } else {
        console.warn('[DataContext] ⚠️ API unreachable — staying on cached data.');
      }
    } catch (err) {
      console.warn('[DataContext] Background API refresh failed, using cache:', err);
    }
  }, []);

  // ── Main load: cache first, then background API refresh ──
  const loadAllData = useCallback(async () => {
    setLoading(true);
    await loadFromCache();      // instant — show cached data right away
    setLoading(false);

    if (isOnline) {
      refreshFromAPI();         // non-blocking background refresh
    }
  }, [isOnline, loadFromCache, refreshFromAPI]);

  useEffect(() => {
    const t = setTimeout(() => loadAllData(), 0);
    return () => clearTimeout(t);
  }, [loadAllData]);

  // ── Refresh single collection after a mutation (add/edit/delete) ──
  const refresh = useCallback(async (collection) => {
    try {
      const endpoints = {
        products:  '/api/products',
        customers: '/api/customers',
        suppliers: '/api/suppliers',
        expenses:  '/api/expenses',
        purchases: '/api/purchases',
        invoices:  '/api/invoices',
      };
      const url = endpoints[collection];
      if (!url) return;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.success) return;
      const items = data.data;
      switch (collection) {
        case 'products':  setProducts(items);  await cacheProducts(items);  break;
        case 'customers': setCustomers(items); await cacheCustomers(items); break;
        case 'suppliers': setSuppliers(items); await cacheSuppliers(items); break;
        case 'expenses':  setExpenses(items);  await cacheExpenses(items);  break;
        case 'purchases': setPurchases(items); await cachePurchases(purch); break;
        case 'invoices':  setInvoices(items);  await cacheInvoices(items);  break;
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
