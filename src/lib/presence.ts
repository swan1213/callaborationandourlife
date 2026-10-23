// Presence and work time. Every open TailorBid tab (components/Presence.tsx) and the Interview Assistant send a
// heartbeat each minute with how long the person has been idle. That gives each account a status
// (online · away · offline) and work sessions, which Work Time adds up per day.
import type { Types } from "mongoose";
import { HttpError } from "./auth";
import { User } from "./models/User";
import { WorkSession } from "./models/WorkSession";
import { dayKey, dayRange } from "./tz";

export const HEARTBEAT_MS = 60_000;
/** No heartbeat for this long (two missed beats and a margin): offline. */
export const OFFLINE_AFTER_MS = 150_000;
/** No input for this long while a tab is open: away. */
export const AWAY_AFTER_MS = 10 * 60_000;
/** Input within this long counts as working; longer idle stretches are not work time. */
const WORKING_IDLE_MS = 5 * 60_000;
/** A heartbeat this long after the last one starts a new work session instead of extending it. */
const SESSION_GAP_MS = 3 * 60_000;

export type PresenceStatus = "online" | "away" | "offline";

export function presenceStatus(u: { lastSeenAt?: Date | null; lastActiveAt?: Date | null }, now = Date.now()): PresenceStatus {
  if (!u.lastSeenAt || now - new Date(u.lastSeenAt).getTime() > OFFLINE_AFTER_MS) return "offline";
  return u.lastActiveAt && now - new Date(u.lastActiveAt).getTime() <= AWAY_AFTER_MS ? "online" : "away";
}

/** Reads { idleMs } from a heartbeat body: milliseconds since the last input (0 = active right now). */
export async function readIdle(req: Request) {
  const b = await req.json().catch(() => ({}));
  const idle = Number(b?.idleMs);
  if (!Number.isFinite(idle) || idle < 0) throw new HttpError(400, "idleMs must be a number of milliseconds");
  return Math.min(idle, 7 * 24 * 3600_000);
}

/** Records a heartbeat: last seen, last input, and the work session when the person is working. */
export async function recordPresence(userId: Types.ObjectId, idleMs: number) {
  const now = Date.now();
  await User.updateOne({ _id: userId }, { $set: { lastSeenAt: new Date(now) }, $max: { lastActiveAt: new Date(now - idleMs) } });
  if (idleMs > WORKING_IDLE_MS) return;
  const extended = await WorkSession.findOneAndUpdate(
    { user: userId, end: { $gte: new Date(now - SESSION_GAP_MS) } },
    { $max: { end: new Date(now) } },
    { sort: { end: -1 }, projection: { _id: 1 } }
  );
  // A new session covers the part of the last minute since the person was last idle.
  if (!extended) await WorkSession.create({ user: userId, start: new Date(now - Math.max(0, HEARTBEAT_MS - idleMs)), end: new Date(now) });
}

const MAX_DAYS = 62;

/** "YYYY-MM-DD" keys from `from` to `to` (both included). */
function dayKeys(from: string, to: string) {
  const keys: string[] = [];
  const [y, m, d] = from.split("-").map(Number);
  for (let i = 0; i <= MAX_DAYS; i++) {
    const k = new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
    if (k > to) break;
    keys.push(k);
  }
  return keys;
}

export type DayWork = { ms: number; first: string; last: string };

/**
 * Work time per account and day, in `tz`, from `from` to `to` ("YYYY-MM-DD", both included, at most 62 days).
 * Overlapping sessions (two tabs, or a tab and the assistant) are merged, so time is never counted twice.
 */
export async function workTime(from: string, to: string, tz: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new HttpError(400, "Choose a valid date range");
  const days = dayKeys(from, to);
  if (days.at(-1) !== to) throw new HttpError(400, `Choose at most ${MAX_DAYS} days`);
  const start = dayRange(from, tz).start.getTime();
  const end = dayRange(to, tz).end.getTime();

  const [users, sessions] = await Promise.all([
    User.find({ status: "approved" }).select("name email role avatar lastSeenAt lastActiveAt").sort({ name: 1 }).lean(),
    WorkSession.find({ start: { $lt: new Date(end) }, end: { $gt: new Date(start) } }).select("user start end").lean(),
  ]);

  // Clip to the range and merge overlaps, per account.
  const byUser = new Map<string, [number, number][]>();
  for (const s of sessions) {
    const a = Math.max(start, s.start.getTime());
    const b = Math.min(end, s.end.getTime());
    if (b > a) (byUser.get(String(s.user)) ?? byUser.set(String(s.user), []).get(String(s.user))!).push([a, b]);
  }
  const perUser = new Map<string, Record<string, DayWork>>();
  for (const [uid, list] of byUser) {
    list.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const iv of list) {
      const prev = merged.at(-1);
      if (prev && iv[0] <= prev[1]) prev[1] = Math.max(prev[1], iv[1]);
      else merged.push([...iv]);
    }
    // Split at local midnight so each piece belongs to one day.
    const out: Record<string, DayWork> = {};
    for (let [a, b] of merged) {
      while (a < b) {
        const key = dayKey(new Date(a), tz);
        const pieceEnd = Math.min(b, dayRange(key, tz).end.getTime());
        const d = (out[key] ??= { ms: 0, first: new Date(a).toISOString(), last: new Date(pieceEnd).toISOString() });
        d.ms += pieceEnd - a;
        d.last = new Date(pieceEnd).toISOString();
        a = pieceEnd;
      }
    }
    perUser.set(uid, out);
  }

  const now = Date.now();
  return {
    days,
    users: users.map((u) => {
      const work = perUser.get(String(u._id)) ?? {};
      return {
        _id: String(u._id),
        name: u.name,
        email: u.email,
        role: u.role,
        avatar: u.avatar ?? "",
        status: presenceStatus(u, now),
        lastSeenAt: u.lastSeenAt ?? null,
        totalMs: Object.values(work).reduce((t, d) => t + d.ms, 0),
        days: work,
      };
    }),
  };
}
