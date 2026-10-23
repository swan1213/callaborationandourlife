// Day boundaries in an IANA timezone without extra dependencies.

export { DEFAULT_TZ as APP_TZ, zoneName } from "./viewerTz";

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function parts(date: Date, tz: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(date)
      .map((x) => [x.type, x.value])
  );
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, min: +p.minute, s: +p.second };
}

/** Milliseconds the zone is ahead of UTC at `date`. */
function offset(date: Date, tz: string) {
  const p = parts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** UTC instant of local midnight for a calendar day in `tz`. */
function localMidnight(y: number, m: number, d: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d);
  let t = guess - offset(new Date(guess), tz);
  t = guess - offset(new Date(t), tz); // second pass handles DST transitions
  return new Date(t);
}

/** "YYYY-MM-DD" of `date` in `tz`. */
export function dayKey(date: Date, tz: string) {
  const p = parts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** [start, end) UTC instants for a local day given as "YYYY-MM-DD". */
export function dayRange(key: string, tz: string) {
  const [y, m, d] = key.split("-").map(Number);
  const start = localMidnight(y, m, d, tz);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = localMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), tz);
  return { start, end, key };
}

export function todayRange(tz: string, now = new Date()) {
  return dayRange(dayKey(now, tz), tz);
}

/** "14:05" in `tz`. */
export function formatTime(date: Date, tz: string) {
  const p = parts(date, tz);
  return `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}`;
}

/** "2025-12-31 (Wednesday)" for a "YYYY-MM-DD" day key. */
export function formatDayLong(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return `${key} (${new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })})`;
}


/** Hour of day (0-23) of `date` in `tz`. */
export function localHour(date: Date, tz: string) {
  return parts(date, tz).h;
}

/** "2026-10-02 (Thu) 15:00" in `tz`. */
export function formatDateTime(date: Date, tz: string) {
  const p = parts(date, tz);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(date);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")} (${wd}) ${formatTime(date, tz)}`;
}
