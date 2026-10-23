"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScreenshotDrop } from "@/components/interviews";
import { ROLE_LABEL, type Role } from "@/components/Accounts";
import { NoteBody } from "@/components/Notifications";
import { useConfirm, useToast } from "@/components/Alerts";
import { Bell, Check, Mail, Plus, Search, Send, Trash2, Users, X } from "lucide-react";
import { Alert, api, Badge, EmptyState, fmtDateTime, Modal, PageHeader, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

type Account = { _id: string; name: string; email: string; role: Role; status: string };
type Sent = {
  _id: string;
  title: string;
  body: string;
  images: { url: string; publicId: string }[];
  email: boolean;
  emailedCount: number;
  senderName: string;
  createdAt: string;
  audience: { roles: Role[]; users: { _id: string; name: string }[] };
  recipients: number;
  reads: number;
};
type Detail = { recipients: { _id: string; name: string; email: string; role: Role; readAt: string | null }[] };
const GROUPS: Role[] = ["admin", "user", "bidder", "caller"];

export default function Page() {
  return (
    <Suspense>
      <AdminNotifications />
    </Suspense>
  );
}

function AdminNotifications() {
  const sp = useSearchParams();
  const [composing, setComposing] = useState(false);
  useEffect(() => {
    if (sp.get("new") === "1") setComposing(true);
  }, [sp]);
  const accounts = useAsync(() => api<{ users: Account[] }>("/api/admin/users").then((r) => r.users.filter((u) => u.status === "approved")), []);
  const sent = useAsync(() => api<{ messages: Sent[] }>("/api/admin/messages").then((r) => r.messages), []);
  const [detail, setDetail] = useState<Sent | null>(null);
  const toast = useToast();
  const { pageRows, pager } = useClientPaging(sent.data ?? [], "admin-notifications");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Notifications"
        subtitle="Messages you sent and who has read them. New notifications appear in each person's bell (and pop up when they sign in); you can also email them."
        actions={
          <button className="btn btn-primary" onClick={() => setComposing(true)}>
            <Plus />
            New notification
          </button>
        }
      />
      {sent.error && (
        <div className="mb-4">
          <Alert>{sent.error}</Alert>
        </div>
      )}
      {composing && (
        <Modal open wide onClose={() => setComposing(false)} title="New notification">
          <Composer
            accounts={accounts.data ?? []}
            onCancel={() => setComposing(false)}
            onSent={(msg) => {
              setComposing(false);
              toast.success("Notification sent", msg);
              sent.reload();
            }}
          />
        </Modal>
      )}
      <section className="card overflow-hidden p-0">
        <div className="card-header">
          <div className="min-w-0">
            <h2 className="card-title">Sent notifications</h2>
            <p className="card-description">Click a row to see who has read it.</p>
          </div>
          {!!sent.data?.length && (
            <span className="text-xs text-slate-500 tabular-nums">
              {sent.data.length} message{sent.data.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {sent.loading && !sent.data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !sent.data?.length ? (
          <EmptyState
            icon={Bell}
            title="Nothing sent yet."
            description="Notifications you send appear here with delivery and read status."
            action={
              <button className="btn btn-secondary" onClick={() => setComposing(true)}>
                <Send />
                Send the first notification
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Sent</th>
                  <th>Title</th>
                  <th>To</th>
                  <th>Delivery</th>
                  <th>Read by</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((m) => {
                  const pct = m.recipients ? Math.round((m.reads / m.recipients) * 100) : 0;
                  return (
                    <tr key={m._id} className="cursor-pointer" onClick={() => setDetail(m)}>
                      <td className="text-xs whitespace-nowrap text-slate-500 tabular-nums">{fmtDateTime(m.createdAt)}</td>
                      <td className="min-w-[12rem]">
                        <div className="font-medium text-slate-900">{m.title}</div>
                        <div className="line-clamp-1 text-xs text-slate-500">{m.body}</div>
                      </td>
                      <td className="max-w-56 text-xs text-slate-700">
                        {[...m.audience.roles.map((r) => `All ${ROLE_LABEL[r]}s`), ...m.audience.users.map((u) => u.name)].join(", ")}
                        <div className="mt-0.5 text-slate-400 tabular-nums">
                          {m.recipients} recipient{m.recipients === 1 ? "" : "s"}
                        </div>
                      </td>
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge value="generated" label="In-app" /> {m.email && <Badge value="approved" label={`Email ${m.emailedCount}/${m.recipients}`} />}
                        </div>
                      </td>
                      <td className="min-w-36">
                        <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                          <span className="font-medium text-slate-900">
                            {m.reads}/{m.recipients}
                          </span>
                          <span className="text-slate-400">({pct}%)</span>
                        </div>
                        <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${pct}%` }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!!sent.data?.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </section>
      {detail && (
        <DetailModal
          m={detail}
          onClose={() => setDetail(null)}
          onDeleted={() => {
            setDetail(null);
            toast.success("Notification deleted");
            sent.reload();
          }}
        />
      )}
    </div>
  );
}

function Composer({ accounts, onSent, onCancel }: { accounts: Account[]; onSent: (msg: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [roles, setRoles] = useState<Set<Role>>(new Set());
  const [people, setPeople] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [email, setEmail] = useState(false);
  const [images, setImages] = useState<{ url: string; publicId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const toggle = <T,>(set: Set<T>, setter: (s: Set<T>) => void, v: T) => {
    const n = new Set(set);
    if (n.has(v)) n.delete(v);
    else n.add(v);
    setter(n);
  };
  const recipients = useMemo(() => accounts.filter((a) => roles.has(a.role) || people.has(a._id)), [accounts, roles, people]);
  const matches = accounts.filter((a) => !roles.has(a.role) && (!q || `${a.name} ${a.email}`.toLowerCase().includes(q.toLowerCase())));

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ recipients: number }>("/api/admin/messages", {
        method: "POST",
        json: { title, body, roles: [...roles], users: [...people], email, images },
      });
      setTitle("");
      setBody("");
      setRoles(new Set());
      setPeople(new Set());
      setImages([]);
      setEmail(false);
      onSent(`Sent to ${r.recipients} ${r.recipients === 1 ? "person" : "people"}${email ? " in the app and by email" : " in the app"}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-6" onSubmit={send}>
      {error && <Alert>{error}</Alert>}
      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Users className="size-4 text-slate-400" />
          Recipients
        </legend>
        <div>
          <label className="label">Send to groups</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {GROUPS.map((g) => {
              const n = accounts.filter((a) => a.role === g).length;
              return (
                <label
                  key={g}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${roles.has(g) ? "border-indigo-300 bg-indigo-50 text-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                >
                  <input type="checkbox" className="size-4 rounded" checked={roles.has(g)} onChange={() => toggle(roles, setRoles, g)} />
                  All {ROLE_LABEL[g]}s <span className="ml-auto text-xs text-slate-400 tabular-nums">{n}</span>
                </label>
              );
            })}
          </div>
        </div>
        <div>
          <label className="label">…and/or specific people</label>
          {!!people.size && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {[...people].map((id) => {
                const a = accounts.find((x) => x._id === id);
                return (
                  <span key={id} className="chip">
                    {a?.name ?? "Unknown"}
                    <button
                      type="button"
                      className="-my-1 -mr-1 grid size-6 cursor-pointer place-items-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                      aria-label={`Remove ${a?.name}`}
                      onClick={() => toggle(people, setPeople, id)}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <div className="relative border-b border-slate-200">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
              <input
                className="w-full bg-transparent py-2 pr-3 pl-9 text-sm outline-none placeholder:text-slate-400"
                placeholder="Search name or email"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            <div className="max-h-44 divide-y divide-slate-100 overflow-y-auto">
              {matches.slice(0, 100).map((a) => (
                <label key={a._id} className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" className="size-4 rounded" checked={people.has(a._id)} onChange={() => toggle(people, setPeople, a._id)} />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-slate-900">{a.name}</span> <span className="text-xs text-slate-400">{a.email}</span>
                  </span>
                  <span className="shrink-0 text-xs text-slate-500">{ROLE_LABEL[a.role]}</span>
                </label>
              ))}
              {!matches.length && <div className="px-3 py-3 text-center text-xs text-slate-400">No matching people.</div>}
            </div>
          </div>
        </div>
      </fieldset>
      <div className="divider" />
      <fieldset className="space-y-4">
        <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Mail className="size-4 text-slate-400" />
          Message
        </legend>
        <div>
          <label className="label">Title *</label>
          <input className="input" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="input min-h-32" value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div>
          <label className="label">Images / screenshots</label>
          <ScreenshotDrop value={images} onChange={setImages} max={10} />
        </div>
        <div>
          <label className="label">Delivery</label>
          <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            {[
              [false, "In-app only", "Bell + popup on sign-in"],
              [true, "In-app + email", "Also emailed to each person"],
            ].map(([v, label, hint]) => (
              <label
                key={String(v)}
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${email === v ? "border-indigo-300 bg-indigo-50" : "border-slate-200 hover:bg-slate-50"}`}
              >
                <input type="radio" name="delivery" className="mt-0.5 size-4" checked={email === v} onChange={() => setEmail(v as boolean)} />
                <span>
                  <span className="block font-medium text-slate-900">{label as string}</span>
                  <span className="block text-xs text-slate-500">{hint as string}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>
      <div className="-mx-5 -mb-5 flex flex-col-reverse gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={busy || !title.trim() || !recipients.length}>
          {busy ? <Spinner /> : <Send />} Send to {recipients.length} {recipients.length === 1 ? "person" : "people"}
        </button>
      </div>
    </form>
  );
}

function DetailModal({ m, onClose, onDeleted }: { m: Sent; onClose: () => void; onDeleted: () => void }) {
  const detail = useAsync(() => api<Detail>(`/api/admin/messages/${m._id}`), [m._id]);
  const [filter, setFilter] = useState<"all" | "read" | "unread">("all");
  const rows = (detail.data?.recipients ?? []).filter((r) => filter === "all" || (filter === "read" ? r.readAt : !r.readAt));
  const read = (detail.data?.recipients ?? []).filter((r) => r.readAt).length;
  const toast = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (
      !(await confirm({
        title: "Delete this notification?",
        message: "It is removed from everyone's bell, including people who haven't read it yet.",
        confirmLabel: "Delete notification",
        danger: true,
      }))
    )
      return;
    setDeleting(true);
    try {
      await api(`/api/admin/messages/${m._id}`, { method: "DELETE" });
      onDeleted();
    } catch (e) {
      toast.error("Couldn't delete the notification", (e as Error).message);
      setDeleting(false);
    }
  }
  return (
    <Modal open wide onClose={onClose} title={m.title}>
      <NoteBody n={{ ...m, read: true, kind: "message", tone: "info", url: "" }} />
      <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-5">
        <div className="text-sm font-semibold text-slate-900 tabular-nums">
          Read by {read} of {detail.data?.recipients.length ?? m.recipients}
        </div>
        <div className="segmented" role="group" aria-label="Filter recipients">
          {(["all", "read", "unread"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className="capitalize">
              {f}
            </button>
          ))}
        </div>
      </div>
      {detail.loading ? (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <TableSkeleton rows={4} cols={3} />
        </div>
      ) : (
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200">
          <table className="table">
            <thead>
              <tr>
                <th>Recipient</th>
                <th>Role</th>
                <th>Read</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id}>
                  <td>
                    <div className="font-medium text-slate-900">{r.name}</div>
                    <div className="text-xs text-slate-500">{r.email}</div>
                  </td>
                  <td className="text-xs text-slate-700">{ROLE_LABEL[r.role] ?? "—"}</td>
                  <td className="text-xs whitespace-nowrap">
                    {r.readAt ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 tabular-nums">
                        <Check className="size-3.5" /> {fmtDateTime(r.readAt)}
                      </span>
                    ) : (
                      <span className="text-slate-400">Not read</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-4 flex justify-end">
        <button className="btn btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={deleting} onClick={remove}>
          {deleting ? <Spinner /> : <Trash2 />}
          Delete notification
        </button>
      </div>
    </Modal>
  );
}
