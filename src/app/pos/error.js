'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

// Same reasoning as dashboard/error.js — the POS billing screen is the one
// place a crash is most disruptive (mid-sale), so it needs its own
// recoverable boundary rather than falling through to a blank/default page.
export default function POSError({ error, retry }) {
  useEffect(() => {
    console.error('[POS] Uncaught error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center flex-1 py-20 text-center px-4 bg-gray-50">
      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm mb-6 max-w-md">
        The billing screen hit an unexpected error. Any sale already saved (online or in the offline queue) is safe — try reloading below.
      </p>
      <button
        onClick={() => retry()}
        className="bg-primary text-white px-6 py-2.5 rounded-lg hover:bg-primary-light transition-colors font-medium"
      >
        Try Again
      </button>
    </div>
  );
}
