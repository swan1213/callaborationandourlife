"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-react";

export type Slide = { url: string; caption?: string };

/** Cloudinary transformation helper (keeps non-Cloudinary URLs unchanged). */
const sized = (url: string, t: string) => (url.includes("/upload/") ? url.replace("/upload/", `/upload/${t}/`) : url);

/** Full-screen screenshot slideshow: arrows / ← → keys, thumbnails, Esc or backdrop click to close. */
export default function Lightbox({ slides, start = 0, onClose }: { slides: Slide[]; start?: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(Math.max(start, 0), slides.length - 1));
  const [loaded, setLoaded] = useState(false);
  const n = slides.length;
  const go = useCallback((d: number) => {
    setLoaded(false);
    setI((x) => (x + d + n) % n);
  }, [n]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && n > 1) go(1);
      else if (e.key === "ArrowLeft" && n > 1) go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [go, n, onClose]);

  if (!n) return null;
  const slide = slides[i];

  return (
    <div className="fixed inset-0 z-[60] flex animate-fade-in flex-col bg-black/90 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Screenshot viewer" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2.5 text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 truncate">
          {slide.caption ? <span className="font-medium text-white">{slide.caption}</span> : null}
          {slide.caption ? <span className="mx-1.5 text-white/40">·</span> : null}
          <span className="tabular-nums text-white/60">
            {i + 1} / {n}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <a href={slide.url} target="_blank" rel="noreferrer" className="btn btn-sm text-white/80 hover:bg-white/10 hover:text-white">
            <ExternalLink />
            <span className="hidden sm:inline">Open original</span>
          </a>
          <button onClick={onClose} className="btn btn-icon text-white/80 hover:bg-white/10 hover:text-white" aria-label="Close">
            <X />
          </button>
        </div>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 py-4 sm:px-16">
        {!loaded && <div className="absolute size-7 animate-spin rounded-full border-2 border-white/25 border-t-white" />}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={slide.url}
          src={sized(slide.url, "c_limit,w_2000,h_2000,q_auto")}
          alt={`Screenshot ${i + 1} of ${n}`}
          onLoad={() => setLoaded(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full rounded-lg object-contain transition-opacity duration-200 ${loaded ? "opacity-100" : "opacity-0"}`}
        />
        {n > 1 && (
          <>
            <button
              onClick={(e) => (e.stopPropagation(), go(-1))}
              className="absolute left-2 grid size-10 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 sm:left-4"
              aria-label="Previous screenshot"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              onClick={(e) => (e.stopPropagation(), go(1))}
              className="absolute right-2 grid size-10 cursor-pointer place-items-center rounded-full border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/20 sm:right-4"
              aria-label="Next screenshot"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        )}
      </div>

      {n > 1 && (
        <div className="flex gap-2 overflow-x-auto border-t border-white/10 px-4 py-3 sm:justify-center" onClick={(e) => e.stopPropagation()}>
          {slides.map((s, j) => (
            <button
              key={s.url + j}
              onClick={() => (setLoaded(false), setI(j))}
              className={`shrink-0 cursor-pointer overflow-hidden rounded-md ring-2 transition ${j === i ? "ring-white" : "opacity-60 ring-transparent hover:opacity-100"}`}
              aria-label={`Show screenshot ${j + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sized(s.url, "c_fill,w_120,h_80")} alt="" className="h-14 w-20 object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
