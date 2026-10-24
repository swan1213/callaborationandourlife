"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChartNoAxesColumn,
  ChevronRight,
  ChevronsUpDown,
  CircleUser,
  FilePlus2,
  Files,
  FlaskConical,
  AudioLines,
  History,
  Timer,
  IdCard,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LayoutGrid,
  LifeBuoy,
  Link2,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  MessagesSquare,
  PanelLeft,
  Plug,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  SunMoon,
  SquareUser,
  TriangleAlert,
  Users,
  Workflow,
  X,
} from "lucide-react";
import ThemeToggle from "./ThemeToggle";
import { Avatar } from "./Avatar";
import { Logo } from "./Logo";
import { DEFAULT_TZ, setHomeTz, setInterviewTz, zoneName } from "@/lib/viewerTz";
import { NotificationBell, NotificationProvider } from "./Notifications";
import { OnlineMenu, PresenceProvider } from "./Presence";
import { ChatButton, ChatProvider } from "./Chat";
import { AlertsProvider } from "./Alerts";
import UpcomingInterviews from "./UpcomingInterviews";
import UpdatePrompt from "./UpdatePrompt";
import WhatsNew from "./WhatsNew";
import { HelpButton } from "./HelpGuide";
import type { IconType } from "./ui";
import { pageFor } from "@/lib/pageAccess";

const RoleContext = createContext<string>("bidder");
/** Current account's role ("admin" | "user" | "bidder" | "caller") for role-aware client pages. */
export const useRole = () => useContext(RoleContext);

type NavItem = { href: string; label: string; icon: IconType; exact?: boolean; adminOnly?: boolean };
type NavSection = { title: string; items: NavItem[] };

const USER_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard", label: "Generate", icon: Sparkles, exact: true },
  { href: "/dashboard/import", label: "Generate Resume", icon: FilePlus2 },
  { href: "/applications", label: "View Generated Resumes", icon: Files },
  { href: "/interviews", label: "Interview Requests", icon: CalendarClock },
  { href: "/profiles", label: "My Profiles", icon: SquareUser },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/help", label: "Help", icon: LifeBuoy },
  { href: "/me", label: "My Page", icon: CircleUser },
];

/** Pages bidders don't use (hidden from their menu; proxy.ts redirects them to Generate Resume). */
export const BIDDER_HIDDEN = ["/overview", "/feedback"];
/** Shown to a bidder only while an admin allows it (Users & Bidders → "Interview Requests page"). */
const BIDDER_INTERVIEWS = "/interviews";
/** Bidders see "My Profiles" under this name. */
const BIDDER_PROFILES_LABEL = "View Profile's Information";

const ADMIN_GENERAL: NavItem[] = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/admin/analytics", label: "Analytics", icon: ChartNoAxesColumn },
  { href: "/admin/work-time", label: "Work Time", icon: Timer, adminOnly: true },
];
const ADMIN_MANAGE: NavItem[] = [
  { href: "/admin/users", label: "Users & Bidders", icon: Users },
  { href: "/admin/profiles", label: "Profiles", icon: IdCard },
  { href: "/admin/assignments", label: "Assignments", icon: Workflow },
  { href: "/admin/applications", label: "Application History", icon: History },
  { href: "/admin/job-links", label: "Job Links", icon: Link2 },
  { href: "/admin/interviews", label: "Interviews (Schedule)", icon: CalendarDays },
  { href: "/interview-history", label: "Interview History", icon: AudioLines },
];
const ADMIN_SYSTEM: NavItem[] = [
  { href: "/admin/notifications", label: "Notifications", icon: Megaphone, adminOnly: true },
  { href: "/admin/feedback", label: "Feedback", icon: MessagesSquare, adminOnly: true },
  { href: "/admin/logs", label: "Logs", icon: ScrollText, adminOnly: true },
  { href: "/admin/keys", label: "API Keys", icon: KeyRound, adminOnly: true },
  { href: "/admin/api-access", label: "API Access", icon: Plug, adminOnly: true },
  { href: "/admin/prompt-test", label: "Test Generate Resume", icon: FlaskConical, adminOnly: true },
  { href: "/admin/page-access", label: "Page Access", icon: ShieldCheck, adminOnly: true },
  { href: "/admin/settings", label: "Settings", icon: Settings, adminOnly: true },
];

const CALLER_NAV: NavItem[] = [
  { href: "/caller/requests", label: "Interview Requests", icon: Inbox },
  { href: "/caller/schedule", label: "My Schedule", icon: CalendarDays },
  { href: "/interview-history", label: "Interview History", icon: AudioLines },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/help", label: "Help", icon: LifeBuoy },
  { href: "/profiles", label: "My Profiles", icon: SquareUser },
  { href: "/me", label: "My Page", icon: CircleUser },
];

/** The role's menu without the pages an admin turned off for it (Admin → Page Access). */
function navFor(role: string, interviewAccess: boolean, disabledPages: string[]): NavSection[] {
  const off = (i: NavItem) => disabledPages.includes(pageFor(i.href)?.key ?? "");
  return menuFor(role, interviewAccess)
    .map((s) => ({ ...s, items: s.items.filter((i) => !off(i)) }))
    .filter((s) => s.items.length);
}

function menuFor(role: string, interviewAccess: boolean): NavSection[] {
  if (role === "caller") return [{ title: "Menu", items: CALLER_NAV }];
  if (role === "bidder")
    return [
      {
        title: "Menu",
        items: USER_NAV.filter((i) => !BIDDER_HIDDEN.includes(i.href) && (interviewAccess || i.href !== BIDDER_INTERVIEWS)).map((i) =>
          i.href === "/profiles" ? { ...i, label: BIDDER_PROFILES_LABEL } : i,
        ),
      },
    ];
  const admin = role === "admin";
  return [
    { title: "General", items: ADMIN_GENERAL.filter((i) => admin || !i.adminOnly) },
    { title: "Manage", items: ADMIN_MANAGE },
    ...(admin ? [{ title: "System", items: ADMIN_SYSTEM }] : []),
    { title: "Workspace", items: USER_NAV },
  ];
}

const SIDEBAR_KEY = "tb-sidebar-hidden";
const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };

export default function AppShell({
  role,
  name,
  email,
  avatar = "",
  mustChangePassword = false,
  interviewAccess = true,
  disabledPages = [],
  timezone = DEFAULT_TZ,
  interviewTimezone = DEFAULT_TZ,
  children,
}: {
  role: string;
  name: string;
  email: string;
  avatar?: string;
  mustChangePassword?: boolean;
  interviewAccess?: boolean;
  /** Page keys an admin turned off for this role (lib/pageAccess.ts); hidden from the menu. */
  disabledPages?: string[];
  /** The account's own time zone (callers: theirs; others: the default GMT-04:00). */
  timezone?: string;
  /** Zone the interview pages open in (the account's own zone from My Page). */
  interviewTimezone?: string;
  children: ReactNode;
}) {
  if (typeof window !== "undefined") {
    setHomeTz(timezone);
    setInterviewTz(interviewTimezone);
  }
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false); // mobile drawer
  const [hidden, setHidden] = useState(false); // desktop sidebar
  const [ready, setReady] = useState(false); // skip the slide animation on first paint
  const [isDesktop, setIsDesktop] = useState(true); // the drawer applies below lg, the collapsible column at lg+

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Close the mobile drawer on navigation.
  useEffect(() => setOpen(false), [pathname]);

  const toggleSidebar = useCallback(() => {
    // Below lg the button opens the drawer instead.
    if (!window.matchMedia("(min-width: 1024px)").matches) return setOpen((o) => !o);
    setHidden((h) => {
      try {
        localStorage.setItem(SIDEBAR_KEY, h ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !h;
    });
  }, []);

  // Ctrl+B / ⌘B toggles the menu (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "b") {
        const el = e.target as HTMLElement | null;
        if (el?.closest("input, textarea, select, [contenteditable=true]")) return;
        e.preventDefault();
        toggleSidebar();
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar]);

  const sections = useMemo(() => navFor(role, interviewAccess, disabledPages), [role, interviewAccess, disabledPages]);
  const isActive = (item: NavItem) => (item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/"));

  // Breadcrumb: the section and the best-matching menu item; deeper pages add "Details".
  const crumb = useMemo(() => {
    let best: { section: string; item: NavItem } | null = null;
    for (const s of sections)
      for (const item of s.items)
        if ((item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/")) && (!best || item.href.length > best.item.href.length))
          best = { section: s.title, item };
    return best ? { ...best, deeper: pathname !== best.item.href } : null;
  }, [sections, pathname]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const anim = ready ? "transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]" : "";
  const toggleLabel = hidden ? "Show menu" : "Hide menu";

  return (
    <AlertsProvider>
    <NotificationProvider>
      <PresenceProvider>
      <ChatProvider>
      <div className="flex min-h-screen">
        {/* Mobile drawer backdrop */}
        {open && <div className="fixed inset-0 z-40 animate-fade-in bg-black/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}

        {/* Sidebar: a drawer below lg; a sticky column at lg+ that collapses to zero width. The inner panel keeps its width so nothing reflows mid-slide. */}
        <aside
          id="app-sidebar"
          aria-label="Main menu"
          inert={(isDesktop ? hidden : !open) ? true : undefined}
          className={`fixed inset-y-0 left-0 z-50 w-64 overflow-hidden border-r border-slate-200 bg-slate-50 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:shrink-0 lg:translate-x-0 ${anim} ${
            open ? "translate-x-0 shadow-2xl lg:shadow-none" : "-translate-x-full"
          } ${hidden ? "lg:w-0 lg:border-r-0" : "lg:w-60"}`}
        >
          <div className="flex h-full w-64 flex-col lg:w-60">
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Link href="/" aria-label="TailorBid home">
                <Logo size={26} />
              </Link>
              <button className="btn btn-ghost btn-sm btn-icon lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
                <X />
              </button>
            </div>

            <nav className="flex-1 space-y-5 overflow-y-auto px-3 pt-2 pb-4">
              {sections.map((s) => (
                <div key={s.title}>
                  <div className="mb-1 px-2 text-[11px] font-medium text-slate-400">{s.title}</div>
                  <ul className="space-y-px">
                    {s.items.map((item) => {
                      const active = isActive(item);
                      const Icon = item.icon;
                      return (
                        <li key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={`group flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] whitespace-nowrap transition-colors duration-100 ${
                              active
                                ? "bg-white font-medium text-slate-900 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_0_0_1px_var(--line)]"
                                : "text-slate-600 hover:bg-slate-200/50 hover:text-slate-900"
                            }`}
                          >
                            <Icon className={`size-4 shrink-0 ${active ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"}`} />
                            <span className="truncate">{item.label}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </nav>

            <div className="shrink-0 border-t border-slate-200 p-3">
              <UserMenu name={name} email={email} avatar={avatar} role={role} timezone={timezone} onLogout={logout} />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="page-bar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3 sm:px-5">
            <button
              type="button"
              onClick={toggleSidebar}
              className="btn btn-ghost btn-icon -ml-1"
              aria-label={toggleLabel}
              aria-expanded={open || !hidden}
              aria-controls="app-sidebar"
              title={`${toggleLabel} (Ctrl+B)`}
            >
              <PanelLeft className="hidden lg:block" />
              <Menu className="lg:hidden" />
            </button>
            <span aria-hidden className="h-5 w-px bg-slate-200" />
            <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 pl-1 text-[13px]">
              {crumb ? (
                <>
                  <span className="hidden text-slate-500 sm:inline">{crumb.section}</span>
                  <ChevronRight className="hidden size-3.5 shrink-0 text-slate-300 sm:block" />
                  {crumb.deeper ? (
                    <>
                      <Link href={crumb.item.href} className="truncate text-slate-500 transition-colors hover:text-slate-900">
                        {crumb.item.label}
                      </Link>
                      <ChevronRight className="size-3.5 shrink-0 text-slate-300" />
                      <span className="truncate font-medium text-slate-900">Details</span>
                    </>
                  ) : (
                    <span className="truncate font-medium text-slate-900">{crumb.item.label}</span>
                  )}
                </>
              ) : (
                <Logo size={22} className="lg:hidden" />
              )}
            </nav>
            <div className="flex items-center gap-0.5">
              <OnlineMenu />
              {!disabledPages.includes("chat") && <ChatButton />}
              <HelpButton role={role} />
              <NotificationBell />
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <UpcomingInterviews role={role} />
            {mustChangePassword && pathname !== "/me" && (
              <div className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <TriangleAlert className="size-4 shrink-0" />
                <span className="flex-1">You are signed in with a temporary password. Please choose your own password.</span>
                <Link href="/me" className="btn btn-secondary btn-sm">
                  Change password
                </Link>
              </div>
            )}
            <UpdatePrompt />
            <WhatsNew />
            <RoleContext.Provider value={role}>
              <div key={pathname} className="animate-page-in">
                {children}
              </div>
            </RoleContext.Provider>
          </main>
        </div>
      </div>
      </ChatProvider>
      </PresenceProvider>
    </NotificationProvider>
    </AlertsProvider>
  );
}

/** Account button at the foot of the sidebar; opens a menu with My Page, the theme switch and Sign out. */
function UserMenu({
  name,
  email,
  avatar,
  role,
  timezone,
  onLogout,
}: {
  name: string;
  email: string;
  avatar: string;
  role: string;
  timezone: string;
  onLogout: () => void;
}) {
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

  return (
    <div ref={ref} className="relative">
      {open && (
        <div role="menu" className="popover absolute right-0 bottom-full left-0 mb-2 animate-pop-in p-1.5">
          <div className="px-2 pt-1 pb-2">
            <div className="truncate text-[13px] font-medium">{name}</div>
            <div className="truncate text-xs text-slate-500">{email}</div>
            <div className="mt-1 text-[11px] text-slate-400">Times in {zoneName(timezone)}</div>
          </div>
          <div className="divider my-1" />
          <Link href="/me" role="menuitem" className="flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-slate-700 hover:bg-slate-100 hover:text-slate-900">
            <CircleUser className="size-4 text-slate-400" />
            My Page
          </Link>
          <div className="flex h-9 items-center justify-between gap-2 pr-0.5 pl-2">
            <span className="flex items-center gap-2.5 text-[13px] text-slate-700">
              <SunMoon className="size-4 text-slate-400" />
              Theme
            </span>
            <ThemeToggle compact />
          </div>
          <div className="divider my-1" />
          <button
            role="menuitem"
            onClick={onLogout}
            className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-[13px] text-slate-700 hover:bg-slate-100 hover:text-slate-900"
          >
            <LogOut className="size-4 text-slate-400" />
            Sign out
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex w-full cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-slate-200/50 ${open ? "bg-slate-200/50" : ""}`}
      >
        <Avatar avatar={avatar} name={name} size={30} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[13px] font-medium">{name}</span>
            {role !== "bidder" && <span className="chip shrink-0 px-1 py-0 text-[10px] font-medium">{ROLE_LABEL[role] ?? role}</span>}
          </span>
          <span className="block truncate text-xs text-slate-500">{email}</span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-slate-400" />
      </button>
    </div>
  );
}
