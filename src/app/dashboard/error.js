'use client';
import { useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';

// A single bad record (e.g. one missing an expected field) previously took
// down the entire dashboard shell with Next's default crash screen — there
// was no error.js anywhere under src/app, so nothing recoverable was shown.
export default function DashboardError({ error, retry }) {
  useEffect(() => {
    console.error('[Dashboard] Uncaught error:', error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center h-full py-20 text-center px-4">
      <AlertTriangle className="w-12 h-12 text-red-500 mb-4" />
      <h2 className="text-xl font-bold text-gray-900 mb-2">Something went wrong</h2>
      <p className="text-gray-500 text-sm mb-6 max-w-md">
        This page hit an unexpected error. Your data is safe — try reloading this section below.
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
