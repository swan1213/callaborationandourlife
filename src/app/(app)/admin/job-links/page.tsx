"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/components/Alerts";
import { Copy, CopyCheck, Download, ExternalLink, FileCheck2, FileSpreadsheet, FileText, Files, Inbox, Link2, Search, X } from "lucide-react";
import { Alert, api, Badge, DateRangeFilter, downloadFile, EmptyState, fmtStamp, limitParam, PageHeader, Pagination, rangeParams, selectOnRowClick, Spinner, Stat, TableSkeleton, useAsync, usePageSize } from "@/components/ui";

type Person = { _id: string; name: string; email?: string };
type JobLink = {
  url: string;
  company: string;
  jobTitle: string;
  count: number;
  bidders: Person[];
  firstAt: string;
  lastAt: string;
  applicationId: string;
  exportedAt: string | null;
  exportedBy: string;
  exportCount: number;
};
type Resp = { items: JobLink[]; total: number; applications: number; duplicates: number; exported: number; page: number; limit: number };

export default function JobLinksPage() {
  const [user, setUser] = useState("");
  const [profile, setProfile] = useState("");
  const [status, setStatus] = useState("");
  const [exported, setExported] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("job-links", 50);
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  // Selected job links, keyed by URL (each URL is listed once). Kept across pages and filter changes.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();

  const users = useAsync(() => api<{ users: Person[] }>("/api/admin/users").then((r) => r.users), []);
  const profiles = useAsync(() => api<{ profiles: { _id: string; label: string }[] }>("/api/admin/profiles").then((r) => r.profiles), []);

  const params = () => {
    const p = rangeParams(from, to);
    if (user) p.set("user", user);
    if (profile) p.set("profile", profile);
    if (status) p.set("status", status);
    if (exported) p.set("exported", exported);
    if (q) p.set("q", q);
    return p;
  };

  const list = useAsync(() => {
    const p = params();
    p.set("page", String(page));
    p.set("limit", limitParam(pageSize));
    return api<Resp>(`/api/admin/job-links?${p}`);
  }, [user, profile, status, exported, from, to, q, page, pageSize]);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const items = list.data?.items ?? [];
  const offset = pageSize === "all" ? 0 : (page - 1) * pageSize;

  async function exportList(format: "csv" | "txt") {
    setBusy(format);
    try {
      const p = params();
      p.set("format", format);
      await downloadFile(`/api/admin/job-links?${p}`, `job_links.${format}`);
      list.reload();
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function exportSelected() {
    if (!selected.size) return toast.warning("No job links selected", "Tick the job links you want to export, then try again.");
    setBusy("selected");
    try {
      await downloadFile("/api/admin/job-links", "job_links_selected.txt", { urls: [...selected] });
      toast.success(`${selected.size} job link(s) exported`, "They are now marked as exported.");
      setSelected(new Set());
      list.reload();
    } catch (e) {
      toast.error("Export failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function copyAll() {
    setBusy("copy");
    try {
      const p = params();
      p.set("format", "txt");
      p.set("copy", "1");
      const res = await fetch(`/api/admin/job-links?${p}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Copy failed (${res.status})`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      toast.success(`${text ? text.split("\r\n").length : 0} job link(s) copied`, "One per line, ready to paste into Generate Resume.");
    } catch (e) {
      toast.error("Copy failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  const toggle = (url: string, on: boolean) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (on) n.add(url);
      else n.delete(url);
      return n;
    });

  async function copyOne(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      setTimeout(() => setCopied((c) => (c === url ? "" : c)), 1500);
    } catch {
      toast.error("Copy failed");
    }
  }

  const d = list.data;
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader title="Job links" subtitle="Every job link bidders generated from, listed once: the same posting generated again (by any bidder or profile) is not repeated." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        <Stat label="Unique job links" value={d?.total ?? "—"} icon={Link2} />
        <Stat label="Applications" value={d?.applications ?? "—"} icon={Files} hint="with a job link" />
        <Stat label="Repeats removed" value={d?.duplicates ?? "—"} icon={Copy} hint="same link generated again" />
        <Stat label="Exported" value={d?.exported ?? "—"} icon={FileCheck2} hint="included in a TXT/CSV download" />
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
        <div className="w-full sm:w-36">
          <label className="label">Status</label>
          <select className="input" value={status} onChange={(e) => reset(() => setStatus(e.target.value))}>
            <option value="">All</option>
            <option value="generated">Generated</option>
            <option value="submitted">Submitted</option>
            <option value="not_generated">Not-generated</option>
          </select>
        </div>
        <div className="w-full sm:w-40">
          <label className="label">Export</label>
          <select className="input" value={exported} onChange={(e) => reset(() => setExported(e.target.value))}>
            <option value="">All</option>
            <option value="no">Not exported</option>
            <option value="yes">Exported</option>
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

      <div className="card overflow-hidden p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
          <button className="btn btn-primary btn-sm" onClick={exportSelected} disabled={!!busy || !selected.size}>
            {busy === "selected" ? <Spinner className="size-3.5" /> : <Download />} Export selected (TXT){selected.size ? ` (${selected.size})` : ""}
          </button>
          {selected.size > 0 && (
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!!busy}>
              <X /> Clear
            </button>
          )}
          <span className={`text-xs ${selected.size ? "text-slate-500" : "text-slate-400"}`}>
            {selected.size ? `${selected.size} selected` : "No job links selected · tick rows to export them as a TXT file"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-1.5">
            <button className="btn btn-secondary btn-sm" onClick={copyAll} disabled={!!busy || !d?.total} title="Copy every listed link (not marked as exported)">
              {busy === "copy" ? <Spinner className="size-3.5" /> : <Copy />} Copy all links
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportList("txt")} disabled={!!busy || !d?.total} title="Download every listed link and mark them as exported">
              {busy === "txt" ? <Spinner className="size-3.5" /> : <FileText />} Download all TXT
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => exportList("csv")} disabled={!!busy || !d?.total} title="Download every listed link and mark them as exported">
              {busy === "csv" ? <Spinner className="size-3.5" /> : <FileSpreadsheet />} Download all CSV
            </button>
          </div>
        </div>
        <div className="overflow-x-auto">
          {list.loading && !d ? (
            <TableSkeleton rows={6} cols={8} />
          ) : list.error ? (
            <div className="p-4">
              <Alert>{list.error}</Alert>
            </div>
          ) : !items.length ? (
            <EmptyState icon={Inbox} title="No job links match these filters." />
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th className="w-8">
                    <input
                      type="checkbox"
                      className="size-4 rounded align-middle"
                      aria-label="Select all on this page"
                      checked={items.every((x) => selected.has(x.url))}
                      onChange={(e) => items.forEach((x) => toggle(x.url, e.target.checked))}
                    />
                  </th>
                  <th className="num">No</th>
                  <th>Job link</th>
                  <th>Company</th>
                  <th>Role</th>
                  <th className="num">Applications</th>
                  <th>Bidders</th>
                  <th>Last generated</th>
                  <th>Exported</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((l, i) => (
                  <tr key={l.url + i} className={`cursor-pointer ${selected.has(l.url) ? "bg-indigo-50/70" : ""}`} onClick={selectOnRowClick(() => toggle(l.url, !selected.has(l.url)))}>
                    <td>
                      <input type="checkbox" className="size-4 rounded align-middle" aria-label="Select job link" checked={selected.has(l.url)} onChange={(e) => toggle(l.url, e.target.checked)} />
                    </td>
                    <td className="num text-xs text-slate-400">{offset + i + 1}</td>
                    <td className="max-w-md">
                      <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 text-indigo-600 underline-offset-2 hover:underline" title={l.url}>
                        <span className="truncate">{l.url.replace(/^https?:\/\//i, "")}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </a>
                    </td>
                    <td className="min-w-[10rem]">
                      <Link href={`/applications/${l.applicationId}`} className="text-slate-900 underline-offset-2 hover:underline">
                        {l.company || "Unknown company"}
                      </Link>
                    </td>
                    <td className="min-w-[12rem] max-w-xs text-slate-700">{l.jobTitle || "Untitled role"}</td>
                    <td className="num tabular-nums">{l.count}</td>
                    <td>
                      {l.bidders.map((b) => (
                        <div key={b._id} className="whitespace-nowrap">
                          {b.name}
                        </div>
                      ))}
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap text-slate-600" title={`First generated ${fmtStamp(l.firstAt)}`}>
                      {fmtStamp(l.lastAt)}
                    </td>
                    <td className="whitespace-nowrap">
                      {l.exportedAt ? (
                        <div title={`Last exported ${fmtStamp(l.exportedAt)}${l.exportedBy ? ` by ${l.exportedBy}` : ""} · ${l.exportCount} download(s)`}>
                          <Badge value="active" label={l.exportCount > 1 ? `Exported ×${l.exportCount}` : "Exported"} />
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500">{fmtStamp(l.exportedAt)}</div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">Not yet</span>
                      )}
                    </td>
                    <td className="actions">
                      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => copyOne(l.url)} aria-label="Copy link" title="Copy link">
                        {copied === l.url ? <CopyCheck /> : <Copy />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {d && <Pagination page={page} pageSize={pageSize} total={d.total} onPage={setPage} onPageSize={setPageSize} />}
    </div>
  );
}
