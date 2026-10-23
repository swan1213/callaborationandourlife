"use client";

// Online / away / offline for every account (lib/presence.ts). The provider sends this tab's heartbeat every
// minute (with how long the person has been idle) and keeps everyone's status for the dots next to names.
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";
import { Avatar } from "./Avatar";

export type PresenceStatus = "online" | "away" | "offline";
type Person = { _id: string; name: string; role: string; avatar: string; status: PresenceStatus; lastSeenAt: string | null };

const HEARTBEAT_MS = 60_000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;

const PresenceContext = createContext<{ people: Person[]; byId: Map<string, Person> }>({ people: [], byId: new Map() });

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [people, setPeople] = useState<Person[]>([]);

  useEffect(() => {
    let lastInput = Date.now();
    let alive = true;
    const markInput = () => {
      lastInput = Date.now();
    };
    const beat = () =>
      fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idleMs: Date.now() - lastInput }),
        keepalive: true,
      }).catch(() => {});
    const load = () =>
      fetch("/api/presence", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => alive && d && setPeople(d.users))
        .catch(() => {});
    // Heartbeat first, so the list already shows this person as online.
    const tick = () => beat().then(load);

    INPUT_EVENTS.forEach((e) => window.addEventListener(e, markInput, { passive: true, capture: true }));
    // Back in the tab after a while: report it now instead of up to a minute later.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      markInput();
      tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    tick();
    const id = setInterval(tick, HEARTBEAT_MS);
    return () => {
      alive = false;
      clearInterval(id);
      INPUT_EVENTS.forEach((e) => window.removeEventListener(e, markInput, { capture: true }));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const value = useMemo(() => ({ people, byId: new Map(people.map((p) => [p._id, p])) }), [people]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export const usePresence = () => useContext(PresenceContext);

const LABEL: Record<PresenceStatus, string> = { online: "Online", away: "Away", offline: "Offline" };
const DOT: Record<PresenceStatus, string> = { online: "bg-emerald-500", away: "bg-amber-400", offline: "bg-slate-300" };

/** "5 min ago", "3 h ago", "2 days ago". */
export function ago(iso: string | null) {
  if (!iso) return "never";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

const describe = (p?: Person) => (!p ? "Offline" : p.status === "offline" ? `Offline · last seen ${ago(p.lastSeenAt)}` : LABEL[p.status]);

/** A small status dot (with the status as its title and accessible label). */
export function PresenceDot({ userId, className = "" }: { userId: string; className?: string }) {
  const p = usePresence().byId.get(userId);
  const status = p?.status ?? "offline";
  return <span role="img" aria-label={describe(p)} title={describe(p)} className={`inline-block size-2 shrink-0 rounded-full ${DOT[status]} ${className}`} />;
}

/** Dot + "Online" / "Away" / "Offline · 2 h ago": the status in words, never by color alone. */
export function PresenceLabel({ userId, className = "" }: { userId: string; className?: string }) {
  const p = usePresence().byId.get(userId);
  const status = p?.status ?? "offline";
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs whitespace-nowrap text-slate-500 ${className}`}>
      <PresenceDot userId={userId} />
      {status === "offline" ? <span>Offline{p?.lastSeenAt ? ` · ${ago(p.lastSeenAt)}` : ""}</span> : <span className="text-slate-700">{LABEL[status]}</span>}
    </span>
  );
}

/** An avatar with the status dot on its corner. */
export function PresenceAvatar({ userId, avatar, name, size = 28 }: { userId: string; avatar?: string | null; name: string; size?: number }) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar avatar={avatar} name={name} size={size} />
      <PresenceDot userId={userId} className="absolute -right-0.5 -bottom-0.5 ring-2 ring-white" />
    </span>
  );
}

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };
const ORDER: PresenceStatus[] = ["online", "away", "offline"];

/** Header button: how many accounts are online, and everyone's status in a list. */
export function OnlineMenu() {
  const { people } = usePresence();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const online = people.filter((p) => p.status === "online").length;
  const groups = ORDER.map((s) => ({ status: s, list: people.filter((p) => p.status === s) })).filter((g) => g.list.length);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="btn btn-ghost btn-sm gap-1.5 px-2"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Who is online"
      >
        <Users />
        <span className="inline-flex items-center gap-1 text-xs tabular-nums">
          <span className={`size-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-300"}`} aria-hidden />
          {online}
          <span className="sr-only"> online</span>
        </span>
      </button>
      {open && (
        <div role="dialog" aria-label="Who is online" className="popover absolute right-0 z-40 mt-2 w-72 animate-pop-in p-1.5">
          <div className="max-h-96 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.status} className="py-1">
                <div className="px-2 pb-1 text-[11px] font-medium text-slate-400">
                  {LABEL[g.status]} · {g.list.length}
                </div>
                <ul>
                  {g.list.map((p) => (
                    <li key={p._id} className="flex items-center gap-2.5 rounded-md px-2 py-1.5">
                      <PresenceAvatar userId={p._id} avatar={p.avatar} name={p.name} size={26} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-slate-900">{p.name}</span>
                        <span className="block text-[11px] text-slate-500">
                          {ROLE_LABEL[p.role] ?? p.role}
                          {p.status === "offline" && ` · last seen ${ago(p.lastSeenAt)}`}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {!people.length && <div className="px-2 py-3 text-[13px] text-slate-500">Loading…</div>}
          </div>
        </div>
      )}
    </div>
  );
}
