"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Sparkles } from "lucide-react";
import { useToast } from "./Alerts";
import { desktopNotify } from "./desktopNotify";
import InterviewAssistant from "./InterviewAssistant";
import type { Interview } from "./interviews";

type Upcoming = Pick<Interview, "_id" | "company" | "jobTitle" | "step" | "profileLabel" | "profile"> & {
  scheduledAt: string;
  durationMinutes?: number;
};

const POLL_MS = 60_000;
const TICK_MS = 15_000;
/** The banner shows from this long before the start until the interview ends. */
const BANNER_MS = 15 * 60_000;
/** Alerts (toast + desktop) at these times before the start; 0 = starting now. */
const ALERTS_MIN = [15, 5, 0];
const FIRED_KEY = "tb-interview-alerts";

const what = (i: Upcoming) => [i.company || "Interview", i.jobTitle].filter(Boolean).join(" · ");
const who = (i: Upcoming) => i.profile?.fullName || i.profile?.label || i.profileLabel;

/** "in 12 min", "starting now", "in progress · 20 min left". */
function timing(i: Upcoming, now: number) {
  const start = new Date(i.scheduledAt).getTime();
  const end = start + (i.durationMinutes ?? 60) * 60_000;
  const min = Math.round((start - now) / 60_000);
  if (min > 1) return `starts in ${min} min`;
  if (min >= -1) return "starting now";
  return `in progress · ${Math.max(1, Math.round((end - now) / 60_000))} min left`;
}

/** Each alert once per browser, even with several tabs open or after a reload. */
function claimAlert(key: string) {
  try {
    const fired: string[] = JSON.parse(localStorage.getItem(FIRED_KEY) || "[]");
    if (fired.includes(key)) return false;
    localStorage.setItem(FIRED_KEY, JSON.stringify([...fired, key].slice(-100)));
    return true;
  } catch {
    return true;
  }
}

/**
 * Callers: a banner at the top of every page from 15 minutes before an interview until it ends, with the
 * Interview Assistant one click away, plus a toast and a desktop notification 15 and 5 minutes before and at the start.
 */
export default function UpcomingInterviews({ role }: { role: string }) {
  const [items, setItems] = useState<Upcoming[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [assistant, setAssistant] = useState<Upcoming | null>(null);
  const toast = useToast();
  const enabled = role === "caller";

  const load = useCallback(
    () =>
      fetch("/api/interviews/upcoming", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setItems(d.items))
        .catch(() => {}),
    []
  );

  useEffect(() => {
    if (!enabled) return;
    load();
    const poll = setInterval(load, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [enabled, load]);

  // Alerts when an interview reaches 15 min, 5 min and its start.
  useEffect(() => {
    for (const i of items) {
      const start = new Date(i.scheduledAt).getTime();
      const due = ALERTS_MIN.filter((m) => now >= start - m * 60_000 && now < start + 2 * 60_000);
      const m = due.at(-1); // the latest one reached; earlier ones missed while away are skipped
      if (m === undefined || !claimAlert(`${i._id}:${start}:${m}`)) continue;
      const title = m ? `Interview in ${m} min` : "Your interview is starting";
      const body = `${what(i)} for ${who(i)}`;
      toast({ title, description: body, tone: m ? "info" : "warning", icon: CalendarClock, duration: 0, action: { label: "Open assistant", onClick: () => setAssistant(i) } });
      desktopNotify({ title, body, tag: `interview-${i._id}`, url: `/caller/schedule?id=${i._id}` });
    }
  }, [items, now, toast]);

  if (!enabled) return null;
  const current = items.find((i) => {
    const start = new Date(i.scheduledAt).getTime();
    return now >= start - BANNER_MS && now < start + (i.durationMinutes ?? 60) * 60_000;
  });

  return (
    <>
      {current && (
        <div
          role="status"
          className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-900"
        >
          <CalendarClock className="size-4 shrink-0 text-indigo-600" />
          <span className="min-w-0 flex-1">
            <b className="font-semibold">{what(current)}</b> for {who(current)} · <span className="tabular-nums">{timing(current, now)}</span>
          </span>
          <span className="flex gap-2">
            <Link href={`/caller/schedule?id=${current._id}`} className="btn btn-secondary btn-sm">
              Details
            </Link>
            <button className="btn btn-primary btn-sm" onClick={() => setAssistant(current)}>
              <Sparkles />
              Open assistant
            </button>
          </span>
        </div>
      )}
      {assistant && <InterviewAssistant interview={assistant} onClose={() => setAssistant(null)} />}
    </>
  );
}
