"use client";

import Link from "next/link";
import { useRole } from "@/components/AppShell";
import { ArrowRight, Check, Coins, Cpu, FileCheck, Gauge, UserCheck, Users, X } from "lucide-react";
import { Alert, api, EmptyState, money, PageHeader, Section, SkeletonText, Stat, useAsync } from "@/components/ui";

type Stats = {
  pendingUsers: number;
  activeUsers: number;
  activeProfiles: number;
  month: { generated: number; submitted: number; fees: number; promptTokens: number; completionTokens: number };
};
type PendingUser = { _id: string; name: string; email: string; createdAt: string };
type ProfileRow = { _id: string; label: string; active: boolean; monthlyQuota: number; usage: { month: number } };

export default function AdminOverview() {
  const isAdmin = useRole() === "admin";
  const stats = useAsync(() => api<Stats>("/api/admin/stats"), []);
  const pending = useAsync(
    () => (isAdmin ? api<{ users: PendingUser[] }>("/api/admin/users?status=pending").then((r) => r.users) : Promise.resolve([] as PendingUser[])),
    [isAdmin]
  );
  const profiles = useAsync(() => api<{ profiles: ProfileRow[] }>("/api/admin/profiles").then((r) => r.profiles.filter((p) => p.active)), []);

  async function decide(id: string, status: "approved" | "rejected") {
    await api(`/api/admin/users/${id}`, { method: "PATCH", json: { status } });
    pending.reload();
    stats.reload();
  }

  const s = stats.data;
  const pendingCount = pending.data?.length ?? 0;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={isAdmin ? "Admin overview" : "User overview"} subtitle={isAdmin ? "This month at a glance" : "This month at a glance, for the profiles you manage"} />
      {stats.error && (
        <div className="mb-6">
          <Alert>{stats.error}</Alert>
        </div>
      )}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Generated this month" icon={FileCheck} value={s?.month.generated ?? "—"} hint={s && `${s.month.submitted} submitted`} />
        <Stat label="Fees this month" icon={Coins} value={s ? money(s.month.fees) : "—"} />
        <Stat
          label="OpenAI tokens (month)"
          icon={Cpu}
          value={s ? (s.month.promptTokens + s.month.completionTokens).toLocaleString() : "—"}
          hint={s && `${s.month.promptTokens.toLocaleString()} in · ${s.month.completionTokens.toLocaleString()} out`}
        />
        <Stat label="Active bidders" icon={Users} value={s?.activeUsers ?? "—"} hint={s && `${s.activeProfiles} active profiles`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {isAdmin && (
          <Section
            title={
              <span className="inline-flex items-center gap-2">
                Pending sign-ups
                {!!pendingCount && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-amber-50 px-1.5 text-xs font-medium text-amber-700 tabular-nums ring-1 ring-amber-600/20 ring-inset">{pendingCount}</span>}
              </span>
            }
            description="New accounts waiting for approval"
            actions={
              <Link href="/admin/users" className="btn btn-ghost btn-sm">
                All users
                <ArrowRight />
              </Link>
            }
            bodyClassName=""
          >
            {pending.loading ? (
              <div className="px-5 py-4">
                <SkeletonText lines={3} />
              </div>
            ) : !pendingCount ? (
              <EmptyState icon={UserCheck} title="No pending requests." description="New sign-ups will appear here for review." />
            ) : (
              <ul className="divide-y divide-slate-200">
                {pending.data!.map((u) => (
                  <li key={u._id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-5 py-3">
                    <div className="flex min-w-0 flex-1 basis-48 items-center gap-3">
                      <div aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-medium text-slate-600 uppercase">
                        {u.name?.trim().charAt(0) || "?"}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{u.name}</div>
                        <div className="truncate text-xs text-slate-500">{u.email}</div>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 gap-1.5">
                      <button className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => decide(u._id, "rejected")}>
                        <X />
                        Reject
                      </button>
                      <button className="btn btn-primary btn-sm" onClick={() => decide(u._id, "approved")}>
                        <Check />
                        Approve
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        )}

        <Section
          title="Profile quota usage"
          description="Applications generated this month against each profile's limit"
          actions={
            <Link href="/admin/profiles" className="btn btn-ghost btn-sm">
              Manage
              <ArrowRight />
            </Link>
          }
          bodyClassName=""
        >
          {profiles.loading ? (
            <div className="px-5 py-4">
              <SkeletonText lines={3} />
            </div>
          ) : !profiles.data?.length ? (
            <EmptyState icon={Gauge} title="No active profiles." />
          ) : (
            <ul className="divide-y divide-slate-200">
              {profiles.data.map((p) => {
                const pct = p.monthlyQuota ? Math.min(100, (p.usage.month / p.monthlyQuota) * 100) : 0;
                return (
                  <li key={p._id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-900">{p.label}</span>
                      <span className="shrink-0 text-[13px] text-slate-500 tabular-nums">
                        <span className="font-medium text-slate-700">{p.usage.month}</span>
                        {p.monthlyQuota ? ` / ${p.monthlyQuota}` : " (no limit)"}
                      </span>
                    </div>
                    {!!p.monthlyQuota && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-1.5 rounded-full transition-[width] ${pct >= 100 ? "bg-rose-500" : pct >= 80 ? "bg-amber-500" : "bg-indigo-600"}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
