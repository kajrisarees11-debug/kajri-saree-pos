'use client';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useData } from '@/context/DataContext';

// Distinguishes "a fetch actually failed" from "this store genuinely has no
// data yet" — without this, every page just rendered its normal empty-state
// UI on a failed load (a transient hiccup while the local server is still
// starting up, a cold-started Mongo connection, etc.), which looks
// identical to an empty inventory/customer base with nothing telling the
// owner it's actually broken.
export default function DataLoadErrorBanner() {
  const { loadErrors, reload } = useData();

  if (!loadErrors || loadErrors.length === 0) return null;

  return (
    <div className="bg-red-600 text-white px-4 py-2.5 flex items-center justify-between shadow-lg shrink-0">
      <div className="flex items-center gap-2 text-sm font-medium">
        <AlertTriangle className="w-4 h-4" />
        <span>Failed to load: {loadErrors.join(', ')} — showing may be incomplete, not actually empty.</span>
      </div>
      <button
        onClick={reload}
        className="flex items-center gap-1.5 text-xs bg-white text-red-700 px-3 py-1.5 rounded-full font-bold hover:bg-red-50 transition-colors"
      >
        <RefreshCw className="w-3 h-3" /> Retry
      </button>
    </div>
  );
}
