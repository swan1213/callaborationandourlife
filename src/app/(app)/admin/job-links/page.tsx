"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useConfirm, useToast } from "@/components/Alerts";
import SearchSelect from "@/components/SearchSelect";
import { Check, CircleCheck, ClipboardCheck, Copy, CopyCheck, Eraser, ExternalLink, IdCard, Inbox, Link2, ListTodo, Search, X } from "lucide-react";
import {
  Alert,
  api,
  Badge,
  DateRangeFilter,
  EmptyState,
  fmtStamp,
  limitParam,
  PageHeader,
  Pagination,
  rangeParams,
  selectOnRowClick,
  Spinner,
  Stat,
  TableSkeleton,
  useAsync,
  usePageSize,
} from "@/components/ui";

type Person = { _id: string; name: string };
type JobLink = {
  url: string;
  company: string;
  jobTitle: string;
  count: number;
  bidders: Person[];
  firstAt: string;
  lastAt: string;
  applicationId: string;
  copiedAt: string | null;
  copiedBy: string;
  copyCount: number;
};
type ProfileOpt = {
  _id: string;
  label: string;
  fullName: string;
  active: boolean;
  experience?: { title?: string }[];
  usage: { total: number; month: number };
};
type Resp = {
  items: JobLink[];
  total: number;
  unique: number;
  applied: number;
  notApplied: number;
  copied: number;
  page: number;
  limit: number;
};

/** The profile picked last time (per browser), so the page reopens on it. */
const PROFILE_KEY = "tb-job-links-profile";

export default function JobLinksPage() {
  const [profile, setProfile] = useState("");
  const [copiedFilter, setCopiedFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("job-links");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  // Selected job links, keyed by URL (each URL is listed once). Kept across pages and filters, cleared with the profile.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toast = useToast();
  const confirm = useConfirm();

  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const [profileQ, setProfileQ] = useState("");

  // Reopen on the last profile, if it is still in the list.
  useEffect(() => {
    if (!profiles.data) return;
    try {
      const last = localStorage.getItem(PROFILE_KEY);
      if (last && profiles.data.some((p) => p._id === last)) setProfile(last);
    } catch {
      /* storage unavailable */
    }
  }, [profiles.data]);

  function pickProfile(id: string) {
    setProfile(id);
    setSelected(new Set());
    setPage(1);
    try {
      if (id) localStorage.setItem(PROFILE_KEY, id);
      else localStorage.removeItem(PROFILE_KEY);
    } catch {
      /* storage unavailable */
    }
  }

  const params = () => {
    const p = rangeParams(from, to);
    p.set("profile", profile);
    if (copiedFilter) p.set("copied", copiedFilter);
    if (q) p.set("q", q);
    return p;
  };

  const list = useAsync(() => {
    if (!profile) return Promise.resolve(null);
    const p = params();
    p.set("page", String(page));
    p.set("limit", limitParam(pageSize));
    return api<Resp>(`/api/admin/job-links?${p}`);
  }, [profile, copiedFilter, from, to, q, page, pageSize]);

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const items = list.data?.items ?? [];
  const offset = pageSize === "all" ? 0 : (page - 1) * pageSize;

  /** Marks links the page copied as copied for this profile (shown in the Copied column). */
  const markCopied = (urls: string[]) =>
    api("/api/admin/job-links", { method: "POST", json: { profile, urls } })
      .then(() => list.reload())
      .catch((e) => toast.warning("Copied, but not marked as copied", (e as Error).message));

  async function copySelected() {
    if (!selected.size) return toast.warning("No job links selected", "Tick the job links you want to copy, then try again.");
    const urls = [...selected];
    try {
      await navigator.clipboard.writeText(urls.join("\r\n"));
    } catch {
      return toast.error("Copy failed");
    }
    toast.success(`${urls.length} job link(s) copied`, "One per line, ready to paste into Generate Resume. They are now marked as copied for this profile.");
    setSelected(new Set());
    markCopied(urls);
  }

  async function copyAll() {
    setBusy("copy");
    try {
      const p = params();
      p.set("copy", "1");
      const { urls } = await api<{ urls: string[] }>(`/api/admin/job-links?${p}`);
      await navigator.clipboard.writeText(urls.join("\r\n"));
      toast.success(`${urls.length} job link(s) copied`, "One per line, ready to paste into Generate Resume. They are now marked as copied for this profile.");
      list.reload();
    } catch (e) {
      toast.error("Copy failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  /** Clear copied: the ticked links when some are ticked, otherwise this profile's whole copy history. */
  async function clearCopied() {
    const urls = [...selected];
    const name = profileLabel || "this profile";
    const ok = await confirm({
      title: urls.length ? `Clear copied for ${urls.length} job link(s)?` : `Clear all copy history for ${name}?`,
      message: urls.length
        ? `The ticked job links will show as not copied for ${name} again. Other profiles are not affected.`
        : `Every job link will show as not copied for ${name} again, and the Copied count goes back to 0. Other profiles are not affected. This can't be undone.`,
      confirmLabel: "Clear copied",
      danger: true,
    });
    if (!ok) return;
    setBusy("clear");
    try {
      const r = await api<{ cleared: number }>("/api/admin/job-links", { method: "DELETE", json: urls.length ? { profile, urls } : { profile } });
      toast.success(r.cleared ? `Copied cleared for ${r.cleared} job link(s)` : "Nothing to clear", r.cleared ? `They show as not copied for ${name} again.` : undefined);
      setSelected(new Set());
      list.reload();
    } catch (e) {
      toast.error("Couldn't clear copied", (e as Error).message);
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
    } catch {
      return toast.error("Copy failed");
    }
    setCopied(url);
    setTimeout(() => setCopied((c) => (c === url ? "" : c)), 1500);
    markCopied([url]);
  }

  const d = list.data;
  const profileLabel = profiles.data?.find((p) => p._id === profile)?.label ?? "";
  const pq = profileQ.trim().toLowerCase();
  const shownProfiles = (profiles.data ?? []).filter((p) => !pq || [p.label, p.fullName, p.experience?.[0]?.title ?? ""].some((s) => s.toLowerCase().includes(pq)));
  return (
    <div className="mx-auto max-w-[1600px]">
      <PageHeader
        title="Job links"
        subtitle="Pick a profile to see the job links found for other profiles that it hasn't applied to yet, each listed once. Copy them into Generate Resume."
      />

      {/* Profiles sit above the table on laptop screens (a compact grid) and beside it from 2xl, so the table always has room. */}
      <div className="grid gap-6 2xl:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="min-w-0 space-y-3 2xl:sticky 2xl:top-20 2xl:self-start">
          <div className="flex items-center gap-2.5">
            <span className="grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-700 tabular-nums">
              1
            </span>
            <h2 className="card-title">Choose a profile</h2>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search profiles" value={profileQ} onChange={(e) => setProfileQ(e.target.value)} aria-label="Search profiles" />
          </div>
          <div className="grid max-h-60 gap-2 overflow-y-auto pr-1 sm:grid-cols-2 xl:grid-cols-3 2xl:block 2xl:max-h-[calc(100dvh-13rem)] 2xl:space-y-2">
            {profiles.loading ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : profiles.error ? (
              <Alert>{profiles.error}</Alert>
            ) : !shownProfiles.length ? (
              <div className="px-1 py-4 text-[13px] text-slate-500">{profiles.data?.length ? "No profile matches." : "No profiles yet."}</div>
            ) : (
              shownProfiles.map((p) => {
                const active = p._id === profile;
                const title = p.experience?.[0]?.title;
                return (
                  <button
                    key={p._id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => pickProfile(p._id)}
                    className={`card w-full cursor-pointer p-3 text-left 2xl:p-4 transition-[border-color,box-shadow] ${
                      active ? "border-indigo-500 ring-[3px] ring-indigo-500/15" : "hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{p.label}</div>
                        <div className="truncate text-[13px] text-slate-500">
                          {p.fullName}
                          {title && ` · ${title}`}
                        </div>
                      </div>
                      <span
                        aria-hidden
                        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full border ${active ? "border-indigo-600 bg-indigo-600 text-white" : "border-slate-300"}`}
                      >
                        {active && <Check className="size-3" strokeWidth={3} />}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-500 tabular-nums">
                      {p.usage.month} generated this month
                      {!p.active && <span className="text-amber-600"> · inactive</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        <div className="min-w-0">
          {!profile ? (
            <div className="card">
              <EmptyState
                icon={IdCard}
                title="Choose a profile first"
                description={profiles.loading ? "Loading profiles…" : "Pick a profile from the list. This shows the job links it hasn't applied to yet."}
              />
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-end gap-3">
                <DateRangeFilter from={from} to={to} onChange={(f, tt) => reset(() => (setFrom(f), setTo(tt)))} />
                <div className="w-full sm:w-40">
                  <label className="label">Copied</label>
                  <SearchSelect
                    aria-label="Copied"
                    value={copiedFilter}
                    onChange={(v) => reset(() => setCopiedFilter(v))}
                    emptyOption="All"
                    options={[
                      { value: "no", label: "Not copied" },
                      { value: "yes", label: "Copied" },
                    ]}
                  />
                </div>
                <div className="min-w-0 flex-1 basis-full sm:min-w-56 sm:basis-auto">
                  <label className="label">Search</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                    <input className="input pl-9" placeholder="Company, role or URL" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
                  </div>
                </div>
              </div>

              <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
                <Stat label="Unique job links" value={d?.unique ?? "—"} icon={Link2} hint="found for any profile" />
                <Stat label="Already applied" value={d?.applied ?? "—"} icon={CircleCheck} hint={profileLabel ? `by ${profileLabel}` : "by this profile"} />
                <Stat label="Not applied yet" value={d?.notApplied ?? "—"} icon={ListTodo} hint="listed below" />
                <Stat label="Copied" value={d?.copied ?? "—"} icon={ClipboardCheck} hint="for this profile" />
              </div>

              <div className="card overflow-hidden p-0">
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2.5 sm:px-4">
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={copySelected}
                    disabled={!!busy || !selected.size}
                    title="Copy the ticked links, one per line, and mark them as copied for this profile"
                  >
                    <Copy /> Copy selected
                    {selected.size ? ` (${selected.size})` : ""}
                  </button>
                  {selected.size > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())} disabled={!!busy}>
                      <X /> Clear
                    </button>
                  )}
                  <span className={`text-xs ${selected.size ? "text-slate-500" : "text-slate-400"}`}>
                    {selected.size ? `${selected.size} selected` : "No job links selected · tick rows to copy them"}
                  </span>
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <button
                      className="btn btn-ghost btn-sm text-rose-600"
                      onClick={clearCopied}
                      disabled={!!busy || (!selected.size && !d?.copied)}
                      title={selected.size ? "Mark the ticked links as not copied for this profile" : "Mark every link as not copied for this profile"}
                    >
                      {busy === "clear" ? <Spinner className="size-3.5" /> : <Eraser />} Clear copied
                      {selected.size ? ` (${selected.size})` : ""}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={copyAll}
                      disabled={!!busy || !d?.total}
                      title="Copy every listed link and mark them as copied for this profile"
                    >
                      {busy === "copy" ? <Spinner className="size-3.5" /> : <Copy />} Copy all links
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
                    <EmptyState
                      icon={Inbox}
                      title={d?.notApplied === 0 && !q && !from && !to ? "This profile has applied to every job link found." : "No job links match these filters."}
                    />
                  ) : (
                    /* Fixed column widths: long URLs, companies and roles shorten or wrap inside their column instead of
                       widening the table, so it fits the page (phones still scroll sideways). */
                    <table className="table table-fixed min-w-[56rem]">
                      <colgroup>
                        <col className="w-12" />
                        <col className="w-14" />
                        <col />
                        <col className="w-[28%]" />
                        <col className="w-36" />
                        <col className="w-28" />
                        <col className="w-28" />
                        <col className="w-16" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th>
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
                          <th>Company · role</th>
                          <th>Generated by</th>
                          <th>Last generated</th>
                          <th>Copied</th>
                          <th className="actions">
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((l, i) => (
                          <tr
                            key={l.url + i}
                            className={`cursor-pointer ${selected.has(l.url) ? "bg-indigo-50/70" : ""}`}
                            onClick={selectOnRowClick(() => toggle(l.url, !selected.has(l.url)))}
                          >
                            <td>
                              <input
                                type="checkbox"
                                className="size-4 rounded align-middle"
                                aria-label="Select job link"
                                checked={selected.has(l.url)}
                                onChange={(e) => toggle(l.url, e.target.checked)}
                              />
                            </td>
                            <td className="num text-xs text-slate-400">{offset + i + 1}</td>
                            <td>
                              <a
                                href={l.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex min-w-0 items-center gap-1 text-indigo-600 underline-offset-2 hover:underline"
                                title={l.url}
                              >
                                <span className="truncate">{l.url.replace(/^https?:\/\//i, "")}</span>
                                <ExternalLink className="size-3 shrink-0" />
                              </a>
                            </td>
                            <td>
                              <Link href={`/applications/${l.applicationId}`} className="block truncate font-medium text-slate-900 underline-offset-2 hover:underline" title={l.company}>
                                {l.company || "Unknown company"}
                              </Link>
                              <div className="line-clamp-2 text-xs break-words text-slate-500" title={l.jobTitle}>
                                {l.jobTitle || "Untitled role"}
                              </div>
                            </td>
                            <td>
                              <div className="flex min-w-0 items-start gap-1.5">
                                <div className="min-w-0 flex-1">
                                  {l.bidders.map((b) => (
                                    <div key={b._id} className="truncate" title={b.name}>
                                      {b.name}
                                    </div>
                                  ))}
                                </div>
                                {l.count > 1 && (
                                  <span className="chip shrink-0 tabular-nums" title={`Generated ${l.count} times`}>
                                    ×{l.count}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="font-mono text-xs text-slate-600" title={`Last ${fmtStamp(l.lastAt)} · first ${fmtStamp(l.firstAt)}`}>
                              <div>{fmtStamp(l.lastAt).slice(0, 10)}</div>
                              <div className="text-slate-400">{fmtStamp(l.lastAt).slice(11)}</div>
                            </td>
                            <td>
                              {l.copiedAt ? (
                                <div title={`Last copied ${fmtStamp(l.copiedAt)}${l.copiedBy ? ` by ${l.copiedBy}` : ""} · copied ${l.copyCount} time(s) for this profile`}>
                                  <Badge value="active" label={l.copyCount > 1 ? `Copied ×${l.copyCount}` : "Copied"} />
                                  <div className="mt-0.5 font-mono text-[11px] text-slate-500">{fmtStamp(l.copiedAt).slice(0, 10)}</div>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
