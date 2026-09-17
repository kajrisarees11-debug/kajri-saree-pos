import mongoose from 'mongoose';

// Duplicated from dataAdapter.js rather than imported from it — dataAdapter.js
// itself imports dbConnect from this file, so importing dataAdapter.js here
// would be circular.
const IS_CLOUD = !!(process.env.VERCEL || process.env.USE_MONGODB === 'true');

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

// On Vercel, MONGODB_URI is always an env var. On the desktop app there's no
// safe way to bake a real production DB credential into a distributed .exe,
// so a desktop install instead gets it from Settings → Cloud Sync (stored in
// that machine's own local SQLite, never bundled into the app or synced
// anywhere else) — resolved here, lazily, only for the non-cloud build so the
// native SQLite dependency is never pulled in on Vercel.
async function resolveMongoUri() {
  if (process.env.MONGODB_URI) return process.env.MONGODB_URI;
  if (IS_CLOUD) return null;

  try {
    const { default: sqliteDb } = await import('./sqlite');
    const row = sqliteDb.prepare('SELECT mongoSyncUri FROM settings LIMIT 1').get();
    return row?.mongoSyncUri || null;
  } catch (err) {
    console.error('[db] Could not read mongoSyncUri from local settings:', err);
    return null;
  }
}

// Drops the cached connection so the next dbConnect() call re-resolves the
// URI (env var or, on desktop, whatever's now stored in Settings → Cloud
// Sync) instead of reusing whatever was first resolved for the lifetime of
// this process. Call this whenever mongoSyncUri changes — otherwise a
// corrected/repointed URI is silently ignored until a full app restart.
export function resetDbConnection() {
  const hadConnection = !!cached.conn;
  cached.conn = null;
  cached.promise = null;
  if (hadConnection) {
    mongoose.disconnect().catch((err) => {
      console.error('[db] Error disconnecting previous Mongo connection:', err.message);
    });
  }
}

async function dbConnect() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    // Resolved lazily (not at module load) so importing this file never
    // crashes the desktop/SQLite build just for not having a URI configured
    // yet — most routes never call dbConnect() on that build at all.
    const MONGODB_URI = await resolveMongoUri();
    if (!MONGODB_URI) {
      throw new Error(
        IS_CLOUD
          ? 'Please define the MONGODB_URI environment variable inside .env.local (or in your Vercel project settings)'
          : "MongoDB sync isn't configured on this device yet — go to Settings → Cloud Sync and enter your MongoDB connection string."
      );
    }

    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGODB_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default dbConnect;
