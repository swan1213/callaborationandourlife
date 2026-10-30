import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const g = globalThis as unknown as { _mongoose?: Cache };
const cache: Cache = g._mongoose ?? (g._mongoose = { conn: null, promise: null });

export async function connectDB() {
  if (cache.conn) return cache.conn;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!cache.promise) {
    // maxIdleTimeMS: idle sockets are closed by us before the server or a network hop drops them silently, so a
    // request doesn't pick up a dead one (seen as "SSL alert internal error" mid-request).
    cache.promise = mongoose.connect(uri, { bufferCommands: false, maxPoolSize: 10, maxIdleTimeMS: 60_000, dbName: process.env.MONGODB_DB || "tailorbid" });
  }
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

/** The database connection dropped or couldn't be reached (network, TLS, server selection), not a bad query. */
export function isConnectionError(e: unknown) {
  if (!(e instanceof Error)) return false;
  return (
    /^Mongo(Network|NetworkTimeout|ServerSelection|PoolCleared|TopologyClosed)Error$/.test(e.name) ||
    /SSL routines|ssl3_|tls|ECONNRESET|EPIPE|ETIMEDOUT|ECONNREFUSED|socket hang up|connection .*closed/i.test(e.message)
  );
}

/** Runs a write once more when the connection dropped: work already paid for (an AI generation) isn't lost to a blip. */
export async function retryOnDrop<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isConnectionError(e)) throw e;
    await new Promise((r) => setTimeout(r, 500));
    return fn();
  }
}
