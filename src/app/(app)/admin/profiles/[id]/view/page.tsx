"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useRole } from "@/components/AppShell";
import { useConfirm, useToast } from "@/components/Alerts";
import ProfileDetails, { type ProfileDetail } from "@/components/ProfileDetails";
import { DesignThumb } from "@/components/DesignPicker";
import { DEFAULT_DESIGN, designInfo } from "@/lib/designs";
import { ActionMenu } from "@/components/ActionMenu";
import { Activity, CalendarDays, FileText, History, KeyRound, Pencil, Power, PowerOff, Sparkles, Trash2, UserPlus } from "lucide-react";
import { Alert, api, ApiError, Badge, PageHeader, Section, Spinner, PageSkeleton, Stat, useAsync } from "@/components/ui";

type Row = {
  _id: string;
  active: boolean;
  monthlyQuota: number;
  apiKey?: { label: string; keyMask: string; model: string; active: boolean } | null;
  openaiModel?: string;
  usage: { total: number; month: number; monthPromptTokens: number; monthCompletionTokens: number };
  assignedTo: { id: string; name: string }[];
  managers: { id: string; name: string }[];
};

export default function ProfileView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isAdmin = useRole() === "admin";
  const detail = useAsync(() => api<{ profile: ProfileDetail & { active: boolean; resumeDesign?: string; coverLetterDesign?: string } }>(`/api/admin/profiles/${id}`).then((r) => r.profile), [id]);
  const meta = useAsync(() => api<{ profiles: Row[] }>("/api/admin/profiles").then((r) => r.profiles.find((p) => p._id === id) ?? null), [id]);
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  async function toggleActive() {
    if (!detail.data) return;
    const { label, active } = detail.data;
    if (
      active &&
      !(await confirm({
        title: `Deactivate ${label}?`,
        message: "Users can no longer generate applications with it until it is activated again.",
        confirmLabel: "Deactivate",
      }))
    )
      return;
    setBusy(true);
    try {
      await api(`/api/admin/profiles/${id}`, { method: "PATCH", json: { active: !active } });
      toast.success(active ? "Profile deactivated" : "Profile activated");
      detail.reload();
      meta.reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!detail.data) return;
    const { label } = detail.data;
    if (
      !(await confirm({
        title: "Delete this profile?",
        message: `"${label}" will be deleted permanently. This cannot be undone.`,
        confirmLabel: "Delete profile",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/profiles/${id}`, { method: "DELETE" });
      toast.success(`${label} deleted`);
      router.replace("/admin/profiles");
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.data.history) {
        const ok = await confirm({
          title: "Delete anyway?",
          message: (
            <>
              <p>{err.message}</p>
              <p className="mt-2">The history is kept under the old name.</p>
            </>
          ),
          confirmLabel: "Delete anyway",
          danger: true,
        });
        if (!ok) return;
        try {
          await api(`/api/admin/profiles/${id}?force=1`, { method: "DELETE" });
          toast.success(`${label} deleted`, "Its history was kept.");
          router.replace("/admin/profiles");
        } catch (e2) {
          toast.error((e2 as Error).message);
        }
      } else if (err.status !== 409) toast.error(err.message);
    }
  }

  if (detail.error) return <Alert>{detail.error}</Alert>;
  if (!detail.data) return <PageSkeleton stats variant="cards" />;
  const p = detail.data;
  const m = meta.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/admin/profiles", label: "Back to profiles" }}
        title={p.label}
        subtitle={p.fullName}
        actions={
          <>
            <Link href={`/admin/applications?profile=${id}`} className="btn btn-ghost">
              <History />
              History
            </Link>
            <Link href={`/admin/assignments?profile=${id}`} className="btn btn-secondary">
              <UserPlus />
              Assign
            </Link>
            <Link href={`/admin/profiles/${id}`} className="btn btn-primary">
              <Pencil />
              Edit
            </Link>
            {isAdmin && (
              <ActionMenu
                label={`More actions for ${p.label}`}
                items={[
                  p.active
                    ? { label: "Deactivate", icon: PowerOff, disabled: busy, onSelect: toggleActive }
                    : { label: "Activate", icon: Power, disabled: busy, onSelect: toggleActive },
                  "divider",
                  { label: "Delete", icon: Trash2, danger: true, onSelect: remove },
                ]}
              >
                {busy ? <Spinner /> : undefined}
              </ActionMenu>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat icon={Activity} label="Status" value={<Badge value={p.active ? "active" : "inactive"} />} hint={p.active ? "Available for generation" : "Hidden from users"} />
        <Stat icon={CalendarDays} label="This month" value={m ? `${m.usage.month}${m.monthlyQuota ? ` / ${m.monthlyQuota}` : ""}` : "—"} hint={m?.monthlyQuota ? "monthly quota" : "no quota"} />
        <Stat icon={FileText} label="All time" value={m?.usage.total ?? "—"} hint="applications generated" />
        {isAdmin ? (
          <Stat
            icon={KeyRound}
            label="OpenAI"
            value={<span className="block truncate text-base">{m?.apiKey?.label ?? "Default key"}</span>}
            hint={m?.openaiModel || m?.apiKey?.model || "key default model"}
          />
        ) : (
          <Stat icon={Sparkles} label="Tokens (month)" value={m ? (m.usage.monthPromptTokens + m.usage.monthCompletionTokens).toLocaleString() : "—"} />
        )}
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Section title="Access" bodyClassName="px-5 py-1">
          <dl className="divide-y divide-slate-200 text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-slate-500">Assigned to</dt>
              <dd className="min-w-0 text-right font-medium break-words">{m?.assignedTo.length ? m.assignedTo.map((a) => a.name).join(", ") : <span className="font-normal text-slate-400">Nobody</span>}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="shrink-0 text-slate-500">Managed by (users)</dt>
              <dd className="min-w-0 text-right font-medium break-words">{m?.managers.length ? m.managers.map((r) => r.name).join(", ") : <span className="font-normal text-slate-400">None</span>}</dd>
            </div>
          </dl>
        </Section>

        <Section
          title="Document design"
          className="lg:col-span-2"
          actions={
            <Link href={`/admin/profiles/${id}#design`} className="btn btn-ghost btn-sm">
              <Pencil />
              Change
            </Link>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {([
              ["resume", "Resume", p.resumeDesign],
              ["letter", "Cover letter", p.coverLetterDesign],
            ] as const).map(([kind, label, value]) => {
              const design = designInfo(value || DEFAULT_DESIGN);
              return (
                <div key={kind} className="rounded-lg border border-slate-200 p-3">
                  <DesignThumb kind={kind} id={design.id} />
                  <div className="mt-3 text-xs text-slate-500">{label}</div>
                  <div className="text-sm font-semibold text-slate-900">{design.name}</div>
                  <div className="mt-0.5 text-[13px] text-slate-500">{kind === "resume" ? design.resumeBlurb : design.letterBlurb}</div>
                </div>
              );
            })}
          </div>
        </Section>
      </div>

      <ProfileDetails p={p} showDescriptions />
    </div>
  );
}
