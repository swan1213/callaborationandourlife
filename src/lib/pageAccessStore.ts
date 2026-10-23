import { connectDB } from "./db";
import { getSettings } from "./models/Settings";
import { cleanDisabled, type DisabledPages } from "./pageAccess";

/** Read on every page view (proxy.ts) and governed API call, so kept in memory briefly; other instances catch up within this. */
const TTL_MS = 15_000;
let cache: { at: number; value: DisabledPages } | null = null;

export async function getDisabledPages(): Promise<DisabledPages> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  await connectDB();
  const value = cleanDisabled((await getSettings()).pageAccess);
  cache = { at: Date.now(), value };
  return value;
}

export async function saveDisabledPages(input: unknown): Promise<DisabledPages> {
  const value = cleanDisabled(input);
  const settings = await getSettings();
  settings.pageAccess = value;
  settings.markModified("pageAccess");
  await settings.save();
  cache = { at: Date.now(), value };
  return value;
}
