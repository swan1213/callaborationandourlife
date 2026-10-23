"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Avatar } from "@/components/Avatar";
import { PresenceAvatar } from "@/components/Presence";
import { useToast } from "@/components/Alerts";
import { ROLE_LABEL, type Role } from "@/components/Accounts";
import { CATEGORY_LABEL, FeedbackStatus, STATUS_LABEL, Thread, type FeedbackItem } from "@/components/FeedbackUi";
import { Check, Inbox, Paperclip, Send } from "lucide-react";
import { Alert, api, EmptyState, fmtDateTime, Modal, PageHeader, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

export default function Page() {
  return (
    <Suspense>
      <AdminFeedback />
    </Suspense>
  );
}

function AdminFeedback() {
  const sp = useSearchParams();
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const list = useAsync(() => api<{ items: FeedbackItem[]; unseen: number }>(`/api/feedback${status ? `?status=${status}` : ""}`), [status]);
  const [open, setOpen] = useState<FeedbackItem | null>(null);
  const rows = (list.data?.items ?? []).filter((f) => !category || f.category === category);
  const { pageRows, pager } = useClientPaging(rows, "admin-feedback");
  const toast = useToast();

  useEffect(() => {
    const id = sp.get("id");
    const f = id && list.data?.items.find((x) => x._id === id);
    if (f) setOpen(f);
  }, [sp, list.data]);

  const openItem = (f: FeedbackItem) => {
    setOpen(f);
    if (!f.seenAt) {
      api(`/api/feedback/${f._id}`, { method: "PATCH", json: { seen: true } }).catch(() => {});
      list.setData((d) => (d ? { ...d, unseen: Math.max(0, d.unseen - 1), items: d.items.map((x) => (x._id === f._id ? { ...x, seenAt: new Date().toISOString() } : x)) } : d));
    }
  };

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Feedback" subtitle={`What users, bidders and callers send you.${list.data?.unseen ? ` ${list.data.unseen} not opened yet.` : ""}`} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:flex-none">
          <label className="label">Status</label>
          <select className="input w-full sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-0 flex-1 sm:flex-none">
          <label className="label">Type</label>
          <select className="input w-full sm:w-44" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {list.data && (
          <div className="ml-auto pb-2 text-xs text-slate-500 tabular-nums">
            {rows.length} item{rows.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
      {list.error && (
        <div className="mb-4">
          <Alert>{list.error}</Alert>
        </div>
      )}
      <div className="card overflow-hidden p-0">
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !rows.length ? (
          <EmptyState icon={Inbox} title="No feedback." description="Messages sent from the feedback form will show up here." />
        ) : (
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>From</th>
                <th>Subject</th>
                <th>Type</th>
                <th className="num">Received</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((f) => (
                <tr key={f._id} className={`cursor-pointer ${f.seenAt ? "" : "bg-indigo-50/40"}`} onClick={() => openItem(f)}>
                  <td className="min-w-48">
                    <span className="flex items-center gap-3">
                      <span className="relative shrink-0">
                        {f.user ? <PresenceAvatar userId={f.user._id} avatar={f.user.avatar} name={f.userName} size={34} /> : <Avatar name={f.userName} size={34} />}
                        {!f.seenAt && <span aria-label="Not opened" className="absolute -top-0.5 -left-0.5 size-2 rounded-full bg-indigo-600 ring-2 ring-white" />}
                      </span>
                      <span className="min-w-0">
                        <span className={`block truncate text-slate-900 ${f.seenAt ? "font-medium" : "font-semibold"}`}>{f.userName}</span>
                        <span className="block text-xs text-slate-500">{ROLE_LABEL[f.role as Role] ?? f.role}</span>
                      </span>
                    </span>
                  </td>
                  <td className="min-w-[14rem]">
                    <div className={`text-slate-900 ${f.seenAt ? "" : "font-semibold"}`}>{f.subject}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                      {!!f.screenshots.length && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-slate-400 tabular-nums">
                          <Paperclip className="size-3" />
                          {f.screenshots.length} ·
                        </span>
                      )}
                      <span className="line-clamp-1">{f.message}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    <span className="chip">{CATEGORY_LABEL[f.category]}</span>
                  </td>
                  <td className="num text-xs text-slate-500">{fmtDateTime(f.createdAt)}</td>
                  <td>
                    <FeedbackStatus s={f.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!!rows.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </div>
      {open && (
        <FeedbackModal
          f={open}
          onClose={() => setOpen(null)}
          onChanged={(text) => {
            toast.success(text);
            setOpen(null);
            list.reload();
          }}
        />
      )}
    </div>
  );
}

function FeedbackModal({ f, onClose, onChanged }: { f: FeedbackItem; onClose: () => void; onChanged: (text: string) => void }) {
  const [reply, setReply] = useState("");
  const [status, setStatus] = useState(f.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/feedback/${f._id}`, { method: "PATCH", json: { status, reply } });
      onChanged(reply.trim() ? `Reply sent to ${f.userName}` : "Status saved");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open wide onClose={onClose} title={f.subject}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Avatar avatar={f.user?.avatar} name={f.userName} size={36} />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium text-slate-900">{f.userName}</div>
          <div className="truncate text-xs text-slate-500">
            {ROLE_LABEL[f.role as Role] ?? f.role} · {f.userEmail}
          </div>
        </div>
        <FeedbackStatus s={f.status} />
      </div>
      <Thread f={f} />
      <div className="mt-6 space-y-4 border-t border-slate-200 pt-5">
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label">Reply (sent to {f.userName} as a notification)</label>
          <textarea className="input min-h-24" value={reply} onChange={(e) => setReply(e.target.value)} />
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="shrink-0 text-[13px] font-medium text-slate-500">Status</span>
            <select className="input min-w-0 flex-1 sm:w-40 sm:flex-none" value={status} onChange={(e) => setStatus(e.target.value as FeedbackItem["status"])}>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <button className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn btn-primary" disabled={busy || (!reply.trim() && status === f.status)} onClick={save}>
              {busy ? <Spinner /> : reply.trim() ? <Send /> : <Check />} {reply.trim() ? "Send reply" : "Save status"}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
