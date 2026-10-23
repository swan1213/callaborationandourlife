"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Rocket, Search } from "lucide-react";
import { useRole } from "@/components/AppShell";
import { GuideSteps } from "@/components/HelpGuide";
import { GETTING_STARTED, HELP_PAGES, pagesFor, ROLE_INTRO, ROLE_TITLE, type HelpRole } from "@/lib/helpContent";
import { EmptyState, PageHeader } from "@/components/ui";

const ROLES: HelpRole[] = ["bidder", "caller", "user", "admin"];

export default function HelpPage() {
  const myRole = useRole();
  const mine: HelpRole = myRole === "admin" || myRole === "user" || myRole === "caller" ? myRole : "bidder";
  // Admins can read every role's guide; others see their own.
  const allowed = mine === "admin" ? ROLES : [mine];
  const [role, setRole] = useState<HelpRole>(mine);
  const [q, setQ] = useState("");
  useEffect(() => setRole(mine), [mine]);

  const pages = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pagesFor(role).filter(
      (p) => !needle || [p.title, p.summary, ...p.steps.flatMap((s) => [s.title, s.detail]), ...(p.tips ?? [])].some((t) => t.toLowerCase().includes(needle))
    );
  }, [role, q]);

  // Jump to #section after navigating from the "?" panel.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && HELP_PAGES.some((p) => p.id === id)) setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, []);

  const tocLink = "block rounded-md px-2.5 py-1.5 text-[13px] transition-colors hover:bg-slate-100 hover:text-slate-900";

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Help guide" subtitle="Step-by-step instructions for every page. Tip: the ? button in the top bar opens the guide for the page you're on." />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        {allowed.length > 1 && (
          <div className="segmented max-w-full overflow-x-auto" role="tablist" aria-label="Role">
            {allowed.map((r) => (
              <button key={r} type="button" role="tab" aria-selected={role === r} onClick={() => setRole(r)}>
                {ROLE_TITLE[r]}
              </button>
            ))}
          </div>
        )}
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search the guide" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the guide" />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[14rem_1fr] lg:gap-8">
        {/* Contents */}
        <nav
          className="min-w-0 self-start lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
          aria-label="Guide contents"
        >
          <div className="mb-2 text-[13px] font-medium text-slate-500 lg:px-2.5">{ROLE_TITLE[role]}</div>
          <div className="flex snap-x gap-1.5 overflow-x-auto pb-1 lg:block lg:space-y-0.5 lg:overflow-visible lg:border-l lg:border-slate-200 lg:pb-0 lg:pl-2 [&>a]:shrink-0 [&>a]:snap-start [&>a]:whitespace-nowrap [&>a]:border [&>a]:border-slate-200 [&>a]:bg-surface lg:[&>a]:border-0 lg:[&>a]:bg-transparent lg:[&>a]:whitespace-normal">
            <a href="#getting-started" className={`${tocLink} ${q ? "text-slate-300" : "text-slate-600"}`}>
              Getting started
            </a>
            {pagesFor(role).map((p) => (
              <a key={p.id} href={`#${p.id}`} className={`${tocLink} ${pages.includes(p) ? "text-slate-600" : "text-slate-300"}`}>
                {p.title}
              </a>
            ))}
          </div>
        </nav>

        <div className="min-w-0 space-y-6">
          {!q && (
            <section id="getting-started" className="card scroll-mt-20 p-0">
              <div className="card-header">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
                    <Rocket className="size-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-indigo-600">{ROLE_TITLE[role]}</div>
                    <h2 className="text-base font-semibold tracking-tight text-slate-900">Getting started</h2>
                  </div>
                </div>
              </div>
              <div className="card-body">
                <p className="mb-6 max-w-prose text-sm leading-relaxed text-slate-600">{ROLE_INTRO[role]}</p>
                <GuideSteps page={{ id: "start", title: "", path: "", match: [], roles: [], summary: "", steps: GETTING_STARTED[role] }} />
              </div>
            </section>
          )}
          {pages.map((p) => (
            <section key={p.id} id={p.id} className="card scroll-mt-20 p-0">
              <div className="card-header items-start">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold tracking-tight text-slate-900">{p.title}</h2>
                  <p className="mt-0.5 max-w-prose text-[13px] leading-relaxed text-slate-500">{p.summary}</p>
                </div>
                {p.path && p.id !== "application-detail" && p.id !== "help" && (
                  <Link href={p.path} className="btn btn-secondary btn-sm">
                    Open page
                    <ArrowUpRight />
                  </Link>
                )}
              </div>
              <div className="card-body">
                <GuideSteps page={p} />
              </div>
            </section>
          ))}
          {!pages.length && (
            <div className="card p-0">
              <EmptyState icon={Search} title={`Nothing in the ${ROLE_TITLE[role]} guide matches “${q}”.`} description="Try a different word, or clear the search." />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
