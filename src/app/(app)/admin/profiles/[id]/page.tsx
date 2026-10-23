"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useState, type ReactNode } from "react";
import { useRole } from "@/components/AppShell";
import { useConfirm, useToast } from "@/components/Alerts";
import ResumeImport, { type ExtractedProfile, type ResumeReference } from "@/components/ResumeImport";
import ModelInput from "@/components/ModelInput";
import DesignPicker from "@/components/DesignPicker";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Alert, api, PageHeader, Spinner, PageSkeleton, useAsync } from "@/components/ui";
import { PROFILE_DEFAULTS, PROFILE_GROUP_TEXT_KEYS, PROFILE_GROUPS, SALARY_CURRENCIES, SALARY_PERIODS, selectOptions, type FieldDef } from "@/lib/profileFields";
import { DEFAULT_DESIGN } from "@/lib/designs";

type Exp = { company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; description: string };
type Edu = { university: string; degree: string; field: string; startDate: string; endDate: string };

type Form = {
  label: string;
  /** Application-form fields from PROFILE_GROUPS plus the resume overrides and salary units. */
  info: Record<string, string>;
  workSetup: string[];
  about: string;
  resumeReference: string;
  resumeReferenceName: string;
  /** "Belongs to user": managing user id, "" = none (admin). */
  manager: string;
  summary: string;
  skills: string;
  certifications: string;
  experience: Exp[];
  education: Edu[];
  apiKey: string;
  openaiModel: string;
  monthlyQuota: string;
  active: boolean;
  /** "" = use the global setting */
  companyCooldownDays: string;
  resumeDesign: string;
  coverLetterDesign: string;
};

type KeyOpt = { _id: string; label: string; keyMask: string; model: string; active: boolean; isDefault: boolean };
type UserOpt = { _id: string; name: string; email: string };

const INFO_KEYS = ["fullName", "location", "salaryCurrency", "salaryPeriod", ...PROFILE_GROUP_TEXT_KEYS];

/** Base for both new and loaded profiles: no application-form defaults here, so blank fields of existing profiles stay blank. */
const EMPTY: Form = {
  label: "",
  info: { salaryCurrency: "USD", salaryPeriod: "year" },
  workSetup: [],
  about: "",
  resumeReference: "",
  resumeReferenceName: "",
  manager: "",
  summary: "",
  skills: "",
  certifications: "",
  experience: [],
  education: [],
  apiKey: "",
  openaiModel: "",
  monthlyQuota: "0",
  active: true,
  companyCooldownDays: "",
  resumeDesign: DEFAULT_DESIGN,
  coverLetterDesign: DEFAULT_DESIGN,
};
/** A new profile starts with the usual application-form answers filled in (lib/profileFields.ts PROFILE_DEFAULTS). */
const NEW_PROFILE: Form = { ...EMPTY, info: { ...EMPTY.info, ...PROFILE_DEFAULTS } };
const NEW_EXP: Exp = { company: "", title: "", location: "", startDate: "", endDate: "", current: false, description: "" };
const NEW_EDU: Edu = { university: "", degree: "", field: "", startDate: "", endDate: "" };

const SECTIONS = [
  ...PROFILE_GROUPS.map((g) => ({ id: g.id, title: g.id === "selfid" ? "Self-identification" : g.title })),
  { id: "about", title: "About this developer" },
  { id: "resume", title: "Resume content" },
  { id: "design", title: "Design" },
  { id: "settings", title: "Settings" },
];

const COLS = { 2: "md:grid-cols-2", 3: "md:grid-cols-3" } as const;
const SPAN: Record<number, string> = { 2: "md:col-span-2", 3: "md:col-span-3" };
const YM = { type: "text", inputMode: "numeric", placeholder: "YYYY-MM or YYYY", pattern: "\\d{4}(-(0[1-9]|1[0-2]))?", title: "YYYY-MM or YYYY, e.g. 2021-03" } as const;

function move<T>(arr: T[], i: number, d: number) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return arr;
  const copy = [...arr];
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

/** A titled card (title + optional hint in the header) that the sticky section nav can jump to. */
function Section({ id, title, hint, children }: { id: string; title: string; hint?: string; children: ReactNode }) {
  return (
    <section id={id} className="card min-w-0 scroll-mt-32 p-0">
      <div className="card-header">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {hint && <p className="card-description first-letter:uppercase">{hint}</p>}
        </div>
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** Small heading for a sub-group inside a section (e.g. Experience, Education). */
function SubHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-slate-900">{title}</h3>
      {action}
    </div>
  );
}

export default function ProfileEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === "new";
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [form, setForm] = useState<Form>(isNew ? NEW_PROFILE : EMPTY);
  const [savedManager, setSavedManager] = useState("");
  const isAdmin = useRole() === "admin";
  const keys = useAsync(
    () => (isAdmin ? api<{ keys: KeyOpt[] }>("/api/admin/keys").then((r) => r.keys) : Promise.resolve([] as KeyOpt[])),
    [isAdmin]
  );
  const managers = useAsync(
    () => (isAdmin ? api<{ users: UserOpt[] }>("/api/admin/users?role=user").then((r) => r.users) : Promise.resolve([] as UserOpt[])),
    [isAdmin]
  );
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    type Loaded = Record<string, unknown> & {
      label: string;
      active: boolean;
      skills: string[];
      certifications: string[];
      experience: Exp[];
      education: Edu[];
      workSetup?: string[];
      managers?: string[];
    };
    api<{ profile: Loaded }>(`/api/admin/profiles/${id}`)
      .then(({ profile: p }) => {
        const str = (k: string) => (p[k] == null ? "" : String(p[k]));
        const manager = p.managers?.[0] ?? "";
        setSavedManager(manager);
        setForm({
          ...EMPTY,
          label: p.label,
          summary: str("summary"),
          about: str("about"),
          resumeReference: str("resumeReference"),
          resumeReferenceName: str("resumeReferenceName"),
          manager,
          apiKey: str("apiKey"),
          openaiModel: str("openaiModel"),
          active: p.active,
          resumeDesign: str("resumeDesign") || DEFAULT_DESIGN,
          coverLetterDesign: str("coverLetterDesign") || DEFAULT_DESIGN,
          info: { ...EMPTY.info, ...Object.fromEntries(INFO_KEYS.filter((k) => p[k] != null && p[k] !== "").map((k) => [k, str(k)])) },
          workSetup: p.workSetup ?? [],
          skills: (p.skills ?? []).join(", "),
          certifications: (p.certifications ?? []).join("\n"),
          monthlyQuota: String(p.monthlyQuota ?? 0),
          companyCooldownDays: p.companyCooldownDays == null ? "" : String(p.companyCooldownDays),
          experience: (p.experience ?? []).map((e) => ({ ...NEW_EXP, ...e })),
          education: (p.education ?? []).map((e) => ({ ...NEW_EDU, ...e })),
        });
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setInfo = (k: string, v: string) => setForm((f) => ({ ...f, info: { ...f.info, [k]: v } }));
  const setExp = (i: number, patch: Partial<Exp>) => set("experience", form.experience.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  const setEdu = (i: number, patch: Partial<Edu>) => set("education", form.education.map((e, j) => (j === i ? { ...e, ...patch } : e)));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const { info, manager, ...rest } = form;
    const body: Record<string, unknown> = {
      ...rest,
      ...info,
      monthlyQuota: Number(form.monthlyQuota),
      companyCooldownDays: form.companyCooldownDays === "" ? null : Number(form.companyCooldownDays),
    };
    if (!isAdmin) for (const k of ["apiKey", "openaiModel", "monthlyQuota", "active"]) delete body[k];
    // Only send the owner when it changed, so profiles shared by several managers aren't reassigned by accident.
    if (isAdmin && (isNew || manager !== savedManager)) body.manager = manager;
    try {
      if (isNew) {
        const r = await api<{ id: string }>("/api/admin/profiles", { method: "POST", json: body });
        router.replace(`/admin/profiles/${r.id}`);
      } else {
        await api(`/api/admin/profiles/${id}`, { method: "PATCH", json: body });
        setSavedManager(manager);
        toast.success("Profile saved");
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (
      !(await confirm({
        title: "Delete this profile?",
        message: `${form.label ? `"${form.label}"` : "This profile"} will be deleted permanently. This cannot be undone.`,
        confirmLabel: "Delete profile",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/profiles/${id}`, { method: "DELETE" });
      toast.success(form.label ? `${form.label} deleted` : "Profile deleted");
      router.replace("/admin/profiles");
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  if (loading) return <PageSkeleton variant="form" />;

  /** Merge AI-extracted resume data (non-empty values replace current ones) and keep the resume as the reference. */
  function applyExtracted(p: ExtractedProfile, ref: ResumeReference) {
    setForm((f) => {
      const info = { ...f.info };
      for (const [k, v] of Object.entries(p)) if (typeof v === "string" && v && INFO_KEYS.includes(k)) info[k] = v;
      return {
        ...f,
        info,
        resumeReference: ref.text || f.resumeReference,
        resumeReferenceName: ref.text ? ref.fileName : f.resumeReferenceName,
        summary: (p.summary as string) || f.summary,
        skills: p.skills?.length ? p.skills.join(", ") : f.skills,
        certifications: p.certifications?.length ? p.certifications.join("\n") : f.certifications,
        experience: p.experience?.length ? p.experience.map((e) => ({ ...NEW_EXP, ...(e as Partial<Exp>) })) : f.experience,
        education: p.education?.length ? p.education.map((e) => ({ ...NEW_EDU, ...(e as Partial<Edu>) })) : f.education,
      };
    });
  }

  const textInput = (k: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}, className = "") => (
    <div key={k} className={className}>
      <label className="label">{label}</label>
      <input className="input" value={form.info[k] ?? ""} onChange={(e) => setInfo(k, e.target.value)} {...props} />
    </div>
  );

  function field(f: FieldDef) {
    if (f.showIf && form.info[f.showIf.key] !== f.showIf.value) return null;
    const span = SPAN[f.span ?? 1] ?? "";
    const label = f.label + (f.required ? " *" : "");
    const value = form.info[f.key] ?? "";
    if (f.type === "select")
      return (
        <div key={f.key} className={span}>
          <label className="label">{label}</label>
          <select className="input" value={value} onChange={(e) => setInfo(f.key, e.target.value)}>
            <option value="">{f.emptyLabel ?? "Not set"}</option>
            {selectOptions(f, value).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    if (f.type === "checks")
      return (
        <div key={f.key} className={`flex flex-wrap items-center gap-x-5 gap-y-2 ${span}`}>
          <span className="text-[13px] font-medium text-slate-700">{label}</span>
          {f.options?.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                className="size-4 rounded"
                checked={form.workSetup.includes(o.value)}
                onChange={(e) => set("workSetup", e.target.checked ? [...form.workSetup, o.value] : form.workSetup.filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    if (f.type === "salary")
      return (
        <div key={f.key} className={span}>
          <label className="label">{label}</label>
          <div className="flex flex-wrap items-center gap-3">
            <input className="input w-full sm:w-48" inputMode="numeric" placeholder={f.placeholder} value={value} onChange={(e) => setInfo(f.key, e.target.value)} />
            <select className="input w-auto" aria-label="Currency" value={form.info.salaryCurrency || "USD"} onChange={(e) => setInfo("salaryCurrency", e.target.value)}>
              {SALARY_CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <span className="text-sm text-slate-500">per</span>
            <select className="input w-auto" aria-label="Period" value={form.info.salaryPeriod || "year"} onChange={(e) => setInfo("salaryPeriod", e.target.value)}>
              {SALARY_PERIODS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </div>
        </div>
      );
    return textInput(
      f.key,
      label,
      {
        // URL fields accept "linkedin.com/in/x" (normalised on save) instead of the browser's strict URL check.
        type: f.type === "url" ? "text" : f.type ?? "text",
        inputMode: f.type === "url" ? "url" : undefined,
        placeholder: f.placeholder,
        required: f.required,
      },
      span
    );
  }

  const fullNamePlaceholder = [form.info.firstName, form.info.lastName].filter(Boolean).join(" ");
  const locationPlaceholder = [form.info.city, form.info.state].filter(Boolean).join(", ");

  return (
    <form
      onSubmit={save}
      onInvalidCapture={(e) => {
        // The save bar is fixed at the bottom, so surface the first invalid field there too.
        const el = e.target as HTMLInputElement;
        const label = el.closest("div")?.querySelector("label")?.textContent?.replace(/\s*\*$/, "") || el.name || "a required field";
        setError(`Please fix "${label}": ${el.validationMessage}`);
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="mx-auto max-w-5xl"
    >
      <PageHeader
        back={{ href: "/admin/profiles", label: "Back to profiles" }}
        title={isNew ? "New profile" : form.label || "Edit profile"}
        actions={
          isAdmin &&
          !isNew && (
            <button type="button" className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={remove}>
              <Trash2 />
              Delete
            </button>
          )
        }
      />

      <nav
        aria-label="Profile sections"
        className="page-bar sticky top-14 z-20 -mx-2 mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 px-0.5 py-2"
      >
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="inline-flex h-7 shrink-0 items-center rounded-md px-2.5 text-[13px] font-medium whitespace-nowrap text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            {s.title}
          </a>
        ))}
      </nav>

      <div className="space-y-6">
        {PROFILE_GROUPS.map((g) => (
          <Section key={g.id} id={g.id} title={g.title} hint={g.hint}>
            <div className={`grid gap-x-5 gap-y-4 ${COLS[g.cols]}`}>
              {g.fields.map(field)}
              {g.id === "personal" &&
                textInput("fullName", "Name on resume", { placeholder: fullNamePlaceholder || "Defaults to first + last name" }, "md:col-span-2")}
              {g.id === "personal" && isAdmin && (
                <div className="md:col-span-3">
                  <label className="label">Belongs to user</label>
                  <select className="input" value={form.manager} onChange={(e) => set("manager", e.target.value)}>
                    <option value="">admin (you)</option>
                    {managers.data?.map((u) => (
                      <option key={u._id} value={u._id}>
                        {u.name} · {u.email}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {g.id === "address" && textInput("location", "Location shown on resume", { placeholder: locationPlaceholder || "Defaults to City, State" })}
            </div>
          </Section>
        ))}

        <Section id="about" title="About this developer" hint="the AI reads this with the resume content below and the job post">
          <div className="space-y-5">
            <textarea
              className="input min-h-80"
              value={form.about}
              onChange={(e) => set("about", e.target.value)}
              placeholder={
                "Write about this developer in your own words. The AI uses this alongside the resume content below, so put in anything a resume needs, for example:\n\n" +
                "• Work history: what they built and what changed because of it (numbers help)\n" +
                "• Skills and tools: languages, frameworks, cloud, databases\n" +
                "• Projects, certifications, spoken languages\n" +
                "• How their resumes should read: tone, length, what to put first"
              }
            />
            <ResumeImport
              onExtracted={applyExtracted}
              referenceName={form.resumeReference ? form.resumeReferenceName || "Imported resume" : ""}
              onRemoveReference={() => setForm((f) => ({ ...f, resumeReference: "", resumeReferenceName: "" }))}
            />
          </div>
        </Section>

        <Section id="resume" title="Resume content" hint="titles, companies and dates are copied onto every resume exactly">
          <div className="space-y-5">
            <div>
              <label className="label">Base summary</label>
              <textarea className="input min-h-24" value={form.summary} onChange={(e) => set("summary", e.target.value)} />
            </div>
            <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
              <div>
                <label className="label">Skills (comma or newline separated)</label>
                <textarea className="input min-h-20" value={form.skills} onChange={(e) => set("skills", e.target.value)} />
              </div>
              <div>
                <label className="label">Certifications (one per line)</label>
                <textarea className="input min-h-20" value={form.certifications} onChange={(e) => set("certifications", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="divider my-6" />

          <div className="space-y-3">
            <SubHeading
              title="Experience (most recent first)"
              action={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => set("experience", [...form.experience, { ...NEW_EXP }])}>
                  <Plus />
                  Add experience
                </button>
              }
            />
            {!form.experience.length && (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500">No experience yet.</div>
            )}
            {form.experience.map((e, i) => (
              <div key={i} className="rounded-lg border border-slate-200">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 py-1.5 pr-1.5 pl-4">
                  <div className="min-w-0 truncate text-[13px] font-medium text-slate-700">
                    <span className="mr-2 text-slate-400 tabular-nums">{i + 1}</span>
                    {[e.title, e.company].filter(Boolean).join(" · ") || "New role"}
                  </div>
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Move up" title="Move up" onClick={() => set("experience", move(form.experience, i, -1))}>
                      <ArrowUp />
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Move down" title="Move down" onClick={() => set("experience", move(form.experience, i, 1))}>
                      <ArrowDown />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => set("experience", form.experience.filter((_, j) => j !== i))}
                    >
                      <Trash2 />
                      Remove
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-4 p-4 md:grid-cols-3">
                  <div className="col-span-2 md:col-span-1">
                    <label className="label">Company *</label>
                    <input className="input" required value={e.company} onChange={(ev) => setExp(i, { company: ev.target.value })} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="label">Title</label>
                    <input className="input" value={e.title} onChange={(ev) => setExp(i, { title: ev.target.value })} />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <label className="label">Location</label>
                    <input className="input" value={e.location} onChange={(ev) => setExp(i, { location: ev.target.value })} />
                  </div>
                  <div>
                    <label className="label">Start</label>
                    <input className="input" {...YM} value={e.startDate} onChange={(ev) => setExp(i, { startDate: ev.target.value })} />
                  </div>
                  <div>
                    <label className="label">End</label>
                    <input className="input" {...YM} value={e.endDate} disabled={e.current} onChange={(ev) => setExp(i, { endDate: ev.target.value })} />
                  </div>
                  <label className="col-span-2 flex cursor-pointer items-center gap-2 self-end text-sm text-slate-700 md:col-span-1 md:pb-2">
                    <input type="checkbox" className="size-4 rounded" checked={e.current} onChange={(ev) => setExp(i, { current: ev.target.checked, endDate: "" })} /> Current role
                  </label>
                  <div className="col-span-2 md:col-span-3">
                    <label className="label">Responsibilities & achievements (the AI rewrites these per job)</label>
                    <textarea className="input min-h-28" value={e.description} onChange={(ev) => setExp(i, { description: ev.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="divider my-6" />

          <div className="space-y-3">
            <SubHeading
              title="Education"
              action={
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => set("education", [...form.education, { ...NEW_EDU }])}>
                  <Plus />
                  Add education
                </button>
              }
            />
            {!form.education.length && (
              <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500">No education yet.</div>
            )}
            {form.education.map((e, i) => (
              <div key={i} className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-slate-200 p-4 md:grid-cols-5">
                <div className="col-span-2">
                  <label className="label">University *</label>
                  <input className="input" required value={e.university} onChange={(ev) => setEdu(i, { university: ev.target.value })} />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="label">Degree</label>
                  <input className="input" placeholder="B.S." value={e.degree} onChange={(ev) => setEdu(i, { degree: ev.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="label">Major</label>
                  <input className="input" value={e.field} onChange={(ev) => setEdu(i, { field: ev.target.value })} />
                </div>
                <div>
                  <label className="label">Start</label>
                  <input className="input" {...YM} value={e.startDate} onChange={(ev) => setEdu(i, { startDate: ev.target.value })} />
                </div>
                <div>
                  <label className="label">End</label>
                  <input className="input" {...YM} value={e.endDate} onChange={(ev) => setEdu(i, { endDate: ev.target.value })} />
                </div>
                <div className="col-span-2 flex items-end justify-end md:col-span-3">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    onClick={() => set("education", form.education.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section id="design" title="Design" hint="used for every new resume and cover letter; earlier applications keep their design">
          <div className="space-y-6">
            <div>
              <h3 className="mb-3 text-[13px] font-semibold text-slate-900">Resume design</h3>
              <DesignPicker kind="resume" value={form.resumeDesign} onChange={(v) => set("resumeDesign", v)} />
            </div>
            <div className="divider" />
            <div>
              <h3 className="mb-3 text-[13px] font-semibold text-slate-900">Cover letter design</h3>
              <DesignPicker kind="letter" value={form.coverLetterDesign} onChange={(v) => set("coverLetterDesign", v)} />
            </div>
          </div>
        </Section>

        <Section id="settings" title="Settings">
          <div className="grid gap-x-5 gap-y-4 md:grid-cols-2">
            <div>
              <label className="label">Internal label (shown to users)</label>
              <input className="input" placeholder={form.info.fullName || fullNamePlaceholder || "Defaults to the name on the resume"} value={form.label} onChange={(e) => set("label", e.target.value)} />
            </div>
            <div>
              <label className="label">Same-company cooldown (days)</label>
              <input
                className="input"
                type="number"
                min={0}
                max={365}
                step={1}
                placeholder="Use global setting"
                value={form.companyCooldownDays}
                onChange={(e) => set("companyCooldownDays", e.target.value)}
              />
              <div className="hint">Blocks re-applying to the same company within this many days. Blank = global setting, 0 = off.</div>
            </div>
            {isAdmin && (
              <>
                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-medium text-slate-800 md:col-span-2">
                  <input type="checkbox" className="size-4 rounded" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active (available for generation)
                </label>
                <div>
                  <label className="label">OpenAI API key</label>
                  <select className="input" value={form.apiKey} onChange={(e) => set("apiKey", e.target.value)}>
                    <option value="">Default key{keys.data?.find((k) => k.isDefault) ? ` (${keys.data.find((k) => k.isDefault)!.label})` : ""}</option>
                    {keys.data?.map((k) => (
                      <option key={k._id} value={k._id}>
                        {k.label} · {k.keyMask}
                        {k.active ? "" : " (disabled)"}
                      </option>
                    ))}
                  </select>
                  <div className="hint">
                    Keys are managed on the{" "}
                    <Link href="/admin/keys" className="link">
                      API Keys
                    </Link>{" "}
                    page.
                  </div>
                </div>
                <div>
                  <label className="label">Model override (blank = key default)</label>
                  <ModelInput value={form.openaiModel} onChange={(v) => set("openaiModel", v)} placeholder="Key default" />
                </div>
                <div>
                  <label className="label">Monthly generation quota (0 = unlimited)</label>
                  <input className="input" type="number" min={0} step={1} value={form.monthlyQuota} onChange={(e) => set("monthlyQuota", e.target.value)} />
                </div>
              </>
            )}
          </div>
        </Section>
      </div>

      <div className="popover sticky bottom-3 z-10 mt-6 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 px-3 py-2.5 sm:bottom-4 sm:px-4">
        <div className="min-w-0 flex-1 basis-full empty:hidden sm:basis-0">
          {error && <Alert>{error}</Alert>}
        </div>
        <button className="btn btn-primary w-full sm:w-auto" disabled={busy}>
          {busy && <Spinner />} {isNew ? "Create profile" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
