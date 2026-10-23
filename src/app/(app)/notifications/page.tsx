"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BellOff, CheckCheck, Image as ImageIcon, Inbox } from "lucide-react";
import { NoteIcon, useNotifications, type Note } from "@/components/Notifications";
import { api, EmptyState, fmtDateTime, PageHeader, Segmented, SkeletonText, useAsync, useClientPaging } from "@/components/ui";

const GROUPS: Record<string, string> = { interviews: "Interviews", messages: "Messages", account: "Account & profiles", feedback: "Feedback", milestones: "Milestones" };
const groupOf = (kind: string) =>
  kind === "message" ? "messages" : kind.startsWith("interview") ? "interviews" : kind.startsWith("feedback") ? "feedback" : kind === "milestone" ? "milestones" : "account";

export default function Page() {
  return (
    <Suspense>
      <NotificationsPage />
    </Suspense>
  );
}

function NotificationsPage() {
  const sp = useSearchParams();
  const { open, markAll, reload: reloadBell } = useNotifications();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [type, setType] = useState("");
  const list = useAsync(() => api<{ items: Note[]; unread: number }>("/api/notifications?limit=500"), []);
  const items = (list.data?.items ?? []).filter((n) => (filter === "all" || !n.read) && (!type || groupOf(n.kind) === type));
  const { pageRows, pager } = useClientPaging(items, "notifications");

  const view = (n: Note) => {
    open(n);
    list.setData((d) => (d ? { ...d, unread: n.read ? d.unread : Math.max(0, d.unread - 1), items: d.items.map((x) => (x._id === n._id ? { ...x, read: true } : x)) } : d));
  };

  // Deep link from the email: /notifications?id=...
  useEffect(() => {
    const id = sp.get("id");
    const n = id && list.data?.items.find((x) => x._id === id);
    if (n) view(n);
  }, [sp, list.data?.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Notifications"
        subtitle="Updates on your interviews, profiles and account, and messages from your administrators."
        actions={
          !!list.data?.unread && (
            <button
              className="btn btn-secondary"
              onClick={() => {
                markAll();
                list.setData((d) => (d ? { ...d, unread: 0, items: d.items.map((x) => ({ ...x, read: true })) } : d));
                setTimeout(reloadBell, 500);
              }}
            >
              <CheckCheck />
              Mark all read
            </button>
          )
        }
      />
      <div className="card overflow-hidden p-0">
        <div className="card-header">
          <Segmented
            label="Filter notifications"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "unread", label: "Unread", count: list.data?.unread ?? 0 },
            ]}
          />
          <div className="flex items-center gap-3">
            <select className="input w-auto py-1.5 text-[13px]" aria-label="Type" value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All types</option>
              {Object.entries(GROUPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            {!!list.data && <span className="text-xs whitespace-nowrap text-slate-500 tabular-nums">{items.length.toLocaleString()} shown</span>}
          </div>
        </div>
        {list.loading && !list.data ? (
          <div className="divide-y divide-slate-200">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="px-5 py-4">
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        ) : !items.length ? (
          filter === "unread" ? (
            <EmptyState icon={Inbox} title="You're all caught up." description="There are no unread notifications." />
          ) : (
            <EmptyState icon={BellOff} title="No notifications yet." description="Updates on your interviews, profiles and account, and messages from your administrators, appear here." />
          )
        ) : (
          <ul className="divide-y divide-slate-200">
            {pageRows.map((n) => (
              <li key={n._id}>
                <button onClick={() => view(n)} className={`group relative flex w-full cursor-pointer gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50 ${n.read ? "" : "bg-indigo-50/30"}`}>
                  {!n.read && <span aria-hidden className="absolute top-1/2 left-2 size-1.5 -translate-y-1/2 rounded-full bg-indigo-600" />}
                  <NoteIcon n={n} />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm ${n.read ? "text-slate-700" : "font-medium text-slate-900"}`}>
                      {!n.read && <span className="sr-only">Unread: </span>}
                      {n.title}
                    </span>
                    <span className="mt-0.5 line-clamp-2 block text-[13px] text-slate-500">{n.body}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-slate-400">
                      <span>{n.kind === "message" ? n.senderName : GROUPS[groupOf(n.kind)]}</span>
                      <span aria-hidden>·</span>
                      <span className="tabular-nums">{fmtDateTime(n.createdAt)}</span>
                      {n.images.length ? (
                        <>
                          <span aria-hidden>·</span>
                          <span className="inline-flex items-center gap-1">
                            <ImageIcon className="size-3" />
                            {`${n.images.length} image${n.images.length === 1 ? "" : "s"}`}
                          </span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  {!!n.images.length && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={n.images[0].url.replace("/upload/", "/upload/c_fill,w_120,h_80/")}
                      alt=""
                      className="h-12 w-18 shrink-0 rounded-md border border-slate-200 object-cover"
                    />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!!items.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </div>
    </div>
  );
}
