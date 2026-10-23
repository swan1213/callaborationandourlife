"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ScreenshotUploader from "@/components/ScreenshotUploader";
import Lightbox, { type Slide } from "@/components/Lightbox";
import PostingLink from "@/components/PostingLink";
import ReadDot from "@/components/ReadDot";
import { useColumns } from "@/components/ColumnPicker";
import JobInfoDialog from "@/components/JobInfoDialog";
import { useRole } from "@/components/AppShell";
import { useConfirm, useToast } from "@/components/Alerts";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import { isUnknownCompany, isUntitledRole, missingJobInfo } from "@/lib/jobInfo";
import { ArrowRight, CircleDollarSign, Clock, Download, ExternalLink, Eye, FileArchive, FileDown, FileText, Inbox, MapPin, Pencil, Plus, Search, Send, Trash2, X } from "lucide-react";
import { Alert, api, Badge, notGeneratedReason, DateRangeFilter, downloadFile, EmptyState, fmtStamp, money, PageHeader, Pagination, rangeParams, Section, selectOnRowClick, Spinner, TableSkeleton, Stat, useAsync, usePageSize, limitParam, useClientPaging } from "@/components/ui";

type Item = {
  _id: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  jobUrlRead?: boolean;
  viewed?: boolean;
  generationError?: string;
  jobLocation: string;
  status: string;
  submittedAt?: string;
  createdAt: string;
  fee: number;
  paid?: boolean;
  paidAt?: string;
  screenshots: { url: string; publicId: string }[];
  profile?: { _id: string; label: string; fullName: string } | null;
  profileLabel?: string;
};

type ListResponse = {
  items: Item[];
  total: number;
  page: number;
  limit: number;
  totals: { generated: number; submitted: number; fees: number };
  unread?: number;
  /** Submit works without a screenshot for this account. */
  quickSubmit?: boolean;
  byProfile: { _id: string; label: string; generated: number; submitted: number; fees: number }[];
};

const MAX_BULK = 100;

export default function ApplicationsPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("");
  // ?status=… (e.g. from "Review & submit"): read after mounting, so the first render matches the server's HTML.
  useEffect(() => setStatus(new URLSearchParams(window.location.search).get("status") ?? ""), []);
  const [profile, setProfile] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("my-applications");
  const [busyId, setBusyId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  // Missing company / role: fill it in (opened from the row, or when Submit is refused).
  const [fixing, setFixing] = useState<{ a: Item; reason?: string } | null>(null);
  const role = useRole();
  // Bidders can't delete applications (admins and profile managers can).
  const canDelete = role !== "bidder";
  const cols = useColumns("my-applications", [
    { key: "no", label: "No" },
    { key: "generated", label: "Generated" },
    { key: "submitted", label: "Submitted" },
    { key: "profile", label: "Profile" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "screenshot", label: "Screenshots" },
    { key: "other", label: "Fee" },
  ]);

  const profiles = useAsync(() => api<{ profiles: { id: string; label: string }[] }>("/api/profiles").then((r) => r.profiles), []);
  const list = useAsync(() => {
    const p = rangeParams(from, to);
    if (status) p.set("status", status);
    if (profile) p.set("profile", profile);
    if (q) p.set("q", q);
    p.set("page", String(page));
    p.set("limit", limitParam(pageSize));
    return api<ListResponse>(`/api/applications?${p}`);
  }, [from, to, status, profile, q, page, pageSize]);
  const byProfilePage = useClientPaging(list.data?.byProfile ?? [], "my-applications-by-profile");

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const items = list.data?.items ?? [];
  const offset = pageSize === "all" ? 0 : (page - 1) * pageSize;
  const downloadable = items.filter((x) => selected.has(x._id) && x.status !== "not_generated");

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  async function download(a: Item, format: "zip" | "resume-pdf" | "cover-pdf") {
    setBusyId(`${a._id}:${format}`);
    try {
      await downloadFile(
        `/api/applications/${a._id}/download${format === "zip" ? "" : `?format=${format}`}`,
        { zip: "application.zip", "resume-pdf": "resume.pdf", "cover-pdf": "cover-letter.pdf" }[format]
      );
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setBusyId("");
    }
  }

  async function downloadSelected(content: "resume" | "all" | "resume-pdf" | "cover-pdf") {
    const ids = downloadable.map((x) => x._id);
    if (!selected.size) return toast.warning("No resumes selected", "Tick the applications you want to download, then try again.");
    if (!ids.length) return toast.warning("Nothing to download", "None of the selected applications have documents yet (not generated).");
    if (ids.length > MAX_BULK) return toast.warning("Too many selected", `Select ${MAX_BULK} applications or fewer per download.`);
    setBulk(content);
    try {
      // Always a ZIP, even for one PDF, so it keeps the [Date]/[Profile]/[Index]_[Job Title]_[Company]/ folders.
      await downloadFile("/api/applications/bulk-download", { all: "applications.zip", resume: "resumes.zip", "resume-pdf": "resume-pdfs.zip", "cover-pdf": "cover-letter-pdfs.zip" }[content], { ids, content });
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setBulk("");
    }
  }

  async function toggleRead(a: Item) {
    const read = !a.viewed;
    // optimistic update
    list.setData((d) =>
      d ? { ...d, unread: Math.max(0, (d.unread ?? 0) + (read ? -1 : 1)), items: d.items.map((x) => (x._id === a._id ? { ...x, viewed: read } : x)) } : d
    );
    try {
      await api(`/api/applications/${a._id}/read`, { method: "POST", json: { read } });
    } catch (e) {
      toast.error((e as Error).message);
      list.reload();
    }
  }

  async function submitApp(a: Item) {
    // No company / role yet: explain why it can't be submitted and let the bidder fill them in.
    const missing = missingJobInfo(a);
    if (missing) {
      toast.warning("Can't submit yet", missing);
      setFixing({ a, reason: missing });
      return;
    }
    setBusyId(a._id);
    try {
      await api(`/api/applications/${a._id}`, { method: "PATCH", json: { status: "submitted" } });
      toast.success("Application submitted", `${a.company} · ${a.jobTitle}`);
      list.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId("");
    }
  }

  async function remove(a: Item) {
    const ok = await confirm({
      title: "Delete this application?",
      message: `"${a.company} / ${a.jobTitle}" is removed from your list.`,
      confirmLabel: "Delete application",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/applications/${a._id}`, { method: "DELETE" });
      toggle(a._id, false);
      toast.success("Application deleted", `${a.company} · ${a.jobTitle}`);
      list.reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function removeSelected() {
    const paidIds = items.filter((x) => selected.has(x._id) && x.paid).map((x) => x._id);
    const ids = [...selected].filter((id) => !paidIds.includes(id));
    if (!ids.length) return toast.warning("Paid applications can't be deleted.");
    const ok = await confirm({
      title: `Delete ${ids.length} application(s)?`,
      message: `They are removed from your list.${paidIds.length ? ` ${paidIds.length} paid application(s) are kept.` : ""}`,
      confirmLabel: "Delete applications",
      danger: true,
    });
    if (!ok) return;
    setBulk("delete");
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await api(`/api/applications/${id}`, { method: "DELETE" });
      } catch {
        failed.push(id);
      }
    }
    setSelected(new Set([...failed, ...paidIds]));
    if (ids.length > failed.length) toast.success(`${ids.length - failed.length} application(s) deleted`);
    if (paidIds.length) toast.warning(`${paidIds.length} paid application(s) were kept`, "Paid applications can't be deleted.");
    if (failed.length) toast.error(`${failed.length} application(s) could not be removed.`);
    setBulk("");
    list.reload();
  }

  const t = list.data?.totals;
  const rate = t && t.generated ? Math.round((t.submitted / t.generated) * 100) : 0;

  // Row fragments shared by the desktop table and the stacked phone list (same data, same actions).
  const companyCell = (a: Item, notGenerated: boolean) => (
    <>
      <div className="-ml-1 flex min-w-0 items-center gap-1">
        <ReadDot viewed={a.viewed} onToggle={() => toggleRead(a)} />
        {!notGenerated && isUnknownCompany(a.company) ? (
          <button
            type="button"
            className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-left text-amber-700 underline decoration-dotted underline-offset-2 hover:bg-amber-50"
            title="Add the company name"
            onClick={() => setFixing({ a })}
          >
            Unknown company
            <Pencil className="size-3 shrink-0" />
          </button>
        ) : (
          <Link
            href={`/applications/${a._id}`}
            className={`min-w-0 underline-offset-2 hover:underline ${a.viewed ? "font-normal text-slate-600" : "font-semibold text-slate-900"}`}
          >
            {a.company || "—"}
          </Link>
        )}
      </div>
      {a.jobUrl && (
        <PostingLink url={a.jobUrl} read={a.jobUrlRead} className="mt-0.5 ml-5 inline-flex items-center gap-0.5 text-xs">
          Job posting
          <ExternalLink className="size-3" />
        </PostingLink>
      )}
    </>
  );

  const roleCell = (a: Item, notGenerated: boolean) => (
    <>
      {!notGenerated && isUntitledRole(a.jobTitle) ? (
        <button
          type="button"
          className="-ml-1 inline-flex cursor-pointer items-center gap-1 rounded-md px-1 text-left text-amber-700 underline decoration-dotted underline-offset-2 hover:bg-amber-50"
          title="Add the role"
          onClick={() => setFixing({ a })}
        >
          Untitled role
          <Pencil className="size-3 shrink-0" />
        </button>
      ) : (
        <Link href={`/applications/${a._id}`} className={`underline-offset-2 hover:underline ${a.viewed ? "text-slate-600" : "font-semibold text-slate-900"}`}>
          {a.jobTitle || "Untitled"}
        </Link>
      )}
      {a.jobLocation && (
        <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
          <MapPin className="size-3 shrink-0" />
          {a.jobLocation}
        </div>
      )}
    </>
  );

  const notGeneratedLink = (a: Item) => (
    <Link
      href={`/applications/${a._id}`}
      className="mt-1 flex max-w-48 items-center gap-1 text-xs text-amber-700 underline-offset-2 hover:underline"
      title={a.generationError}
    >
      {notGeneratedReason(a.generationError)} · add it
      <ArrowRight className="size-3 shrink-0" />
    </Link>
  );

  const screenshotCell = (a: Item, notGenerated: boolean) => (
    <div className="flex flex-wrap items-center gap-1">
      {a.screenshots.map((s, idx) => (
        <button
          type="button"
          key={s.publicId}
          className="cursor-zoom-in rounded-md"
          title="View screenshots"
          onClick={() => setViewer({ slides: a.screenshots.map((x) => ({ url: x.url, caption: `${a.company} · ${a.jobTitle}` })), start: idx })}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={s.url.replace("/upload/", "/upload/c_fill,w_80,h_56/")}
            alt="Submission screenshot"
            className="h-8 w-11 rounded-md border border-slate-200 object-cover transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-500/20"
          />
        </button>
      ))}
      {!notGenerated && <ScreenshotUploader applicationId={a._id} onUploaded={list.reload} compact />}
      {a.status === "generated" && (
        <button
          className="btn btn-primary btn-sm"
          disabled={(!a.screenshots.length && !list.data?.quickSubmit) || busyId === a._id}
          title={a.screenshots.length || list.data?.quickSubmit ? "Mark as submitted" : "Upload a confirmation screenshot first"}
          onClick={() => submitApp(a)}
        >
          {busyId === a._id ? <Spinner className="size-3.5" /> : <Send />}
          Submit
        </button>
      )}
    </div>
  );

  const downloadButtons = (a: Item, notGenerated: boolean, className: string) => (
    <>
      <button className={className} onClick={() => download(a, "zip")} disabled={notGenerated || !!busyId} title={notGenerated ? "Generate it first" : "All documents (ZIP)"}>
        {busyId === `${a._id}:zip` ? <Spinner className="size-3.5" /> : <FileArchive />}
        ZIP
      </button>
      <button className={className} onClick={() => download(a, "resume-pdf")} disabled={notGenerated || !!busyId} title={notGenerated ? "Generate it first" : "Resume PDF"}>
        {busyId === `${a._id}:resume-pdf` ? <Spinner className="size-3.5" /> : <FileDown />}
        Resume PDF
      </button>
    </>
  );

  const menuItems = (a: Item, notGenerated: boolean): ActionItem[] => [
    { label: "Open", icon: Eye, onSelect: () => router.push(`/applications/${a._id}`) },
    { label: "Download ZIP", icon: FileArchive, disabled: notGenerated || !!busyId, onSelect: () => download(a, "zip") },
    { label: "Resume PDF", icon: FileDown, disabled: notGenerated || !!busyId, onSelect: () => download(a, "resume-pdf") },
    { label: "Cover letter PDF", icon: FileText, disabled: notGenerated || !!busyId, onSelect: () => download(a, "cover-pdf") },
    ...(canDelete ? ["divider" as const, { label: a.paid ? "Paid: can't delete" : "Delete", icon: Trash2, danger: true, disabled: !!a.paid, onSelect: () => remove(a) }] : []),
  ];

  const actions = (a: Item, notGenerated: boolean) => (
    <div className="flex items-center justify-end gap-1">
      <button
        className="btn btn-ghost btn-sm btn-icon"
        onClick={() => download(a, "zip")}
        disabled={notGenerated || !!busyId}
        aria-label="Download all documents (ZIP)"
        title={notGenerated ? "Generate it first" : "All documents (ZIP)"}
      >
        {busyId === `${a._id}:zip` ? <Spinner className="size-3.5" /> : <Download />}
      </button>
      <ActionMenu items={menuItems(a, notGenerated)} label={`More actions for ${a.company || "this application"}`} />
    </div>
  );

  const feeCell = (a: Item, submitted: boolean) =>
    submitted ? (
      <>
        <Badge value={a.paid ? "approved" : "pending"} label={a.paid ? "Paid" : "Not paid"} />
        <div className="mt-1 text-xs text-slate-500 tabular-nums">
          {money(a.fee)}
          {a.paid && a.paidAt && <span className="text-slate-400"> · {fmtStamp(a.paidAt).slice(0, 10)}</span>}
        </div>
      </>
    ) : (
      <span className="text-xs text-slate-400">No fee</span>
    );

  const rowTint = (a: Item) => (selected.has(a._id) ? "bg-indigo-50/70" : a.viewed ? "" : "bg-indigo-50/40");

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="View generated resumes"
        subtitle="Every resume you generated. Download the documents, upload a screenshot of the confirmation page, then click Submit."
        actions={
          <Link href="/dashboard/import" className="btn btn-primary">
            <Plus /> Generate resume
          </Link>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Generated" value={t?.generated ?? "—"} icon={FileText} />
        <Stat label="Submitted" value={t?.submitted ?? "—"} icon={Send} hint={t ? `${rate}% submission rate` : undefined} />
        <Stat label="Pending submission" value={t ? t.generated - t.submitted : "—"} icon={Clock} />
        <Stat label="Fees" value={t ? money(t.fees) : "—"} icon={CircleDollarSign} hint="for the selected range" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFilter from={from} to={to} onChange={(f, t) => reset(() => (setFrom(f), setTo(t)))} />
        <div className="w-[calc(50%-0.375rem)] sm:w-52">
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
            <option value="">All</option>
            <option value="generated">Generated (not submitted)</option>
            <option value="submitted">Submitted</option>
            <option value="not_generated">Not-generated</option>
          </select>
        </div>
        <div className="w-[calc(50%-0.375rem)] sm:w-44">
          <label className="label">Profile</label>
          <select className="input" value={profile} onChange={(e) => reset(() => setProfile(e.target.value))}>
            <option value="">All</option>
            {profiles.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1 basis-full sm:min-w-56 sm:basis-auto">
          <label className="label">Search</label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Company, role or URL" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
          </div>
        </div>
      </div>

      {!!list.data?.byProfile.length && list.data.byProfile.length > 1 && (
        <Section title="By profile" className="mb-6 overflow-hidden" bodyClassName="">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th className="num">Generated</th>
                  <th className="num">Submitted</th>
                  <th className="num">Fees</th>
                </tr>
              </thead>
              <tbody>
                {byProfilePage.pageRows.map((b) => (
                  <tr key={b._id}>
                    <td className="min-w-[8rem] font-medium text-slate-900">{b.label}</td>
                    <td className="num">{b.generated}</td>
                    <td className="num">{b.submitted}</td>
                    <td className="num">{money(b.fees)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-slate-200 px-4 pb-3">{byProfilePage.pager}</div>
        </Section>
      )}

      {fixing && (
        <JobInfoDialog
          app={fixing.a}
          reason={fixing.reason}
          canChangeAll={role === "admin"}
          onClose={() => setFixing(null)}
          onSaved={(m) => {
            setFixing(null);
            toast.success(m, "You can submit it now.");
            list.reload();
          }}
        />
      )}

      {selected.size > 0 && (
        <div className="popover sticky top-16 z-10 mb-3 flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-[13px]">
          <span className="inline-flex items-center gap-2 font-medium text-slate-900">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-indigo-600 px-1.5 text-xs font-semibold text-white tabular-nums">{selected.size}</span>
            selected
          </span>
          {downloadable.length < selected.size && (
            <span className="text-xs text-slate-500">({selected.size - downloadable.length} not generated, skipped in downloads)</span>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {canDelete && (
              <>
                <button className="btn btn-danger btn-sm" onClick={removeSelected} disabled={!!bulk}>
                  {bulk === "delete" ? <Spinner className="size-3.5" /> : <Trash2 />} Delete
                </button>
                <span aria-hidden className="mx-0.5 h-4 w-px bg-slate-200" />
              </>
            )}
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!!bulk}>
              <X /> Clear
            </button>
          </div>
        </div>
      )}

      {cols.style}
      <div className="card overflow-hidden p-0">
        {/* Multi-download is always available; it explains when nothing usable is selected. */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <button
            className="btn btn-secondary btn-sm h-auto min-h-7 py-1 text-left whitespace-normal"
            onClick={() => downloadSelected("all")}
            disabled={!!bulk}
            title="Resume (PDF + DOCX), cover letter (PDF + DOCX) and job description (DOCX) for each selected application"
          >
            {bulk === "all" ? <Spinner className="size-3.5" /> : <FileArchive />} Download ZIP: resume, cover letter &amp; JD{downloadable.length ? ` (${downloadable.length})` : ""}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadSelected("resume")} disabled={!!bulk}>
            {bulk === "resume" ? <Spinner className="size-3.5" /> : <Download />} Resumes only (ZIP){downloadable.length ? ` (${downloadable.length})` : ""}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadSelected("resume-pdf")} disabled={!!bulk} title="Only the resume PDF of each selected application">
            {bulk === "resume-pdf" ? <Spinner className="size-3.5" /> : <FileDown />} Resume PDFs{downloadable.length ? ` (${downloadable.length})` : ""}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => downloadSelected("cover-pdf")} disabled={!!bulk} title="Only the cover letter PDF of each selected application">
            {bulk === "cover-pdf" ? <Spinner className="size-3.5" /> : <FileText />} Cover letter PDFs{downloadable.length ? ` (${downloadable.length})` : ""}
          </button>
          <span className={`text-xs ${selected.size ? "text-slate-500" : "text-slate-400"}`}>
            {selected.size ? `${selected.size} selected` : "No resumes selected · tick rows to download them together"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            {!!list.data?.unread && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="inline-block size-2 shrink-0 rounded-full bg-indigo-600" /> {list.data.unread} unread · opening an application marks it read
              </span>
            )}
            {/* Column visibility only applies to the table (md and up). */}
            <div className="hidden md:block">{cols.picker}</div>
          </div>
        </div>
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : list.error ? (
          <div className="p-4">
            <Alert>{list.error}</Alert>
          </div>
        ) : !items.length ? (
          <EmptyState
            icon={Inbox}
            title="No applications match these filters."
            action={
              <Link href="/dashboard/import" className="btn btn-secondary btn-sm">
                <Plus /> Generate resume
              </Link>
            }
          />
        ) : (
          <>
            {/* Phones: stacked cards with the same fields and actions as the table. */}
            <div className="md:hidden">
              <label className="flex cursor-pointer items-center gap-3 border-b border-slate-200 bg-page px-4 py-2 text-xs font-medium text-slate-500">
                <input
                  type="checkbox"
                  className="size-4 rounded"
                  checked={items.every((x) => selected.has(x._id))}
                  onChange={(e) => items.forEach((x) => toggle(x._id, e.target.checked))}
                />
                Select all on this page
              </label>
              <ul className="divide-y divide-slate-200">
                {items.map((a, i) => {
                  const notGenerated = a.status === "not_generated";
                  const submitted = a.status === "submitted";
                  return (
                    <li key={a._id} className={`cursor-pointer px-4 py-3.5 ${rowTint(a)}`} onClick={selectOnRowClick(() => toggle(a._id, !selected.has(a._id)))}>
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 shrink-0 rounded"
                          aria-label="Select application"
                          checked={selected.has(a._id)}
                          onChange={(e) => toggle(a._id, e.target.checked)}
                        />
                        <div className="min-w-0 flex-1 space-y-2.5">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 text-sm">{companyCell(a, notGenerated)}</div>
                            <span className="shrink-0 text-xs text-slate-400 tabular-nums">#{offset + i + 1}</span>
                          </div>
                          <div className="text-[13px]">{roleCell(a, notGenerated)}</div>
                          <div>
                            <Badge value={a.status} />
                            {notGenerated && notGeneratedLink(a)}
                          </div>
                          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <div className="min-w-0">
                              <dt className="text-slate-400">Generated</dt>
                              <dd className="font-mono text-slate-600">{fmtStamp(a.createdAt)}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-slate-400">Submitted</dt>
                              <dd className="font-mono text-slate-600">{a.submittedAt ? fmtStamp(a.submittedAt) : <span className="text-slate-400">—</span>}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-slate-400">Profile</dt>
                              <dd className="text-slate-700">{a.profile?.label ?? a.profileLabel ?? "—"}</dd>
                            </div>
                            <div className="min-w-0">
                              <dt className="text-slate-400">Fee</dt>
                              <dd className="mt-0.5">{feeCell(a, submitted)}</dd>
                            </div>
                          </dl>
                          {screenshotCell(a, notGenerated)}
                          <div className="-ml-2 flex flex-wrap items-center gap-1">
                            {downloadButtons(a, notGenerated, "btn btn-ghost btn-sm h-8")}
                            {canDelete && (
                              <span className="ml-auto">
                                <ActionMenu items={menuItems(a, notGenerated)} label={`More actions for ${a.company || "this application"}`} />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* md and up: full table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="table" data-table="my-applications">
                <thead>
                  <tr>
                    <th className="w-8">
                      <input
                        type="checkbox"
                        className="size-4 rounded align-middle"
                        aria-label="Select all on this page"
                        checked={items.every((x) => selected.has(x._id))}
                        onChange={(e) => items.forEach((x) => toggle(x._id, e.target.checked))}
                      />
                    </th>
                    <th data-col="no" className="num">No</th>
                    <th data-col="generated">Generated</th>
                    <th data-col="submitted">Submitted</th>
                    <th data-col="profile">Profile</th>
                    <th data-col="company">Company</th>
                    <th data-col="role">Role</th>
                    <th data-col="status">Status</th>
                    <th data-col="screenshot">Screenshots</th>
                    <th data-col="other">Fee</th>
                    <th className="actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a, i) => {
                    const notGenerated = a.status === "not_generated";
                    const submitted = a.status === "submitted";
                    return (
                      <tr key={a._id} className={`cursor-pointer ${rowTint(a)}`} onClick={selectOnRowClick(() => toggle(a._id, !selected.has(a._id)))}>
                        <td>
                          <input type="checkbox" className="size-4 rounded align-middle" aria-label="Select application" checked={selected.has(a._id)} onChange={(e) => toggle(a._id, e.target.checked)} />
                        </td>
                        <td data-col="no" className="num text-xs text-slate-400">{offset + i + 1}</td>
                        <td data-col="generated" className="font-mono text-xs whitespace-nowrap text-slate-600">{fmtStamp(a.createdAt)}</td>
                        <td data-col="submitted" className="font-mono text-xs whitespace-nowrap text-slate-600">{a.submittedAt ? fmtStamp(a.submittedAt) : <span className="text-slate-400">—</span>}</td>
                        <td data-col="profile" className="whitespace-nowrap">{a.profile?.label ?? a.profileLabel ?? "—"}</td>
                        <td data-col="company" className="min-w-[10rem]">{companyCell(a, notGenerated)}</td>
                        <td data-col="role" className="min-w-[12rem] max-w-xs">{roleCell(a, notGenerated)}</td>
                        <td data-col="status">
                          <Badge value={a.status} />
                          {notGenerated && notGeneratedLink(a)}
                        </td>
                        <td data-col="screenshot">{screenshotCell(a, notGenerated)}</td>
                        <td data-col="other" className="whitespace-nowrap">
                          {feeCell(a, submitted)}
                        </td>
                        <td className="actions">{actions(a, notGenerated)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {viewer && <Lightbox slides={viewer.slides} start={viewer.start} onClose={() => setViewer(null)} />}
      {list.data && <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} />}
    </div>
  );
}
