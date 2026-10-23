"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { useRole } from "@/components/AppShell";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import { useConfirm, useToast } from "@/components/Alerts";
import { PresenceAvatar, PresenceLabel, usePresence, type PresenceStatus } from "@/components/Presence";
import { AccountModal, ROLE_LABEL, StatusBadge, type AccountRow, type ProfileOpt, type Role } from "@/components/Accounts";
import { ArrowDown, ArrowUp, Check, Eye, Pencil, Plus, Power, PowerOff, Search, Trash, UserRoundSearch, X } from "lucide-react";
import { Alert, api, Badge, EmptyState, fmtDate, fmtDateTime, money, PageHeader, Segmented, Spinner, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}

type SortKey = "name" | "apps" | "active";
const PRESENCE_RANK: Record<PresenceStatus, number> = { online: 0, away: 1, offline: 2 };
/** Profile chips shown in a row before "+N". */
const CHIPS = 2;

function AccountsPage() {
  const isAdmin = useRole() === "admin";
  const sp = useSearchParams();
  const router = useRouter();
  const [roleTab, setRoleTab] = useState<"" | Role>("");
  const [status, setStatus] = useState(sp.get("status") ?? "");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "active", desc: false });
  const accounts = useAsync(() => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (q) p.set("q", q);
    return api<{ users: AccountRow[] }>(`/api/admin/users?${p}`).then((r) => r.users);
  }, [status, q]);
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const { byId } = usePresence();
  const [editing, setEditing] = useState<AccountRow | "new" | null>(null);
  const [busy, setBusy] = useState("");
  const toast = useToast();
  const confirm = useConfirm();

  // Pending sign-ups first (they need an answer), then the chosen order.
  const lastActive = (u: AccountRow) => {
    const p = byId.get(u._id);
    return [PRESENCE_RANK[p?.status ?? "offline"], -new Date(p?.lastSeenAt ?? u.lastLoginAt ?? 0).getTime()] as const;
  };
  const compare = (a: AccountRow, b: AccountRow) => {
    if (sort.key === "name") return a.name.localeCompare(b.name);
    if (sort.key === "apps") return a.usage.monthGenerated - b.usage.monthGenerated || a.usage.generated - b.usage.generated;
    const [ra, ta] = lastActive(a);
    const [rb, tb] = lastActive(b);
    return ra - rb || ta - tb;
  };
  const rows = (accounts.data ?? [])
    .filter((u) => !roleTab || u.role === roleTab)
    .sort((a, b) => Number(b.status === "pending") - Number(a.status === "pending") || (sort.desc ? -1 : 1) * compare(a, b) || a.name.localeCompare(b.name));
  const { pageRows, pager } = useClientPaging(rows, "accounts");
  const count = (r: "" | Role) => (accounts.data ?? []).filter((u) => !r || u.role === r).length;

  async function patch(u: AccountRow, body: Record<string, unknown>, ok: string) {
    setBusy(u._id);
    try {
      await api(`/api/admin/users/${u._id}`, { method: "PATCH", json: body });
      toast.success(ok);
      accounts.reload();
      return true;
    } catch (e) {
      toast.error("Couldn't update the account", (e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function remove(u: AccountRow) {
    const ok = await confirm({
      title: `Delete ${u.name}?`,
      message: "The account is removed and can no longer sign in. Their application history is kept.",
      confirmLabel: "Delete account",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${u._id}`, { method: "DELETE" });
      toast.success(`${u.name} deleted`);
      accounts.reload();
    } catch (e) {
      toast.error("Couldn't delete the account", (e as Error).message);
    }
  }

  /* ---------- cell contents shared by the desktop table and the phone cards ---------- */

  const roleBadge = (u: AccountRow) => <Badge value={u.role === "bidder" ? "user" : u.role === "caller" ? "caller" : "admin"} label={ROLE_LABEL[u.role]} dot={false} />;
  // "Active" is the normal case: only other states and flags get a badge.
  const flags = (u: AccountRow) => (
    <>
      {u.status !== "approved" && <StatusBadge status={u.status} />}
      {isAdmin && u.role === "bidder" && u.trusted && <Badge value="approved" label="Trusted" />}
      {u.role === "bidder" && u.interviewAccess === false && <Badge value="suspended" label="No interviews" />}
    </>
  );
  const chips = (list: { _id: string; label: string }[]) => (
    <span className="flex flex-wrap gap-1" title={list.map((p) => p.label).join(", ")}>
      {list.slice(0, CHIPS).map((p) => (
        <span key={p._id} className="chip max-w-36 truncate">
          {p.label}
        </span>
      ))}
      {list.length > CHIPS && <span className="chip text-slate-500">+{list.length - CHIPS}</span>}
    </span>
  );
  const profileCell = (u: AccountRow) => {
    const managed = (u.role === "user" || u.role === "admin") && u.managedProfiles?.length ? u.managedProfiles : null;
    if (!managed && !u.assignedProfiles.length) return <span className="text-xs text-slate-400">{u.role === "admin" ? "All profiles" : "None"}</span>;
    return (
      <div className="space-y-1">
        {managed && (
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Manages</span>
            {chips(managed)}
          </div>
        )}
        {!!u.assignedProfiles.length && chips(u.assignedProfiles)}
      </div>
    );
  };
  const appsCell = (u: AccountRow) =>
    u.role !== "bidder" && !u.usage.generated ? (
      <span className="text-slate-300">—</span>
    ) : (
      <div className="tabular-nums" title={`All time: ${u.usage.generated} generated, ${u.usage.submitted} submitted, ${money(u.usage.fees)}`}>
        <div className="text-slate-900">
          <span className="font-medium">{u.usage.monthGenerated}</span> <span className="text-xs text-slate-500">this month · {money(u.usage.monthFees)}</span>
        </div>
        <div className="text-xs text-slate-400">
          {u.usage.generated} total · {u.usage.submitted} submitted
        </div>
      </div>
    );
  const activityCell = (u: AccountRow) => (
    <div className="space-y-0.5">
      <PresenceLabel userId={u._id} />
      <div className="text-xs whitespace-nowrap text-slate-400 tabular-nums">Login {u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "never"}</div>
      {u.role === "bidder" && u.usage.lastGeneratedAt && <div className="text-xs whitespace-nowrap text-slate-400 tabular-nums">Last bid {fmtDateTime(u.usage.lastGeneratedAt)}</div>}
    </div>
  );
  const menuItems = (u: AccountRow): ActionItem[] => [
    { label: "View", icon: Eye, onSelect: () => router.push(`/admin/users/${u._id}`) },
    { label: "Edit", icon: Pencil, onSelect: () => setEditing(u) },
    ...(isAdmin && u.status !== "pending"
      ? [
          u.status === "approved"
            ? {
                label: "Deactivate",
                icon: PowerOff,
                disabled: busy === u._id,
                onSelect: async () => {
                  const ok = await confirm({
                    title: `Deactivate ${u.name}?`,
                    message: "They are signed out and can't sign in until you activate the account again.",
                    confirmLabel: "Deactivate",
                    danger: true,
                  });
                  if (ok) patch(u, { status: "suspended" }, `${u.name} deactivated`);
                },
              }
            : { label: "Activate", icon: Power, disabled: busy === u._id, onSelect: () => patch(u, { status: "approved" }, `${u.name} activated`) },
        ]
      : []),
    ...(isAdmin ? ["divider" as const, { label: "Delete", icon: Trash, danger: true, onSelect: () => remove(u) }] : []),
  ];
  const actions = (u: AccountRow) => (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      {isAdmin && u.status === "pending" && (
        <>
          <button className="btn btn-primary btn-sm" disabled={busy === u._id} onClick={() => patch(u, { status: "approved" }, `${u.name} approved`)}>
            {busy === u._id ? <Spinner className="h-3 w-3" /> : <Check />}
            Approve
          </button>
          <button className="btn btn-secondary btn-sm" disabled={busy === u._id} onClick={() => patch(u, { status: "rejected" }, `${u.name} rejected`)}>
            <X />
            Reject
          </button>
        </>
      )}
      <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditing(u)} aria-label={`Edit ${u.name}`} title="Edit">
        <Pencil />
      </button>
      <ActionMenu items={menuItems(u)} label={`More actions for ${u.name}`} />
    </div>
  );
  const dim = (u: AccountRow) => (u.status === "suspended" || u.status === "rejected" ? "opacity-60" : "");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title={isAdmin ? "Users & Bidders" : "Bidders"}
        subtitle={
          isAdmin
            ? "Add, view, edit and activate or deactivate accounts. Approve sign-ups, assign profiles and set fees."
            : "Assign the profiles you manage to bidders and review their activity on those profiles."
        }
        actions={
          isAdmin && (
            <button className="btn btn-primary" onClick={() => setEditing("new")}>
              <Plus />
              Add account
            </button>
          )
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        {isAdmin && (
          <Segmented
            label="Role"
            className="max-w-full self-start overflow-x-auto lg:self-auto"
            options={(["", "bidder", "caller", "user", "admin"] as const).map((r) => ({ value: r, label: r ? `${ROLE_LABEL[r]}s` : "All", count: count(r) }))}
            value={roleTab}
            onChange={setRoleTab}
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center lg:justify-end">
          <div className="relative min-w-0 sm:flex-1 lg:w-72 lg:flex-none">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" aria-label="Search" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {isAdmin && (
            <select className="input w-full sm:w-48" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="pending">Pending approval</option>
              <option value="approved">Active</option>
              <option value="suspended">Deactivated</option>
              <option value="rejected">Rejected</option>
            </select>
          )}
        </div>
      </div>

      {accounts.error && (
        <div className="mb-4">
          <Alert>{accounts.error}</Alert>
        </div>
      )}

      <div className="card overflow-hidden p-0">
        {accounts.loading && !accounts.data ? (
          <TableSkeleton rows={6} cols={6} />
        ) : !rows.length ? (
          <EmptyState icon={UserRoundSearch} title="No accounts match these filters." description="Try a different role, status or search term." />
        ) : (
          <>
            {/* Phones: one card per account, same fields and actions as the table. */}
            <ul className="divide-y divide-slate-200 md:hidden">
              {pageRows.map((u) => (
                <li key={u._id} className={`space-y-3 px-4 py-4 ${dim(u)}`}>
                  <div className="flex items-start gap-3">
                    <PresenceAvatar userId={u._id} avatar={u.avatar} name={u.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Link href={`/admin/users/${u._id}`} className="font-medium text-slate-900 hover:text-indigo-600">
                          {u.name}
                        </Link>
                        {roleBadge(u)}
                        {flags(u)}
                      </div>
                      <div className="truncate text-xs text-slate-500">{u.email}</div>
                    </div>
                    {!(isAdmin && u.status === "pending") && actions(u)}
                  </div>
                  <div className="text-[13px]">{profileCell(u)}</div>
                  <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px]">
                    <div>{appsCell(u)}</div>
                    <div>{activityCell(u)}</div>
                  </div>
                  {isAdmin && u.status === "pending" && actions(u)}
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="table">
                <thead>
                  <tr>
                    <SortHeader label="Account" k="name" sort={sort} onSort={setSort} />
                    <th>Role</th>
                    <th>Profiles</th>
                    <SortHeader label="Applications" k="apps" sort={sort} onSort={setSort} defaultDesc />
                    <SortHeader label="Last active" k="active" sort={sort} onSort={setSort} />
                    <th className="text-right">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((u) => (
                    <tr key={u._id} className={`cursor-pointer ${dim(u)}`} onClick={() => router.push(`/admin/users/${u._id}`)}>
                      <td className="min-w-60">
                        <span className="flex items-center gap-3">
                          <PresenceAvatar userId={u._id} avatar={u.avatar} name={u.name} size={34} />
                          <span className="min-w-0">
                            <Link href={`/admin/users/${u._id}`} className="block truncate font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                              {u.name}
                            </Link>
                            <span className="block truncate text-xs text-slate-500">{u.email}</span>
                            <span className="block text-[11px] text-slate-400">Joined {fmtDate(u.createdAt)}</span>
                          </span>
                        </span>
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-1">
                          {roleBadge(u)}
                          {flags(u)}
                        </div>
                        {isAdmin && u.role === "bidder" && <div className="mt-1 text-xs text-slate-400 tabular-nums">{money(u.feePerApplication)} per app</div>}
                      </td>
                      <td className="max-w-64 min-w-40">{profileCell(u)}</td>
                      <td className="whitespace-nowrap">{appsCell(u)}</td>
                      <td>{activityCell(u)}</td>
                      <td className="actions">{actions(u)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      {!!rows.length && pager}

      {editing && (
        <AccountModal
          isAdmin={isAdmin}
          account={editing === "new" ? null : editing}
          profiles={profiles.data ?? []}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null);
            toast.success(text);
            accounts.reload();
          }}
        />
      )}
    </div>
  );
}

/** A column header that sorts the table; a second click reverses the order. */
function SortHeader({
  label,
  k,
  sort,
  onSort,
  defaultDesc = false,
}: {
  label: ReactNode;
  k: SortKey;
  sort: { key: SortKey; desc: boolean };
  onSort: (s: { key: SortKey; desc: boolean }) => void;
  defaultDesc?: boolean;
}) {
  const active = sort.key === k;
  const Icon = sort.desc ? ArrowDown : ArrowUp;
  return (
    <th aria-sort={active ? (sort.desc ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className={`inline-flex cursor-pointer items-center gap-1 hover:text-slate-900 ${active ? "text-slate-900" : ""}`}
        onClick={() => onSort(active ? { key: k, desc: !sort.desc } : { key: k, desc: defaultDesc })}
      >
        {label}
        {active && <Icon className="size-3" />}
      </button>
    </th>
  );
}
