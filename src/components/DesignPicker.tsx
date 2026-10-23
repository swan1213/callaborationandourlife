"use client";

import { Check } from "lucide-react";
import type { ResumeContent } from "@/lib/generate";
import { DESIGNS, atsSpec, lookOf, type DesignId } from "@/lib/designs";
import { AtsLetter, AtsResume } from "./ResumePreview";

const SAMPLE: ResumeContent = {
  fullName: "Alex Kim",
  headline: "Senior Software Engineer",
  contact: { location: "Austin, TX", phone: "", email: "alex@example.com", linkedin: "linkedin.com/in/alexkim", website: "" },
  summary: "Backend engineer with 8 years building payment systems in Go and Python.",
  skills: [
    { category: "Languages", items: ["Go", "Python", "TypeScript"] },
    { category: "Cloud", items: ["AWS", "Kubernetes", "Terraform"] },
  ],
  experience: [
    {
      company: "Bloom",
      title: "Senior Software Engineer",
      location: "Remote",
      startDate: "2021",
      endDate: "",
      bullets: ["Rebuilt checkout and cut failed payments by 30%", "Led a team of four through the move to Kubernetes"],
    },
  ],
  education: [{ university: "UT Austin", degree: "BSc", field: "Computer Science", startDate: "", endDate: "2016" }],
  certifications: [],
};

const SAMPLE_LETTER =
  "Dear Hiring Manager,\n\nI am excited to apply for the Senior Software Engineer role. Over the past eight years I have built payment systems that move millions of dollars a day.";

const SAMPLE_DATE = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/** Renders the design at full size and scales it into the card, so thumbnails always match the real preview. */
export function DesignThumb({ kind, id }: { kind: "resume" | "letter"; id: DesignId }) {
  const a = atsSpec(id);
  const SCALE = 0.42;
  return (
    <div className="pointer-events-none relative h-44 overflow-hidden rounded-md" style={{ background: "#fff" }}>
      <div style={{ width: `${100 / SCALE}%`, transform: `scale(${SCALE})`, transformOrigin: "top left", padding: 36, background: "#fff" }}>
        {kind === "resume" ? (
          <AtsResume r={SAMPLE} a={a} />
        ) : (
          <AtsLetter r={SAMPLE} a={a} date={SAMPLE_DATE} text={SAMPLE_LETTER} company="Bloom" jobTitle="Senior Software Engineer" />
        )}
      </div>
    </div>
  );
}

export default function DesignPicker({ kind, value, onChange }: { kind: "resume" | "letter"; value: string; onChange: (id: DesignId) => void }) {
  return (
    <div role="radiogroup" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {DESIGNS.map((x) => {
        // Retired designs are shown as the look they now render as.
        const selected = lookOf(value) === x.id;
        return (
          <button
            key={x.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(x.id)}
            className={`group relative flex cursor-pointer flex-col rounded-lg border bg-white p-2.5 text-left transition-[border-color,box-shadow] duration-150 ${
              selected ? "border-indigo-500 ring-[3px] ring-indigo-500/15" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="rounded-md ring-1 ring-slate-200">
              <DesignThumb kind={kind} id={x.id} />
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 px-0.5">
              <div className="truncate text-sm font-medium text-slate-900">{x.name}</div>
              <span
                aria-hidden
                className={`grid size-4 shrink-0 place-items-center rounded-full border transition-colors ${
                  selected ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300 bg-white group-hover:border-slate-400"
                }`}
              >
                {selected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
            </div>
            <div className="mt-0.5 px-0.5 text-[13px] leading-snug text-slate-500">{kind === "resume" ? x.resumeBlurb : x.letterBlurb}</div>
          </button>
        );
      })}
    </div>
  );
}
