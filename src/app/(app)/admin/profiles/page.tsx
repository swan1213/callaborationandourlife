"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRole } from "@/components/AppShell";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import { useConfirm, useToast } from "@/components/Alerts";
import { Avatar } from "@/components/Avatar";
import { Eye, Pencil, Plus, Power, PowerOff, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Alert, api, ApiError, Badge, EmptyState, PageHeader, Segmented, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

type Row = {
  _id: string;
  label: string;
  fullName: string;
  email: string;
  location: string;
  active: boolean;
  apiKey?: { label: string; keyMask: string; model: string; active: boolean } | null;
  openaiModel?: string;
  monthlyQuota: number;
  experience: { title: string; company: string }[];
  usage: { total: number; month: number; monthPromptTokens: number; monthCompletionTokens: number };
  assignedTo: { id: string; name: string }[];
  managers: { id: string; name: string }[];
};

export default function ProfilesPage() {
  const isAdmin = useRole() === "admin";
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const { data, error, loading, reload } = useAsync(() => api<{ profiles: Row[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");

  const rows = (data ?? []).filter((p) => {
    if (status === "active" && !p.active) return false;
    if (status === "inactive" && p.active) return false;
    const needle = q.trim().toLowerCase();
    return !needle || [p.label, p.fullName, p.email, p.experience[0]?.title, p.experience[0]?.company].some((v) => v?.toLowerCase().includes(needle));
  });

  async function toggleActive(p: Row) {
    if (
      p.active &&
      !(await confirm({
        title: `Deactivate ${p.label}?`,
        message: "Users can no longer generate applications with it until it is activated again.",
        confirmLabel: "Deactivate",
      }))
    )
      return;
    setBusy(p._id);
    try {
      await api(`/api/admin/profiles/${p._id}`, { method: "PATCH", json: { active: !p.active } });
      if (p.active) toast.success(`${p.label} deactivated`, "Users can no longer generate with it.");
      else toast.success(`${p.label} activated`);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function remove(p: Row) {
    if (
      !(await confirm({
        title: "Delete this profile?",
        message: `"${p.label}" will be deleted permanently. This cannot be undone.`,
        confirmLabel: "Delete profile",
        danger: true,
      }))
    )
      return;
    setBusy(p._id);
    try {
      await api(`/api/admin/profiles/${p._id}`, { method: "DELETE" });
      toast.success(`${p.label} deleted`);
      reload();
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.data.history) {
        const ok = await confirm({
          title: "Delete anyway?",
          message: (
            <>
              <p>{err.message}</p>
              <p className="mt-2">
                The {String(err.data.history)} application(s) stay in the history under &ldquo;{p.label} (deleted)&rdquo;. Tip: deactivating keeps the profile but stops new bids.
              </p>
            </>
          ),
          confirmLabel: "Delete anyway",
          danger: true,
        });
        if (ok) {
          try {
            await api(`/api/admin/profiles/${p._id}?force=1`, { method: "DELETE" });
            toast.success(`${p.label} deleted`, "Its history was kept.");
            reload();
          } catch (e2) {
            toast.error((e2 as Error).message);
          }
        }
      } else toast.error(err.message);
    } finally {
      setBusy("");
    }
  }

  const { pageRows, pager } = useClientPaging(rows, "profiles");
  const counts = { all: data?.length ?? 0, active: data?.filter((p) => p.active).length ?? 0, inactive: data?.filter((p) => !p.active).length ?? 0 };

  const menuItems = (p: Row): ActionItem[] => [
    { label: "View", icon: Eye, onSelect: () => router.push(`/admin/profiles/${p._id}/view`) },
    { label: "Edit", icon: Pencil, onSelect: () => router.push(`/admin/profiles/${p._id}`) },
    { label: "Assign", icon: UserPlus, onSelect: () => router.push(`/admin/assignments?profile=${p._id}`) },
    ...(isAdmin
      ? [
          p.active
            ? { label: "Deactivate", icon: PowerOff, disabled: busy === p._id, onSelect: () => toggleActive(p) }
            : { label: "Activate", icon: Power, disabled: busy === p._id, onSelect: () => toggleActive(p) },
          "divider" as const,
          { label: "Delete", icon: Trash2, danger: true, disabled: busy === p._id, onSelect: () => remove(p) },
        ]
      : []),
  ];
  const rowActions = (p: Row) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {busy === p._id && <Spinner className="h-3.5 w-3.5 text-slate-400" />}
      <Link href={`/admin/profiles/${p._id}`} className="btn btn-ghost btn-sm btn-icon" aria-label={`Edit ${p.label}`} title="Edit">
        <Pencil />
      </Link>
      <ActionMenu items={menuItems(p)} label={`More actions for ${p.label}`} />
    </div>
  );
  const quota = (p: Row) => (
    <span className={p.monthlyQuota && p.usage.month >= p.monthlyQuota ? "text-rose-600" : "text-slate-900"}>
      {p.usage.month} <span className="text-slate-400">/ {p.monthlyQuota || "∞"}</span>
    </span>
  );

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Profiles"
        subtitle={isAdmin ? "Add, view, edit, activate/deactivate and delete candidate profiles." : "The profiles you manage."}
        actions={
          isAdmin && (
            <Link href="/admin/profiles/new" className="btn btn-primary">
              <Plus />
              New profile
            </Link>
          )
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Filter by status"
          value={status}
          onChange={setStatus}
          options={(["all", "active", "inactive"] as const).map((s) => ({ value: s, label: <span className="capitalize">{s}</span>, count: counts[s] }))}
        />
        <div className="relative min-w-0 flex-1 basis-full sm:max-w-md sm:min-w-60 sm:basis-auto">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="Search label, name, email, title, company" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && (
        <div className="mb-4">
          <Alert>{error}</Alert>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {loading ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !rows.length ? (
          <EmptyState
            icon={data?.length ? Search : Users}
            title={data?.length ? "No profiles match these filters." : "No profiles yet. Create one to get started."}
          />
        ) : (
          <>
          <ul className="divide-y divide-slate-200 md:hidden">
            {pageRows.map((p) => (
              <li key={p._id} className={`space-y-3 px-4 py-4 ${p.active ? "" : "bg-slate-50/60"}`}>
                <div className="flex items-start gap-3">
                  <Avatar name={p.fullName || p.label} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/admin/profiles/${p._id}/view`} className="font-medium text-slate-900 hover:text-indigo-600">
                        {p.label}
                      </Link>
                      {!p.active && <Badge value="inactive" />}
                    </div>
                    <div className="mt-0.5 text-xs break-words text-slate-500">
                      {p.fullName}
                      {p.email && ` · ${p.email}`}
                    </div>
                  </div>
                  {rowActions(p)}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-slate-500">Current role</dt>
                    <dd className="text-slate-900">
                      {p.experience[0] ? (
                        <>
                          {p.experience[0].title}
                          <span className="text-slate-500"> · {p.experience[0].company}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                  {isAdmin && (
                    <div className="col-span-2 min-w-0">
                      <dt className="text-xs text-slate-500">OpenAI key</dt>
                      <dd className="text-xs">
                        {p.apiKey ? (
                          <span className={p.apiKey.active ? "text-slate-900" : "text-rose-600"}>
                            {p.apiKey.label}
                            {!p.apiKey.active && " (disabled)"} <span className="font-mono text-slate-500">{p.apiKey.keyMask}</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Default key</span>
                        )}
                        {(p.openaiModel || p.apiKey?.model) && <span className="text-slate-500"> · {p.openaiModel || p.apiKey?.model}</span>}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-slate-500">Quota (month)</dt>
                    <dd className="tabular-nums">{quota(p)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">All time</dt>
                    <dd className="text-slate-900 tabular-nums">{p.usage.total}</dd>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <dt className="text-xs text-slate-500">Assigned to</dt>
                    <dd className="text-xs text-slate-900">
                      {p.assignedTo.map((a) => a.name).join(", ") || <span className="text-slate-400">Nobody</span>}
                      {!!p.managers?.length && <div className="mt-1 text-slate-500">User: <span className="text-slate-700">{p.managers.map((r) => r.name).join(", ")}</span></div>}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="table">
              <thead>
                <tr>
                  <th>Profile</th>
                  <th>Status</th>
                  <th>Current role</th>
                  {isAdmin && <th>OpenAI key</th>}
                  <th className="num">This month</th>
                  <th className="num">All time</th>
                  <th>Assigned to</th>
                  <th className="actions">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((p) => (
                  <tr key={p._id} className={`cursor-pointer ${p.active ? "" : "bg-slate-50/60"}`} onClick={() => router.push(`/admin/profiles/${p._id}/view`)}>
                    <td className="min-w-56">
                      <span className="flex items-center gap-3">
                        <Avatar name={p.fullName || p.label} size={34} />
                        <span className="min-w-0">
                          <Link
                            href={`/admin/profiles/${p._id}/view`}
                            className="block truncate font-medium text-slate-900 hover:text-indigo-600"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {p.label}
                          </Link>
                          <span className="block truncate text-xs text-slate-500">
                            {p.fullName}
                            {p.email && ` · ${p.email}`}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <Badge value={p.active ? "active" : "inactive"} />
                    </td>
                    <td className="max-w-56">
                      {p.experience[0] ? (
                        <>
                          <div className="truncate text-slate-900">{p.experience[0].title}</div>
                          <div className="truncate text-xs text-slate-500">{p.experience[0].company}</div>
                        </>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td className="text-xs">
                        {p.apiKey ? (
                          <div className={p.apiKey.active ? "text-slate-900" : "text-rose-600"}>
                            {p.apiKey.label}
                            {!p.apiKey.active && " (disabled)"} <span className="font-mono text-slate-400">{p.apiKey.keyMask}</span>
                          </div>
                        ) : (
                          <div className="text-slate-500">Default key</div>
                        )}
                        {(p.openaiModel || p.apiKey?.model) && <div className="text-slate-400">{p.openaiModel || p.apiKey?.model}</div>}
                      </td>
                    )}
                    <td className="num">{quota(p)}</td>
                    <td className="num text-slate-900">{p.usage.total}</td>
                    <td className="max-w-48 min-w-40 text-xs">
                      <div className="truncate text-slate-900" title={p.assignedTo.map((a) => a.name).join(", ")}>
                        {p.assignedTo.map((a) => a.name).join(", ") || <span className="text-slate-400">Nobody</span>}
                      </div>
                      {!!p.managers?.length && (
                        <div className="truncate text-slate-500" title={p.managers.map((r) => r.name).join(", ")}>
                          User: <span className="text-slate-700">{p.managers.map((r) => r.name).join(", ")}</span>
                        </div>
                      )}
                    </td>
                    <td className="actions">{rowActions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
      {!!rows.length && pager}
    </div>
  );
}
