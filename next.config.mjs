/** @type {import('next').NextConfig} */
import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from "@ducanh2912/next-pwa";

// API calls must ALWAYS hit the real server — never serve stale invoice/stock
// data from a cache. NetworkOnly means: if offline, the call fails gracefully
// and the app falls back to IndexedDB (handled in DataContext.js).
const apiNetworkOnly = {
  urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
  handler: "NetworkOnly",
  method: "GET",
};

// Cache Next.js static assets (JS, CSS bundles) aggressively —
// these never change without a new deploy (content-hashed filenames).
const staticAssetsCacheFirst = {
  urlPattern: /\/_next\/static\/.*/i,
  handler: "CacheFirst",
  options: {
    cacheName: "next-static-assets",
    expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
  },
};

// Cache page navigations (HTML) with NetworkFirst so online users get
// fresh pages but offline users get the cached version.
const pageNavigationNetworkFirst = {
  urlPattern: ({ request }) => request.mode === "navigate",
  handler: "NetworkFirst",
  options: {
    cacheName: "page-cache",
    networkTimeoutSeconds: 5,
    expiration: { maxEntries: 30, maxAgeSeconds: 7 * 24 * 60 * 60 },
  },
};

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // Don't force-reload on reconnect — it can abort an in-flight POS checkout.
  reloadOnOnline: false,
  // Show the branded offline.html when a navigation fails with no cache.
  fallbacks: {
    document: "/offline.html",
  },
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [
      apiNetworkOnly,
      staticAssetsCacheFirst,
      pageNavigationNetworkFirst,
      // Keep remaining defaults (images, fonts, etc.) but exclude the "apis"
      // bucket since we handle those above with NetworkOnly.
      ...defaultRuntimeCaching.filter(
        (entry) =>
          entry.options?.cacheName !== "apis" &&
          entry.urlPattern?.toString() !== /\/_next\/static\/.*/i.toString()
      ),
    ],
  },
});

const nextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
