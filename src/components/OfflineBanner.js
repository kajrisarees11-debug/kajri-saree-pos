'use client';
import { useNetworkStatus } from '@/context/NetworkStatusContext';
import { WifiOff, Wifi, RefreshCw, CloudOff, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useEffect, useState } from 'react';

export default function OfflineBanner() {
  const { isOnline, pendingCount, isSyncing, lastSyncResult, manualSync } = useNetworkStatus();
  const [showSyncToast, setShowSyncToast] = useState(false);

  useEffect(() => {
    if (lastSyncResult && (lastSyncResult.synced > 0 || lastSyncResult.failed > 0)) {
      const t1 = setTimeout(() => setShowSyncToast(true), 0);
      const t2 = setTimeout(() => setShowSyncToast(false), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [lastSyncResult]);

  // Offline banner takes priority over everything else, including a
  // still-visible success toast — otherwise a flaky reconnect (online just
  // long enough to sync, then offline again) shows a stale "synced
  // successfully" message instead of the current, more important OFFLINE state.
  if (!isOnline) {
    return (
      <div className="relative z-50 bg-orange-600 text-white px-4 py-2.5 flex items-center justify-between shadow-md shrink-0 w-full">
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

  // Syncing spinner (while pushing pending bills)
  if (isSyncing) {
    return (
      <div className="relative z-50 bg-blue-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-md shrink-0 w-full">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Syncing {pendingCount} pending {pendingCount === 1 ? 'bill' : 'bills'} to the cloud...
      </div>
    );
  }

  // Sync result toast — distinguishes a real failure from success, so a
  // repeatedly-failing sync doesn't look identical to "nothing happened yet".
  if (showSyncToast && lastSyncResult) {
    if (lastSyncResult.failed > 0) {
      return (
        <div className="relative z-50 bg-red-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-md shrink-0 w-full">
          <AlertTriangle className="w-4 h-4" />
          ⚠️ {lastSyncResult.failed} offline {lastSyncResult.failed === 1 ? 'bill' : 'bills'} failed to sync and will retry — check the console for details.
        </div>
      );
    }
    if (lastSyncResult.synced > 0) {
      return (
        <div className="relative z-50 bg-green-600 text-white px-4 py-2.5 flex items-center justify-center gap-2 text-sm font-medium shadow-md shrink-0 w-full">
          <CheckCircle2 className="w-4 h-4" />
          ✅ {lastSyncResult.synced} offline {lastSyncResult.synced === 1 ? 'bill' : 'bills'} synced to the cloud successfully!
        </div>
      );
    }
  }

  // Pending bills badge when back online (before sync fires)
  if (pendingCount > 0 && !isSyncing) {
    return (
      <div className="relative z-50 bg-yellow-500 text-white px-4 py-2.5 flex items-center justify-between shadow-md shrink-0 w-full">
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
