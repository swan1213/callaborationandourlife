"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useRole } from "@/components/AppShell";
import { useConfirm, useToast } from "@/components/Alerts";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import Lightbox, { type Slide } from "@/components/Lightbox";
import PostingLink from "@/components/PostingLink";
import ReadDot from "@/components/ReadDot";
import { useColumns } from "@/components/ColumnPicker";
import { ArrowRight, Check, CircleCheck, CircleDollarSign, Clock, Download, ExternalLink, Eye, FileArchive, FileDown, FileText, Inbox, Search, Send, Trash2, Undo2, Wallet, X } from "lucide-react";
import { Alert, api, Badge, notGeneratedReason, DateRangeFilter, downloadFile, EmptyState, fmtStamp, money, PageHeader, Pagination, rangeParams, selectOnRowClick, Spinner, TableSkeleton, Stat, useAsync, usePageSize, limitParam } from "@/components/ui";

type Person = { _id: string; name: string; email: string };
type Item = {
  _id: string;
  user?: Person | null;
  managers?: Person[];
  profile?: { _id: string; label: string } | null;
  profileLabel?: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  jobUrlRead?: boolean;
  viewed?: boolean;
  generationError?: string;
  status: string;
  submittedAt?: string;
  createdAt: string;
  fee: number;
  paid?: boolean;
  paidAt?: string;
  deletedByUser?: boolean;
  usage?: { promptTokens: number; completionTokens: number; model?: string };
  screenshots: { url: string; publicId: string }[];
};
type Resp = {
  items: Item[];
  total: number;
  page: number;
  limit: number;
  totals: { generated: number; submitted: number; fees: number; paidFees: number; unpaidCount: number; promptTokens: number; completionTokens: number };
  unread?: number;
};

export default function Page() {
  return (
    <Suspense>
      <History />
    </Suspense>
  );
}

function History() {
  const isAdmin = useRole() === "admin";
  const sp = useSearchParams();
  const [user, setUser] = useState(sp.get("user") ?? "");
  const [profile, setProfile] = useState(sp.get("profile") ?? "");
  const [status, setStatus] = useState("");
  const [paid, setPaid] = useState(sp.get("paid") ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("application-history");
  const [exporting, setExporting] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState("");
  const [busyId, setBusyId] = useState("");
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const cols = useColumns("application-history", [
    { key: "no", label: "No" },
    { key: "generated", label: "Generated" },
    { key: "submitted", label: "Submitted" },
    { key: "profile", label: "Profile" },
    { key: "user", label: "User" },
    { key: "bidder", label: "Bidder" },
    { key: "company", label: "Company" },
    { key: "role", label: "Role" },
    { key: "status", label: "Status" },
    { key: "screenshot", label: "Screenshots" },
    { key: "other", label: "Fee" },
  ]);

  const users = useAsync(() => api<{ users: Person[] }>("/api/admin/users").then((r) => r.users), []);
  // A user's (manager's) history is automatically limited to their managed profiles by the API.
  const profiles = useAsync(() => api<{ profiles: { _id: string; label: string }[] }>("/api/admin/profiles").then((r) => r.profiles), []);

  const params = () => {
    const p = rangeParams(from, to);
    if (user) p.set("user", user);
    if (profile) p.set("profile", profile);
    if (status) p.set("status", status);
    if (paid) p.set("paid", paid);
    if (q) p.set("q", q);
    return p;
  };

  const list = useAsync(() => {
    const p = params();
    p.set("page", String(page));
    p.set("limit", limitParam(pageSize));
    return api<Resp>(`/api/admin/applications?${p}`);
  }, [user, profile, status, paid, from, to, q, page, pageSize]);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const items = list.data?.items ?? [];
  const selectedItems = items.filter((x) => selected.has(x._id));
  const offset = pageSize === "all" ? 0 : (page - 1) * pageSize;

  async function exportZip(content: "all" | "resume") {
    setExporting(content);
    try {
      const p = params();
      p.set("content", content);
      await downloadFile(`/api/admin/applications/export?${p}`, "export.zip");
    } catch (e) {
      toast.error("Export failed", (e as Error).message);
    } finally {
      setExporting("");
    }
  }

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

  async function setPaidMark(ids: string[], value: boolean) {
    if (!ids.length) return;
    setBulk(value ? "paid" : "unpaid");
    try {
      const r = await api<{ matched: number; skipped: number }>("/api/admin/applications/paid", { method: "POST", json: { ids, paid: value } });
      toast.success(
        `${r.matched} application(s) marked as ${value ? "paid" : "not paid"}`,
        r.skipped ? `${r.skipped} skipped: only submitted applications carry a fee.` : undefined
      );
      if (ids.length > 1) setSelected(new Set());
      list.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBulk("");
    }
  }

  async function removeSelected() {
    const paidIds = items.filter((x) => selected.has(x._id) && x.paid).map((x) => x._id);
    const ids = [...selected].filter((id) => !paidIds.includes(id));
    if (!ids.length) return toast.warning("Paid applications can't be deleted.");
    const ok = await confirm({
      title: `Delete ${ids.length} application(s)?`,
      message: `This permanently removes their documents, screenshots and fees.${paidIds.length ? ` ${paidIds.length} paid application(s) are kept.` : ""}`,
      confirmLabel: "Delete permanently",
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
    if (failed.length) toast.error(`${failed.length} application(s) could not be deleted.`);
    setBulk("");
    list.reload();
  }

  async function remove(a: Item) {
    const ok = await confirm({
      title: "Delete this application?",
      message: `The ${a.status.replace(/_/g, "-")} application "${a.company} / ${a.jobTitle}" is permanently deleted and removed from billing.`,
      confirmLabel: "Delete permanently",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/applications/${a._id}`, { method: "DELETE" });
      toast.success("Application deleted", `${a.company} · ${a.jobTitle}`);
      list.reload();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });

  const t = list.data?.totals;
  const payableSelected = selectedItems.filter((x) => x.status === "submitted");
  const downloadable = selectedItems.filter((x) => x.status !== "not_generated");

  async function downloadSelected(content: "resume" | "all" | "resume-pdf" | "cover-pdf") {
    const ids = downloadable.map((x) => x._id);
    if (!selected.size) return toast.warning("No resumes selected", "Tick the applications you want to download, then try again.");
    if (!ids.length) return toast.warning("Nothing to download", "None of the selected applications have documents yet (not generated).");
    if (ids.length > 100) return toast.warning("Too many selected", "Select 100 applications or fewer per download, or use the filtered download buttons above.");
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

  const menuItems = (a: Item, notGenerated: boolean): ActionItem[] => [
    { label: "Open", icon: Eye, onSelect: () => router.push(`/applications/${a._id}`) },
    { label: "Download ZIP", icon: FileArchive, disabled: notGenerated || !!busyId, onSelect: () => download(a, "zip") },
    { label: "Resume PDF", icon: FileDown, disabled: notGenerated || !!busyId, onSelect: () => download(a, "resume-pdf") },
    { label: "Cover letter PDF", icon: FileText, disabled: notGenerated || !!busyId, onSelect: () => download(a, "cover-pdf") },
    ...(isAdmin && a.paid ? [{ label: "Mark as not paid", icon: Undo2, disabled: !!bulk, onSelect: () => setPaidMark([a._id], false) }] : []),
    ...(isAdmin
      ? ["divider" as const, { label: a.paid ? "Paid: can't delete" : "Delete", icon: Trash2, danger: true, disabled: !!a.paid, onSelect: () => remove(a) }]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Application history"
        subtitle="Every generated application: who created it, with which profile, whether it was submitted, and whether its fee is paid."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => exportZip("resume")} disabled={!!exporting || !t?.generated}>
              {exporting === "resume" ? <Spinner /> : <Download />} Download resumes
            </button>
            <button className="btn btn-primary" onClick={() => exportZip("all")} disabled={!!exporting || !t?.generated}>
              {exporting === "all" ? <Spinner /> : <FileArchive />} Download all documents
            </button>
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Generated" value={t?.generated ?? "—"} icon={FileText} />
        <Stat label="Submitted" value={t?.submitted ?? "—"} icon={Send} hint={t?.generated ? `${Math.round((t.submitted / t.generated) * 100)}%` : undefined} />
        <Stat label="Fees" value={t ? money(t.fees) : "—"} icon={CircleDollarSign} />
        <Stat label="Paid" value={t ? money(t.paidFees) : "—"} icon={Wallet} hint={t ? `${money(t.fees - t.paidFees)} outstanding` : undefined} />
        <Stat label="Not paid" value={t?.unpaidCount ?? "—"} icon={Clock} hint="submitted applications" />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <DateRangeFilter from={from} to={to} onChange={(f, tt) => reset(() => (setFrom(f), setTo(tt)))} />
        <div className="w-full sm:w-56">
          <label className="label">Account</label>
          <select className="input" value={user} onChange={(e) => reset(() => setUser(e.target.value))}>
            <option value="">All accounts</option>
            {users.data?.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name} ({u.email})
              </option>
            ))}
          </select>
        </div>
        <div className="w-full sm:w-44">
          <label className="label">Profile</label>
          <select className="input" value={profile} onChange={(e) => reset(() => setProfile(e.target.value))}>
            <option value="">All profiles</option>
            {profiles.data?.map((p) => (
              <option key={p._id} value={p._id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div className="w-[calc(50%-0.375rem)] sm:w-36">
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
            <option value="">All</option>
            <option value="generated">Generated</option>
            <option value="submitted">Submitted</option>
            <option value="not_generated">Not-generated</option>
          </select>
        </div>
        <div className="w-[calc(50%-0.375rem)] sm:w-36">
          <label className="label">Payment</label>
          <select className="input" value={paid} onChange={(e) => reset(() => setPaid(e.target.value))}>
            <option value="">All</option>
            <option value="paid">Only paid</option>
            <option value="unpaid">Only not paid</option>
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

      {selected.size > 0 && (
        <div className="popover sticky top-16 z-10 mb-3 flex animate-fade-in flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 text-[13px]">
          <span className="inline-flex items-center gap-2 font-medium text-slate-900">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-indigo-600 px-1.5 text-xs font-semibold text-white tabular-nums">{selected.size}</span>
            selected
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            ({payableSelected.length} submitted · {money(payableSelected.reduce((s, x) => s + (x.fee ?? 0), 0))})
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            {isAdmin && (
              <>
                <button className="btn btn-primary btn-sm" onClick={() => setPaidMark([...selected], true)} disabled={!!bulk || !payableSelected.length}>
                  {bulk === "paid" ? <Spinner className="size-3.5" /> : <CircleCheck />} Mark as paid
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => setPaidMark([...selected], false)} disabled={!!bulk || !payableSelected.length}>
                  {bulk === "unpaid" ? <Spinner className="size-3.5" /> : <Undo2 />} Mark as not paid
                </button>
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
                <span className="inline-block size-2 shrink-0 rounded-full bg-indigo-600" /> {list.data.unread} unread for you · opening an application marks it read
              </span>
            )}
            {cols.picker}
          </div>
        </div>
        <div className="overflow-x-auto">
          {list.loading && !list.data ? (
            <TableSkeleton rows={6} cols={7} />
          ) : list.error ? (
            <div className="p-4">
              <Alert>{list.error}</Alert>
            </div>
          ) : !items.length ? (
            <EmptyState icon={Inbox} title="No applications match these filters." />
          ) : (
            <table className="table" data-table="application-history">
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
                  <th data-col="user">User</th>
                  <th data-col="bidder">Bidder</th>
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
                    <tr
                      key={a._id}
                      className={`cursor-pointer ${selected.has(a._id) ? "bg-indigo-50/70" : a.viewed ? "" : "bg-indigo-50/30"}`}
                      onClick={selectOnRowClick(() => toggle(a._id, !selected.has(a._id)))}
                    >
                      <td>
                        <input type="checkbox" className="size-4 rounded align-middle" aria-label="Select application" checked={selected.has(a._id)} onChange={(e) => toggle(a._id, e.target.checked)} />
                      </td>
                      <td data-col="no" className="num text-xs text-slate-400">{offset + i + 1}</td>
                      <td data-col="generated" className="font-mono text-xs whitespace-nowrap text-slate-600">{fmtStamp(a.createdAt)}</td>
                      <td data-col="submitted" className="font-mono text-xs whitespace-nowrap text-slate-600">{a.submittedAt ? fmtStamp(a.submittedAt) : <span className="text-slate-400">—</span>}</td>
                      <td data-col="profile" className="whitespace-nowrap">{a.profile?.label ?? (a.profileLabel ? <span className="text-slate-400">{a.profileLabel} (deleted)</span> : "—")}</td>
                      <td data-col="user">
                        {a.managers?.length ? (
                          a.managers.map((m) => (
                            <div key={m._id} className="whitespace-nowrap" title={m.email}>
                              {m.name}
                            </div>
                          ))
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td data-col="bidder">
                        <div className="whitespace-nowrap" title={a.user?.email}>
                          {a.user?.name ?? <span className="text-slate-400">Deleted account</span>}
                        </div>
                      </td>
                      <td data-col="company" className="min-w-[10rem]">
                        <div className="-ml-1 flex items-center gap-1">
                          <ReadDot viewed={a.viewed} onToggle={() => toggleRead(a)} />
                          <Link
                            href={`/applications/${a._id}`}
                            className={`underline-offset-2 hover:underline ${a.viewed ? "font-normal text-slate-600" : "font-semibold text-slate-900"}`}
                          >
                            {a.company || "Unknown company"}
                          </Link>
                        </div>
                        {a.jobUrl && (
                          <PostingLink url={a.jobUrl} read={a.jobUrlRead} className="mt-0.5 ml-5 inline-flex items-center gap-0.5 text-xs">
                            posting
                            <ExternalLink className="size-3" />
                          </PostingLink>
                        )}
                      </td>
                      <td data-col="role" className="min-w-[12rem] max-w-xs">
                        <Link href={`/applications/${a._id}`} className="text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline">
                          {a.jobTitle || "Untitled role"}
                        </Link>
                      </td>
                      <td data-col="status">
                        <div className="flex flex-col items-start gap-1">
                          <Badge value={a.status} />
                          {notGenerated && (
                            <Link
                              href={`/applications/${a._id}`}
                              className="inline-flex max-w-48 items-center gap-1 text-xs text-amber-700 underline-offset-2 hover:underline"
                              title={a.generationError}
                            >
                              {notGeneratedReason(a.generationError)} · add it
                              <ArrowRight className="size-3 shrink-0" />
                            </Link>
                          )}
                          {a.deletedByUser && <Badge value="deleted" label="hidden by bidder" />}
                        </div>
                      </td>
                      <td data-col="screenshot">
                        <div className="flex gap-1">
                          {a.screenshots.map((s, idx) => (
                            <button
                              type="button"
                              key={s.publicId}
                              className="cursor-zoom-in rounded-md"
                              title="View screenshots"
                              onClick={() =>
                                setViewer({
                                  slides: a.screenshots.map((x) => ({ url: x.url, caption: `${a.user?.name ?? "Deleted account"} · ${a.company} · ${a.jobTitle}` })),
                                  start: idx,
                                })
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={s.url.replace("/upload/", "/upload/c_fill,w_80,h_56/")}
                                alt="Screenshot"
                                className="h-8 w-11 rounded-md border border-slate-200 object-cover transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-500/20"
                              />
                            </button>
                          ))}
                          {!a.screenshots.length && <span className="text-xs text-slate-400">—</span>}
                        </div>
                      </td>
                      <td data-col="other" className="whitespace-nowrap">
                        {submitted ? (
                          <>
                            <Badge value={a.paid ? "approved" : "pending"} label={a.paid ? "Paid" : "Not paid"} />
                            <div className="mt-1 text-xs text-slate-500 tabular-nums">
                              {money(a.fee)}
                              {a.paid && a.paidAt && <span className="text-slate-400"> · {fmtStamp(a.paidAt).slice(0, 10)}</span>}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">No fee</span>
                        )}
                      </td>
                      <td className="actions">
                        <div className="flex items-center justify-end gap-1">
                          {isAdmin && submitted && !a.paid && (
                            <button className="btn btn-secondary btn-sm" onClick={() => setPaidMark([a._id], true)} disabled={!!bulk} title="Mark this fee as paid">
                              <Check />
                              Set paid
                            </button>
                          )}
                          <button
                            className="btn btn-ghost btn-sm btn-icon"
                            onClick={() => download(a, "zip")}
                            disabled={notGenerated || !!busyId}
                            aria-label="Download all documents (ZIP)"
                            title={notGenerated ? "Not generated yet" : "All documents (ZIP)"}
                          >
                            {busyId === `${a._id}:zip` ? <Spinner className="size-3.5" /> : <Download />}
                          </button>
                          <ActionMenu items={menuItems(a, notGenerated)} label={`More actions for ${a.company || "this application"}`} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {viewer && <Lightbox slides={viewer.slides} start={viewer.start} onClose={() => setViewer(null)} />}
      {list.data && <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={setPage} onPageSize={setPageSize} />}
    </div>
  );
}
