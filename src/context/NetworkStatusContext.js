'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { syncOfflineInvoices, getPendingInvoiceCount } from '@/lib/offlineSync';

const NetworkStatusContext = createContext({
  isOnline: true,
  pendingCount: 0,
  isSyncing: false,
  lastSyncResult: null,
  manualSync: async () => {},
});

export function NetworkStatusProvider({ children }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const syncTimeoutRef = useRef(null);

  // Refresh the pending count
  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingInvoiceCount();
      setPendingCount(count);
    } catch {
      // IndexedDB not available in SSR
    }
  }, []);

  const runSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const result = await syncOfflineInvoices();
      setLastSyncResult(result);
      await refreshPendingCount();
    } finally {
      setIsSyncing(false);
    }
  }, [isSyncing, refreshPendingCount]);

  useEffect(() => {
    // SSR guard
    if (typeof window === 'undefined') return;

    // Defer state updates to avoid synchronous setState warnings
    setTimeout(() => {
      setIsOnline(navigator.onLine);
      refreshPendingCount();
    }, 0);

    const handleOnline = () => {
      setIsOnline(true);
      // Small delay to let the network stabilize before syncing
      syncTimeoutRef.current = setTimeout(() => {
        runSync();
      }, 2000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [runSync, refreshPendingCount]);

  return (
    <NetworkStatusContext.Provider
      value={{ isOnline, pendingCount, isSyncing, lastSyncResult, manualSync: runSync, refreshPendingCount }}
    >
      {children}
    </NetworkStatusContext.Provider>
  );
}

export function useNetworkStatus() {
  return useContext(NetworkStatusContext);
}
