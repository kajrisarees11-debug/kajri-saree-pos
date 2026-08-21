'use client';
import { useNetworkStatus } from '@/context/NetworkStatusContext';
import { WifiOff, Wifi, RefreshCw, CloudOff, CheckCircle2 } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, lastSyncResult, manualSync } = useNetworkStatus();
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);

  useEffect(() => {
    if (lastSyncResult?.synced > 0) {
      const t1 = setTimeout(() => setShowSyncSuccess(true), 0);
      const t2 = setTimeout(() => setShowSyncSuccess(false), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [lastSyncResult]);

  // Sync success toast (brief flash when back online)
  if (showSyncSuccess) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-green-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-lg animate-slide-down">
        <CheckCircle2 className="w-4 h-4" />
        ✅ {lastSyncResult.synced} offline {lastSyncResult.synced === 1 ? 'bill' : 'bills'} synced to the cloud successfully!
      </div>
    );
  }

  // Syncing spinner (while pushing pending bills)
  if (isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-blue-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Syncing {pendingCount} pending {pendingCount === 1 ? 'bill' : 'bills'} to the cloud...
      </div>
    );
  }

  // Offline banner with pending count
  if (!isOnline) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2 text-sm font-medium">
          <WifiOff className="w-4 h-4" />
          <span>⚠️ OFFLINE MODE — Billing is active. Bills are saved locally and will sync when internet reconnects.</span>
        </div>
        {pendingCount > 0 && (
          <span className="text-xs bg-white/20 px-2 py-1 rounded-full font-bold whitespace-nowrap">
            {pendingCount} pending
          </span>
        )}
      </div>
    );
  }

  // Pending bills badge when back online (before sync fires)
  if (pendingCount > 0 && !isSyncing) {
    return (
      <div className="fixed top-0 left-0 right-0 z-[100] bg-yellow-500 text-white px-4 py-2.5 flex items-center justify-between shadow-lg">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CloudOff className="w-4 h-4" />
          <span>{pendingCount} offline {pendingCount === 1 ? 'bill' : 'bills'} pending cloud sync.</span>
        </div>
        <button
          onClick={manualSync}
          className="flex items-center gap-1.5 text-xs bg-white text-yellow-700 px-3 py-1.5 rounded-full font-bold hover:bg-yellow-50 transition-colors"
        >
          <RefreshCw className="w-3 h-3" /> Sync Now
        </button>
      </div>
    );
  }

  return null;
}
