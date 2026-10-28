"use client";

import { useMemo } from "react";
import { jobBlocks } from "@/lib/jobText";

/** The job posting laid out: title with its facts, section headings, bullet lists and paragraphs. */
export function JobDescriptionView({ text, className = "" }: { text: string; className?: string }) {
  const blocks = useMemo(() => jobBlocks(text), [text]);
  if (!blocks.length) return <p className={`text-sm text-slate-500 ${className}`}>No job description saved.</p>;
  return (
    <div className={`max-w-3xl space-y-3 text-sm leading-relaxed break-words text-slate-700 ${className}`}>
      {blocks.map((b, i) =>
        b.kind === "title" ? (
          <div key={i} className="pb-1">
            <h3 className="text-base font-semibold text-slate-900">{b.text}</h3>
            {b.facts.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {b.facts.map((f, j) => (
                  <span key={j} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {f}
                  </span>
                ))}
              </div>
            )}
          </div>
        ) : b.kind === "heading" ? (
          <h4 key={i} className="border-b border-slate-200 pt-3 pb-1 text-[0.95rem] font-semibold text-slate-900">
            {b.text}
          </h4>
        ) : b.kind === "bullets" ? (
          <ul key={i} className="list-disc space-y-1 pl-5 marker:text-slate-400">
            {b.items.map((it, j) => (
              <li key={j}>{it}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.text}</p>
        ),
      )}
    </div>
  );
}
