"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { PROFILE_GROUPS, salaryText, type FieldDef } from "@/lib/profileFields";
import { Section } from "./ui";

type Exp = { company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; description?: string };
type Edu = { university: string; degree: string; field: string; startDate: string; endDate: string };

export type ProfileDetail = Record<string, unknown> & {
  label: string;
  fullName: string;
  summary: string;
  skills: string[];
  certifications: string[];
  experience: Exp[];
  education: Edu[];
};

function ym(v: string) {
  if (!v) return "";
  const [y, m] = v.split("-").map(Number);
  return m ? new Date(y, m - 1).toLocaleString("en-US", { month: "short", year: "numeric" }) : String(y);
}

export function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group h-full rounded-lg border border-slate-200 bg-white px-3 py-2 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs text-slate-500">{label}</div>
        {value && (
          <button
            type="button"
            className={`-my-1 -mr-1.5 inline-flex h-6 shrink-0 cursor-pointer [@media(hover:none)]:h-8 [@media(hover:none)]:px-2 items-center gap-1 rounded-md px-1.5 text-xs font-medium transition-[opacity,background-color,color] hover:bg-slate-100 focus-visible:opacity-100 ${
              copied ? "text-emerald-600 opacity-100" : "text-slate-500 opacity-0 group-hover:opacity-100 hover:text-slate-900 [@media(hover:none)]:opacity-100"
            }`}
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        )}
      </div>
      <div className={`mt-0.5 min-w-0 text-sm break-words whitespace-pre-line ${value ? "text-slate-900" : "text-slate-300"}`}>{value || "—"}</div>
    </div>
  );
}

/** Read-only profile sections with copy buttons (used by My Profiles and the admin profile view). */
export default function ProfileDetails({ p, showDescriptions = false }: { p: ProfileDetail; showDescriptions?: boolean }) {
  const str = (k: string) => (p[k] == null ? "" : String(p[k]));
  const value = (f: FieldDef) =>
    f.type === "salary" ? salaryText(p) : f.type === "checks" ? ((p[f.key] as string[] | undefined) ?? []).join(", ") : str(f.key);
  const none = <div className="rounded-lg border border-dashed border-slate-200 px-4 py-5 text-center text-[13px] text-slate-500">None</div>;
  return (
    <div className="space-y-6">
      {PROFILE_GROUPS.map((g) => (
        <Section key={g.title} title={g.title}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {g.fields
              .filter((f) => !f.showIf || str(f.showIf.key) === f.showIf.value)
              .map((f) => (
                <div key={f.key} className={(f.span ?? 1) > 1 ? "sm:col-span-2" : ""}>
                  <CopyValue label={f.label} value={value(f)} />
                </div>
              ))}
            {g.id === "personal" && <CopyValue label="Full Name" value={p.fullName} />}
            {g.id === "address" && <CopyValue label="Location on resume" value={str("location")} />}
          </div>
        </Section>
      ))}

      <Section title="Education">
        {!p.education?.length && none}
        <div className="divide-y divide-slate-200">
          {p.education?.map((e, i) => (
            <div key={i} className="grid gap-3 py-4 first:pt-0 last:pb-0 sm:grid-cols-2 lg:grid-cols-4">
              <CopyValue label="University" value={e.university} />
              <CopyValue label="Degree" value={e.degree} />
              <CopyValue label="Major" value={e.field} />
              <CopyValue label="Duration" value={[ym(e.startDate), ym(e.endDate)].filter(Boolean).join(" - ")} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Experience">
        {!p.experience?.length && none}
        <div className="divide-y divide-slate-200">
          {p.experience?.map((e, i) => (
            <div key={i} className="space-y-3 py-4 first:pt-0 last:pb-0">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <CopyValue label="Company" value={e.company} />
                <CopyValue label="Title" value={e.title} />
                <CopyValue label="Location" value={e.location} />
                <CopyValue label="Duration" value={[ym(e.startDate), e.current ? "Present" : ym(e.endDate)].filter(Boolean).join(" - ")} />
              </div>
              {showDescriptions && e.description && <CopyValue label="Responsibilities & achievements" value={e.description} />}
            </div>
          ))}
        </div>
      </Section>

      {(p.skills?.length > 0 || p.summary || p.certifications?.length > 0) && (
        <Section title="Summary & skills" bodyClassName="card-body space-y-3">
          {p.summary && <CopyValue label="Summary" value={p.summary} />}
          {p.skills?.length > 0 && <CopyValue label="Skills" value={p.skills.join(", ")} />}
          {p.certifications?.length > 0 && <CopyValue label="Certifications" value={p.certifications.join(", ")} />}
        </Section>
      )}
    </div>
  );
}
