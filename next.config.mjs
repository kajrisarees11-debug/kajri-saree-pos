/** @type {import('next').NextConfig} */
import withPWAInit, { runtimeCaching as defaultRuntimeCaching } from "@ducanh2912/next-pwa";

// The library's default runtimeCaching NetworkFirst-caches every GET /api/*
// call into one shared 16-entry Cache Storage bucket, keyed only by URL —
// with no awareness of the auth cookie or of which user/session fetched it.
// For a POS app that means live invoice/stock/customer data (and, worse, the
// Settings response) can be served stale or to the wrong logged-in user on a
// shared terminal. API calls must always hit the real server.
const apiNetworkOnly = {
  urlPattern: ({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith("/api/"),
  handler: "NetworkOnly",
  method: "GET",
};

const withPWA = withPWAInit({
  dest: "public",
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  // The default (true) force-reloads every open page the instant the browser
  // regains connectivity, which can abort an in-flight POS checkout request
  // mid-flight before its own offline-fallback logic ever runs.
  reloadOnOnline: false,
  disable: process.env.NODE_ENV === "development",
  workboxOptions: {
    disableDevLogs: true,
    runtimeCaching: [apiNetworkOnly, ...defaultRuntimeCaching.filter((entry) => entry.options?.cacheName !== "apis")],
  },
});

const nextConfig = {
  turbopack: {},
};

export default withPWA(nextConfig);
