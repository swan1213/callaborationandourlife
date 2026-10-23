"use client";

import { useState } from "react";
import { Download, RefreshCw, ScrollText, Search, TriangleAlert } from "lucide-react";
import { ROLE_LABEL, type Role } from "@/components/Accounts";
import DateInput from "@/components/DateInput";
import { useToast } from "@/components/Alerts";
import { Alert, api, Badge, downloadFile, EmptyState, fmtStamp, limitParam, Modal, PageHeader, Pagination, rangeParams, Spinner, TableSkeleton, useAsync, usePageSize } from "@/components/ui";

type Log = {
  _id: string;
  level: "info" | "warn" | "error";
  category: string;
  action: string;
  summary: string;
  actor?: string | null;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  method: string;
  path: string;
  targetId: string;
  status: number;
  durationMs: number;
  ip: string;
  userAgent: string;
  meta: unknown;
  createdAt: string;
};
type Resp = { items: Log[]; total: number; categories: string[]; byCategory: Record<string, number>; errors24h: number };

const CATEGORY_LABEL: Record<string, string> = {
  auth: "Sign-in",
  application: "Applications",
  interview: "Interviews",
  account: "Accounts",
  profile: "Profiles",
  notification: "Notifications",
  feedback: "Feedback",
  settings: "Settings",
  email: "Emails",
  system: "System",
  other: "Other",
};
const LEVEL_BADGE = { info: "generated", warn: "pending", error: "rejected" } as const;

export default function LogsPage() {
  const [category, setCategory] = useState("");
  const [level, setLevel] = useState("");
  const [actor, setActor] = useState("");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = usePageSize("admin-logs", 50);
  const [open, setOpen] = useState<Log | null>(null);
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const users = useAsync(() => api<{ users: { _id: string; name: string; email: string }[] }>("/api/admin/users").then((r) => r.users), []);
  const params = () => {
    const p = rangeParams(from, to);
    if (category) p.set("category", category);
    if (level) p.set("level", level);
    if (actor) p.set("actor", actor);
    if (q) p.set("q", q);
    return p;
  };
  const list = useAsync(() => {
    const p = params();
    p.set("page", String(page));
    p.set("limit", limitParam(pageSize));
    return api<Resp>(`/api/admin/logs?${p}`);
  }, [category, level, actor, q, from, to, page, pageSize]);
  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadFile(`/api/admin/logs/export?${params()}`, "logs.csv");
    } catch (e) {
      toast.error("Export failed", (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const d = list.data;
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Logs"
        subtitle="Everything that happens in TailorBid: sign-ins, changes, downloads, emails and server errors. Kept for one year."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => list.reload()}>
              <RefreshCw className={list.loading && d ? "animate-spin" : ""} />
              Refresh
            </button>
            <button className="btn btn-primary" onClick={exportCsv} disabled={exporting || !d?.total}>
              {exporting ? <Spinner /> : <Download />} Export CSV
            </button>
          </>
        }
      />

      {/* Category chips with counts */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-full overflow-x-auto">
          <div role="group" aria-label="Category" className="segmented">
            <button type="button" aria-pressed={!category} onClick={() => reset(() => setCategory(""))}>
              All <span className="text-xs text-slate-400 tabular-nums">{d ? Object.values(d.byCategory).reduce((a, b) => a + b, 0) : ""}</span>
            </button>
            {(d?.categories ?? Object.keys(CATEGORY_LABEL)).map((c) => (
              <button key={c} type="button" aria-pressed={category === c} onClick={() => reset(() => setCategory(category === c ? "" : c))}>
                {CATEGORY_LABEL[c] ?? c} <span className="text-xs text-slate-400 tabular-nums">{d?.byCategory[c] ?? 0}</span>
              </button>
            ))}
          </div>
        </div>
        {!!d?.errors24h && (
          <button
            onClick={() => reset(() => setLevel("error"))}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-[13px] font-medium text-rose-700 transition-colors hover:bg-rose-100"
          >
            <TriangleAlert className="size-3.5" />
            <span className="tabular-nums">{d.errors24h}</span> error{d.errors24h === 1 ? "" : "s"} in the last 24h
          </button>
        )}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-4 py-3.5 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-end sm:px-5">
          <div className="min-w-0 min-[400px]:col-span-2 sm:min-w-56 sm:flex-1">
            <label className="label">Search</label>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="Action, path, name or email" value={q} onChange={(e) => reset(() => setQ(e.target.value))} />
            </div>
          </div>
          <div>
            <label className="label">From</label>
            <DateInput aria-label="From date" className="w-full sm:w-40" value={from} onChange={(v) => reset(() => setFrom(v))} />
          </div>
          <div>
            <label className="label">To</label>
            <DateInput aria-label="To date" className="w-full sm:w-40" value={to} onChange={(v) => reset(() => setTo(v))} />
          </div>
          <div>
            <label className="label">Level</label>
            <select className="input w-full sm:w-auto sm:min-w-32" value={level} onChange={(e) => reset(() => setLevel(e.target.value))}>
              <option value="">All</option>
              <option value="info">Info</option>
              <option value="warn">Warnings (refused / failed)</option>
              <option value="error">Errors</option>
            </select>
          </div>
          <div>
            <label className="label">Person</label>
            <select className="input w-full sm:w-auto sm:max-w-56" value={actor} onChange={(e) => reset(() => setActor(e.target.value))}>
              <option value="">Everyone</option>
              {users.data?.map((u) => (
                <option key={u._id} value={u._id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
          </div>
        </div>
        {list.loading && !d ? (
          <TableSkeleton rows={6} cols={7} />
        ) : list.error ? (
          <div className="p-4">
            <Alert>{list.error}</Alert>
          </div>
        ) : !d?.items.length ? (
          <EmptyState icon={ScrollText} title="No log entries match." description="Try a wider date range or clear some filters." />
        ) : (
          <>
          {/* Phones: stacked list of the same rows */}
          <ul className="divide-y divide-slate-200 md:hidden">
            {d.items.map((l) => (
              <li key={l._id}>
                <button
                  type="button"
                  className={`block w-full cursor-pointer px-4 py-3 text-left transition-colors hover:bg-slate-50 ${l.level === "error" ? "bg-rose-50/50" : ""}`}
                  onClick={() => setOpen(l)}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge value={LEVEL_BADGE[l.level]} label={l.level} />
                    <span className="text-xs text-slate-700">{CATEGORY_LABEL[l.category] ?? l.category}</span>
                    <span className="ml-auto font-mono text-[11px] text-slate-500 tabular-nums">{fmtStamp(l.createdAt)}</span>
                  </div>
                  <div className="mt-1.5 text-[13px] text-slate-900">{l.summary}</div>
                  <div className="mt-0.5 font-mono text-[11px] break-all text-slate-400">{l.action}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span>
                      {l.actorName || l.actorEmail ? (
                        <>
                          <span className="text-slate-700">{l.actorName || l.actorEmail}</span>{" "}
                          <span className="text-slate-400">· {ROLE_LABEL[l.actorRole as Role] ?? (l.category === "email" ? "System" : "Unknown")}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">{l.category === "email" || l.category === "system" ? "System" : "Anonymous"}</span>
                      )}
                    </span>
                    <span className="font-mono tabular-nums">
                      <span className={l.status >= 500 ? "font-medium text-rose-600" : l.status >= 400 ? "font-medium text-amber-600" : ""}>{l.status || "—"}</span>
                      {l.durationMs ? <span className="text-slate-400"> · {l.durationMs} ms</span> : null}
                    </span>
                    <span className="font-mono">{l.ip || "—"}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Category</th>
                  <th>Who</th>
                  <th>What</th>
                  <th className="num">Status</th>
                  <th>IP</th>
                </tr>
              </thead>
              <tbody>
                {d.items.map((l) => (
                  <tr key={l._id} className={`cursor-pointer ${l.level === "error" ? "bg-rose-50/50" : ""}`} onClick={() => setOpen(l)}>
                    <td className="py-2! font-mono text-xs whitespace-nowrap text-slate-500 tabular-nums">{fmtStamp(l.createdAt)}</td>
                    <td className="py-2!">
                      <Badge value={LEVEL_BADGE[l.level]} label={l.level} />
                    </td>
                    <td className="py-2! text-xs whitespace-nowrap text-slate-700">{CATEGORY_LABEL[l.category] ?? l.category}</td>
                    <td className="py-2! whitespace-nowrap">
                      {l.actorName || l.actorEmail ? (
                        <>
                          <div className="text-slate-900">{l.actorName || l.actorEmail}</div>
                          <div className="text-xs text-slate-400">{ROLE_LABEL[l.actorRole as Role] ?? (l.category === "email" ? "System" : "Unknown")}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">{l.category === "email" || l.category === "system" ? "System" : "Anonymous"}</span>
                      )}
                    </td>
                    <td className="max-w-md py-2!">
                      <div className="truncate text-slate-900">{l.summary}</div>
                      <div className="truncate font-mono text-[11px] text-slate-400">{l.action}</div>
                    </td>
                    <td className="num py-2! font-mono text-xs">
                      <span className={l.status >= 500 ? "font-medium text-rose-600" : l.status >= 400 ? "font-medium text-amber-600" : "text-slate-500"}>{l.status || "—"}</span>
                      {l.durationMs ? <div className="text-[11px] text-slate-400">{l.durationMs} ms</div> : null}
                    </td>
                    <td className="py-2! font-mono text-xs whitespace-nowrap text-slate-500">{l.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {d && (
          <div className="border-t border-slate-200 px-4 pb-3">
            <Pagination page={page} pageSize={pageSize} total={d.total} onPage={setPage} onPageSize={setPageSize} />
          </div>
        )}
      </div>

      {open && (
        <Modal open wide onClose={() => setOpen(null)} title={open.summary}>
          <dl className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 text-sm">
            {(
              [
                ["Time", fmtStamp(open.createdAt)],
                ["Level", open.level],
                ["Category", CATEGORY_LABEL[open.category] ?? open.category],
                ["Who", [open.actorName, open.actorEmail, ROLE_LABEL[open.actorRole as Role]].filter(Boolean).join(" · ") || "—"],
                ["Action", open.action],
                ["Request", open.method ? `${open.method} ${open.path}` : "—"],
                ["Target id", open.targetId || "—"],
                ["Status", open.status ? `${open.status}${open.durationMs ? ` · ${open.durationMs} ms` : ""}` : "—"],
                ["IP address", open.ip || "—"],
                ["Browser", open.userAgent || "—"],
              ] as [string, string][]
            ).map(([k, v]) => (
              <div key={k} className="grid grid-cols-1 gap-1 px-3.5 py-2.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="text-[13px] text-slate-500">{k}</dt>
                <dd className="min-w-0 font-mono text-xs leading-5 break-all text-slate-900">{v}</dd>
              </div>
            ))}
          </dl>
          {open.meta != null && (
            <div className="mt-5">
              <div className="mb-1.5 text-[13px] font-medium text-slate-500">Details</div>
              <pre className="max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">{JSON.stringify(open.meta, null, 2)}</pre>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}
