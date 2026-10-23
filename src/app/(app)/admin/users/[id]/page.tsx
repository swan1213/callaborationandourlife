"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useRole } from "@/components/AppShell";
import { PresenceLabel } from "@/components/Presence";
import { ActionMenu } from "@/components/ActionMenu";
import { useConfirm, useToast } from "@/components/Alerts";
import { DEFAULT_TZ, zoneName } from "@/lib/viewerTz";
import { AccountModal, CredentialsPanel, ROLE_LABEL, StatusBadge, type AccountRow, type ProfileOpt, type Role } from "@/components/Accounts";
import { ArrowRight, Briefcase, CalendarDays, Check, Coins, FileText, History, Inbox, Pencil, Percent, Power, PowerOff, Send, Trash } from "lucide-react";
import { Alert, api, Badge, EmptyState, fmtDate, fmtDateTime, Modal, money, PageHeader, PageSkeleton, Section, Spinner, Stat, useAsync, useClientPaging } from "@/components/ui";

type Detail = {
  user: Omit<AccountRow, "usage">;
  usage: AccountRow["usage"];
  manualQueue?: { pending: number; limit: number; blocked: boolean } | null;
  byProfile: { _id: string; label: string; generated: number; submitted: number }[];
  recent: {
    _id: string;
    company: string;
    jobTitle: string;
    status: string;
    createdAt: string;
    profile?: { label: string } | null;
    profileLabel?: string;
    screenshots: unknown[];
  }[];
};

export default function AccountView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isAdmin = useRole() === "admin";
  const { data, error, reload } = useAsync(() => api<Detail>(`/api/admin/users/${id}`), [id]);
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/admin/profiles").then((r) => r.profiles), []);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const [manual, setManual] = useState<{ name: string; email: string; password: string; role: Role; reason: string } | null>(null);

  async function resendInvite() {
    if (!data) return;
    const u = data.user;
    if (
      !(await confirm({
        title: `Send ${u.name} a new invitation?`,
        message: "A new temporary password replaces the current one, so their old password stops working.",
        confirmLabel: "Send invitation",
      }))
    )
      return;
    setBusy(true);
    try {
      const r = await api<{ invited: boolean; emailConfigured: boolean; password?: string }>(`/api/admin/users/${id}/invite`, { method: "POST" });
      if (r.invited) toast.success("Invitation sent", `New sign-in details emailed to ${u.email}.`);
      else if (r.password)
        setManual({
          name: u.name,
          email: u.email,
          password: r.password,
          role: u.role,
          reason: r.emailConfigured
            ? "The password was reset, but the email could not be delivered. Share these details securely:"
            : "The password was reset, but email is not configured. Share these details securely:",
        });
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(status: string, text: string) {
    setBusy(true);
    try {
      await api(`/api/admin/users/${id}`, { method: "PATCH", json: { status } });
      toast.success(text);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    if (!data) return;
    if (
      !(await confirm({
        title: `Deactivate ${data.user.name}?`,
        message: "They will be signed out and cannot log in until the account is activated again.",
        confirmLabel: "Deactivate",
      }))
    )
      return;
    setStatus("suspended", "Account deactivated.");
  }

  async function remove() {
    if (!data) return;
    const { name } = data.user;
    if (
      !(await confirm({
        title: `Delete ${name}?`,
        message: "The account is removed permanently. Their application history is kept.",
        confirmLabel: "Delete account",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/users/${id}`, { method: "DELETE" });
      toast.success(`${name} deleted`);
      router.replace("/admin/users");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const byProfilePage = useClientPaging(data?.byProfile ?? [], "account-by-profile");
  const recentPage = useClientPaging(data?.recent ?? [], "account-applications");

  if (error)
    return (
      <div className="mx-auto max-w-6xl">
        <Alert>{error}</Alert>
      </div>
    );
  if (!data) return <PageSkeleton stats />;
  const { user: u, usage, byProfile, recent } = data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/users", label: isAdmin ? "Users & Bidders" : "Bidders" }}
        title={
          <span className="inline-flex flex-wrap items-center gap-2.5">
            {u.name}
            <StatusBadge status={u.status} />
          </span>
        }
        subtitle={u.email}
        actions={
          <>
            <Link href={`/admin/applications?user=${id}`} className="btn btn-ghost">
              <History />
              Application history
            </Link>
            {isAdmin && u.status === "pending" && (
              <button className="btn btn-secondary" disabled={busy} onClick={() => setStatus("approved", "Account approved.")}>
                {busy ? <Spinner /> : <Check />}
                Approve
              </button>
            )}
            <button className="btn btn-primary" onClick={() => setEditing(true)}>
              <Pencil />
              Edit
            </button>
            {isAdmin && (
              <ActionMenu
                label={`More actions for ${u.name}`}
                items={[
                  { label: "Resend invite", icon: Send, disabled: busy, onSelect: resendInvite },
                  ...(u.status === "pending"
                    ? []
                    : [
                        u.status === "approved"
                          ? { label: "Deactivate", icon: PowerOff, disabled: busy, onSelect: deactivate }
                          : { label: "Activate", icon: Power, disabled: busy, onSelect: () => setStatus("approved", "Account activated.") },
                      ]),
                  "divider",
                  { label: "Delete", icon: Trash, danger: true, onSelect: remove },
                ]}
              >
                {busy && u.status !== "pending" ? <Spinner /> : undefined}
              </ActionMenu>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="This month" icon={CalendarDays} value={usage.monthGenerated} hint={isAdmin && u.role === "bidder" ? `${money(usage.monthFees)} in fees` : "applications"} />
        <Stat label="All time" icon={FileText} value={usage.generated} hint={`${usage.submitted} submitted`} />
        <Stat
          label="Submission rate"
          icon={Percent}
          value={usage.generated ? `${Math.round((usage.submitted / usage.generated) * 100)}%` : "—"}
          hint={`last bid ${fmtDateTime(usage.lastGeneratedAt)}`}
        />
        {isAdmin && u.role === "bidder" ? (
          <Stat label="Total fees" icon={Coins} value={money(usage.fees)} hint={`${money(u.feePerApplication)} per submitted application`} />
        ) : (
          <Stat label="Profiles" icon={Briefcase} value={u.assignedProfiles.length} />
        )}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Section title="Account" bodyClassName="px-5 py-1.5" className="lg:order-last">
          <dl className="divide-y divide-slate-200 text-sm">
            <Row label="Role">
              <Badge value={u.role === "bidder" ? "user" : u.role === "caller" ? "caller" : "admin"} label={ROLE_LABEL[u.role]} dot={false} />
            </Row>
            <Row label="Status">
              <StatusBadge status={u.status} />
            </Row>
            <Row label="Now">
              <PresenceLabel userId={u._id} />
            </Row>
            <Row label="Joined">{fmtDate(u.createdAt)}</Row>
            <Row label="Last login">{fmtDateTime(u.lastLoginAt)}</Row>
            {isAdmin && u.role === "bidder" && (
              <Row label="Trusted">{u.trusted ? "Yes: can submit without a screenshot" : "No: a screenshot is required to submit"}</Row>
            )}
            {u.role === "caller" && <Row label="Time zone">{zoneName((u as { timezone?: string }).timezone || DEFAULT_TZ)}</Row>}
            {u.role === "bidder" && (
              <Row label="Interviews">{u.interviewAccess === false ? "Hidden: the Interview Requests page is switched off" : "Shown: can use the Interview Requests page"}</Row>
            )}
            {data.manualQueue && (
              <Row label="Manual queue">
                <span className={data.manualQueue.blocked ? "text-rose-600" : ""}>
                  {data.manualQueue.pending} waiting for a pasted description · limit {data.manualQueue.limit || "none"}
                  {data.manualQueue.blocked ? " · generating from URLs is paused" : ""}
                </span>
              </Row>
            )}
            {isAdmin && <Row label="Fee">{u.role === "bidder" ? `${money(u.feePerApplication)} / application` : "Not charged (bidders only)"}</Row>}
            {(u as { mustChangePassword?: boolean }).mustChangePassword && (
              <Row label="Password">
                <span className="text-amber-700">Temporary, not changed yet</span>
              </Row>
            )}
            {(u.role === "user" || u.role === "admin") && (
              <Row label="Manages">
                {u.managedProfiles?.length ? <ChipList items={u.managedProfiles.map((p) => p.label)} /> : <span className="font-normal text-slate-400">No profiles</span>}
              </Row>
            )}
            <Row label="Assigned">
              {u.assignedProfiles.length ? <ChipList items={u.assignedProfiles.map((p) => p.label)} /> : <span className="font-normal text-slate-400">No profiles</span>}
            </Row>
          </dl>
        </Section>

        <div className="space-y-6 lg:col-span-2">
          <Section title="Bids by profile" bodyClassName="">
            {!byProfile.length ? (
              <EmptyState icon={Briefcase} title="No applications yet." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Profile</th>
                        <th className="num">Generated</th>
                        <th className="num">Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {byProfilePage.pageRows.map((b) => (
                        <tr key={b._id}>
                          <td className="font-medium text-slate-900">{b.label || "—"}</td>
                          <td className="num">{b.generated}</td>
                          <td className="num">{b.submitted}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 px-4 pb-3">{byProfilePage.pager}</div>
              </>
            )}
          </Section>

          <Section
            title="Applications"
            actions={
              <Link href={`/admin/applications?user=${id}`} className="btn btn-ghost btn-sm">
                View all
                <ArrowRight />
              </Link>
            }
            bodyClassName=""
          >
            {!recent.length ? (
              <EmptyState icon={Inbox} title="None yet." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Profile</th>
                        <th>Job</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentPage.pageRows.map((a) => (
                        <tr key={a._id} className="cursor-pointer" onClick={() => router.push(`/applications/${a._id}`)}>
                          <td className="text-xs whitespace-nowrap text-slate-500 tabular-nums">{fmtDateTime(a.createdAt)}</td>
                          <td className="min-w-32">{a.profile?.label ?? a.profileLabel ?? "—"}</td>
                          <td className="min-w-[12rem]">
                            <Link href={`/applications/${a._id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                              {a.company || "Unknown company"}
                            </Link>
                            <div className="text-xs text-slate-500">{a.jobTitle || "Untitled role"}</div>
                          </td>
                          <td>
                            <Badge value={a.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-slate-200 px-4 pb-3">{recentPage.pager}</div>
              </>
            )}
          </Section>
        </div>
      </div>

      {manual && (
        <Modal open onClose={() => setManual(null)} title="New sign-in details">
          <CredentialsPanel c={manual} onDone={() => setManual(null)} />
        </Modal>
      )}

      {editing && (
        <AccountModal
          isAdmin={isAdmin}
          account={{ ...u, usage }}
          profiles={profiles.data ?? []}
          onClose={() => setEditing(false)}
          onSaved={(text) => {
            setEditing(false);
            toast.success(text);
            reload();
          }}
        />
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="min-w-0 text-right font-medium text-slate-900">{children}</dd>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {items.map((label, i) => (
        <span key={`${label}-${i}`} className="chip font-normal">
          {label}
        </span>
      ))}
    </span>
  );
}
