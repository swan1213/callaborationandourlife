"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Lightbulb, X } from "lucide-react";
import Lightbox from "./Lightbox";
import { helpForPath, stepImage, type HelpPage, type HelpRole } from "@/lib/helpContent";

/** Numbered steps (and tips) of one page guide. */
export function GuideSteps({ page, compact }: { page: HelpPage; compact?: boolean }) {
  const [zoom, setZoom] = useState<number | null>(null);
  const [broken, setBroken] = useState<Set<number>>(new Set());
  const images = page.steps.map((s, i) => stepImage(page, s, i));
  const slides = images.map((url, i) => ({ url: url ?? "", caption: `Step ${i + 1}: ${page.steps[i].title}` })).filter((x) => x.url);
  return (
    <div>
      <ol className={compact ? "space-y-4" : "space-y-6"}>
        {page.steps.map((s, i) => {
          const img = images[i];
          const last = i === page.steps.length - 1;
          return (
            <li key={i} className="relative flex gap-3">
              {!last && <span aria-hidden className={`absolute top-7 left-3 w-px bg-slate-200 ${compact ? "-bottom-3" : "-bottom-5"}`} />}
              <span className="relative grid size-6 shrink-0 place-items-center rounded-full border border-slate-200 bg-surface text-xs font-semibold text-slate-600 tabular-nums">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="block text-sm font-medium text-slate-900">{s.title}</span>
                <span className={`mt-0.5 block leading-relaxed text-slate-600 ${compact ? "text-[13px]" : "text-sm"}`}>{s.detail}</span>
                {img && !broken.has(i) && (
                  <button
                    type="button"
                    className="group mt-3 block w-full cursor-zoom-in overflow-hidden rounded-lg border border-slate-200 bg-slate-50 text-left transition-colors hover:border-slate-300"
                    style={{ maxWidth: compact ? "100%" : 640 }}
                    onClick={() => setZoom(slides.findIndex((x) => x.url === img))}
                    aria-label={`Enlarge screenshot for step ${i + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img}
                      alt={`Screenshot: ${s.title}`}
                      loading="lazy"
                      className="block h-auto w-full transition group-hover:opacity-95"
                      onError={() => setBroken((b) => new Set(b).add(i))}
                    />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {!!page.tips?.length && (
        <div className={`flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3.5 ${compact ? "mt-5" : "mt-6"}`}>
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <div className="min-w-0">
            <div className="mb-1 text-[13px] font-medium text-slate-900">Good to know</div>
            <ul className={`list-disc space-y-1 pl-4 leading-relaxed text-slate-600 marker:text-slate-400 ${compact ? "text-[13px]" : "text-sm"}`}>
              {page.tips.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {zoom !== null && zoom >= 0 && <Lightbox slides={slides} start={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

const roleOf = (role: string): HelpRole => (role === "admin" || role === "user" || role === "caller" ? role : "bidder");

/** "?" button: opens a side panel with the guide for the current page. */
export function HelpButton({ role }: { role: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const page = helpForPath(pathname, roleOf(role));

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Help for this page"
        aria-expanded={open}
        title="Help for this page"
        className={`btn btn-ghost btn-icon ${open ? "bg-slate-100 text-slate-900" : ""}`}
      >
        <CircleHelp />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[65]" onMouseDown={() => setOpen(false)}>
            <div className="absolute inset-0 animate-fade-in bg-black/30" />
            <aside
              ref={panel}
              tabIndex={-1}
              role="dialog"
              aria-label="Help"
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute top-0 right-0 flex h-full w-full max-w-md animate-fade-in flex-col border-l border-slate-200 bg-white shadow-2xl outline-none"
            >
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <div className="section-label">Help</div>
                  <h2 className="mt-0.5 text-base font-semibold">{page?.title ?? "TailorBid help"}</h2>
                </div>
                <button className="btn btn-ghost btn-icon -mt-1 -mr-2" onClick={() => setOpen(false)} aria-label="Close help">
                  <X />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5">
                {page ? (
                  <>
                    <p className="mb-4 text-sm text-slate-600">{page.summary}</p>
                    <GuideSteps page={page} compact />
                  </>
                ) : (
                  <p className="text-sm text-slate-600">There is no specific guide for this page yet. Open the full guide to browse every page.</p>
                )}
              </div>
              <div className="border-t border-slate-200 px-4 py-3 sm:px-5">
                <Link href={page ? `/help#${page.id}` : "/help"} className="btn btn-secondary w-full justify-center" onClick={() => setOpen(false)}>
                  Open the full help guide
                </Link>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  );
}
