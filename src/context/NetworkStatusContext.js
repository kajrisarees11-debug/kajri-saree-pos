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
  // Must start at `true` here, matching the server-rendered value — this
  // component is rendered during SSR (where `navigator` doesn't exist), so a
  // lazy initializer that branches on `typeof navigator` would compute a
  // DIFFERENT value for the server-rendered HTML vs. the client's first
  // render whenever the device is actually offline, causing a React
  // hydration-mismatch error (#418) on every single page. The real value is
  // applied synchronously in the effect below instead, which only ever runs
  // client-side post-hydration, so it can safely diverge from `true`.
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

    // Correct the initial (SSR-safe) `true` guess immediately on mount —
    // synchronously here, not deferred via setTimeout, so the window where a
    // genuinely-offline device briefly shows as online is as short as
    // React's own commit timing allows.
    setIsOnline(navigator.onLine);
    refreshPendingCount();
    if (navigator.onLine) runSync();

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

    // Chromium's 'online'/'offline' events don't always fire reliably inside
    // an Electron BrowserWindow. Poll navigator.onLine as a fallback so a
    // missed event doesn't leave the banner permanently wrong.
    const pollId = setInterval(() => {
      setIsOnline((prev) => (prev !== navigator.onLine ? navigator.onLine : prev));
    }, 10000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(pollId);
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
