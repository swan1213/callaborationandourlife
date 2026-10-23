// Time zone for displaying and entering times.
// Everyone uses the default zone, a fixed GMT-04:00, except callers, who have their own zone (set by an admin).
// AppShell sets that "home" zone on load; the interview pages' time zone box can switch the viewer zone
// (setViewerTz) for as long as the page is open, and goes back to the home zone when you leave.

/** Fixed GMT-04:00 (IANA "Etc/" names invert the sign). */
export const DEFAULT_TZ = "Etc/GMT+4";
/** Second choice in every time zone box: Calgary, Mountain Time. */
export const CALGARY_TZ = "America/Edmonton";
let viewerTz = DEFAULT_TZ;
let homeTz = DEFAULT_TZ;

export function setViewerTz(tz: string | null | undefined) {
  if (tz && isValidTz(tz)) viewerTz = tz;
}
export const getViewerTz = () => viewerTz;

/** The signed-in account's own zone (callers: theirs; others: the default). Also becomes the viewer zone. */
export function setHomeTz(tz: string | null | undefined) {
  const z = tz && isValidTz(tz) ? tz : DEFAULT_TZ;
  // Only when the account's zone changes: re-renders must not undo a zone a page picked (setViewerTz).
  if (z === homeTz) return;
  homeTz = z;
  viewerTz = z;
}
export const getHomeTz = () => homeTz;

let interviewTz = DEFAULT_TZ;
/** Zone the interview pages open in: the account's own zone from My Page (admins, users, callers), else the default. */
export function setInterviewTz(tz: string | null | undefined) {
  interviewTz = tz && isValidTz(tz) ? tz : DEFAULT_TZ;
}
export const getInterviewTz = () => interviewTz;

export function isValidTz(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export type TzParts = { y: number; m: number; d: number; h: number; min: number; s: number; wd: number };
const fmtCache = new Map<string, Intl.DateTimeFormat>();
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Calendar fields of `date` in `tz` (default: the viewer's zone). */
export function tzParts(date: Date | string | number, tz = viewerTz): TzParts {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
    fmtCache.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(date)).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute, s: +p.second, wd: WD[p.weekday] ?? 0 };
}

/** Milliseconds `tz` is ahead of UTC at `date`. */
function offset(date: Date, tz: string) {
  const p = tzParts(date, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant for a wall-clock time in `tz` (handles DST with a second pass). */
export function fromWallTime(y: number, m: number, d: number, h = 0, min = 0, tz = viewerTz) {
  const guess = Date.UTC(y, m - 1, d, h, min);
  let t = guess - offset(new Date(guess), tz);
  t = guess - offset(new Date(t), tz);
  return new Date(t);
}

const p2 = (n: number) => String(n).padStart(2, "0");

/** Value for <input type="datetime-local"> showing `date` in the viewer's zone. */
export function toTzInput(date: Date | string | null | undefined) {
  if (!date) return "";
  const p = tzParts(date);
  return `${p.y}-${p2(p.m)}-${p2(p.d)}T${p2(p.h)}:${p2(p.min)}`;
}

/** Parses a datetime-local ("YYYY-MM-DDTHH:mm") or date ("YYYY-MM-DD") value as a time in the viewer's zone. */
export function fromTzInput(value: string, tz = viewerTz) {
  const [date, time = "00:00"] = value.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  return fromWallTime(y, m, d, h || 0, min || 0, tz);
}

/** "YYYY-MM-DD" day key in the viewer's zone. */
export function tzDayKey(date: Date | string | number) {
  const p = tzParts(date);
  return `${p.y}-${p2(p.m)}-${p2(p.d)}`;
}

/** Short zone name for labels, e.g. "EST" / "EDT" / "GMT+9". */
export function tzAbbr(tz = viewerTz, at = new Date()) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? tz;
  } catch {
    return tz;
  }
}

/** "GMT-04:00" style offset of `tz` at `at`. */
export function gmtOffset(tz: string, at = new Date()) {
  try {
    const v = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "longOffset" }).formatToParts(at).find((p) => p.type === "timeZoneName")?.value;
    return !v || v === "GMT" ? "GMT+00:00" : v;
  } catch {
    return tz;
  }
}

/** Readable zone name: "GMT-04:00" for the default / fixed-offset zones, else "America/Chicago (GMT-05:00)". */
export function zoneName(tz: string, at = new Date()) {
  if (tz.startsWith("Etc/") || tz === "UTC") return gmtOffset(tz, at);
  return `${tz === CALGARY_TZ ? "Calgary · Mountain Time" : tz.replace(/_/g, " ")} (${gmtOffset(tz, at)})`;
}

/**
 * Choices for a time zone box: the default first ("(GMT-04:00 : Default)"), Calgary (Mountain Time) second,
 * then every other zone by offset, e.g. "(GMT-05:00) America/Chicago".
 */
export function timeZoneChoices(): { value: string; label: string }[] {
  const now = new Date();
  const { common, rest } = timeZoneOptions();
  const minutes = (o: string) => {
    const m = /GMT([+-])(\d{2}):(\d{2})/.exec(o);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  const others = [...new Set([...common, ...rest])]
    .filter((z) => z !== DEFAULT_TZ && z !== CALGARY_TZ && !z.startsWith("Etc/"))
    .map((z) => ({ value: z, off: gmtOffset(z, now) }))
    .sort((a, b) => minutes(a.off) - minutes(b.off) || a.value.localeCompare(b.value))
    .map((z) => ({ value: z.value, label: `(${z.off}) ${z.value.replace(/_/g, " ")}` }));
  return [
    { value: DEFAULT_TZ, label: `(${gmtOffset(DEFAULT_TZ, now)} : Default)` },
    { value: CALGARY_TZ, label: `(${gmtOffset(CALGARY_TZ, now)}) Calgary · Mountain Time` },
    ...others,
  ];
}

/** Every zone the browser knows, with a few common ones first. */
export function timeZoneOptions() {
  const common = ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "UTC", "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Manila", "Asia/Shanghai", "Asia/Seoul", "Asia/Tokyo", "Australia/Sydney"];
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    /* older browsers */
  }
  return { common, rest: all.filter((z) => !common.includes(z)) };
}
