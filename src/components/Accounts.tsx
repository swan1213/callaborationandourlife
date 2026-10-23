"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Eye, EyeOff, RefreshCw } from "lucide-react";
import { Alert, api, Badge, Modal, Spinner } from "./ui";
import SearchSelect from "./SearchSelect";
import { DEFAULT_TZ, timeZoneChoices } from "@/lib/viewerTz";

export type Role = "admin" | "user" | "bidder" | "caller";
export const ROLE_LABEL: Record<Role, string> = { admin: "Admin", user: "User", bidder: "Bidder", caller: "Caller" };

export type AccountRow = {
  _id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
  feePerApplication?: number;
  /** Admin-only: may submit without a screenshot (never shown to the bidder). */
  trusted?: boolean;
  /** Bidders: Interview Requests page shown (admin setting; on unless switched off). */
  interviewAccess?: boolean;
  /** Bidders: postings that may wait for a manual paste before URL generation pauses (0 = no limit). */
  manualLimit?: number;
  /** Callers: their own time zone (their emails and calendar use it). */
  timezone?: string;
  assignedProfiles: { _id: string; label: string }[];
  managedProfiles?: { _id: string; label: string }[];
  createdAt: string;
  lastLoginAt?: string;
  /** "preset:<id>" or a photo URL (components/Avatar.tsx); "" = initials. */
  avatar?: string;
  usage: { generated: number; submitted: number; fees: number; monthGenerated: number; monthFees: number; lastGeneratedAt: string | null };
};
export type ProfileOpt = { _id: string; label: string; fullName: string; active: boolean };

export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = { approved: "active", suspended: "deactivated", pending: "pending", rejected: "rejected" };
  return <Badge value={status} label={label[status] ?? status} />;
}

/** Browser-side temporary password (same alphabet as the server: no look-alike characters). */
function generatePassword(length = 14) {
  const sets = ["ABCDEFGHJKLMNPQRSTUVWXYZ", "abcdefghijkmnpqrstuvwxyz", "23456789", "!@#$%*?"];
  const all = sets.join("");
  const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
  const chars = [...sets.map((set) => set[rand(set.length)]), ...Array.from({ length: length - sets.length }, () => all[rand(all.length)])];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

type Credentials = { name: string; email: string; password: string; role: Role; reason: string };

/** Shown when an invitation could not be emailed, so the admin can share the details manually. */
export function CredentialsPanel({ c, onDone }: { c: Credentials; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const text = [
    "TailorBid sign-in",
    `URL: ${origin}/login`,
    `Email: ${c.email}`,
    `Temporary password: ${c.password}`,
    `Role: ${ROLE_LABEL[c.role]}`,
  ].join("\n");
  return (
    <div className="space-y-4">
      <Alert kind="info">{c.reason}</Alert>
      <dl className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-slate-50 text-sm">
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-slate-500">Email</dt>
          <dd className="min-w-0 text-right font-mono text-[13px] break-all text-slate-900">{c.email}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-slate-500">Password</dt>
          <dd className="min-w-0 break-all rounded-md border border-dashed border-indigo-300 bg-white px-2 py-0.5 font-mono text-[13px] font-medium text-slate-900 select-all">{c.password}</dd>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-2.5">
          <dt className="text-slate-500">Role</dt>
          <dd className="font-medium text-slate-900">{ROLE_LABEL[c.role]}</dd>
        </div>
      </dl>
      <p className="text-xs text-slate-500">This password is shown only once. {c.name} will be asked to change it after signing in.</p>
      <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            setCopied(true);
          }}
        >
          {copied ? <Check className="text-emerald-600" /> : <Copy />}
          {copied ? "Copied" : "Copy details"}
        </button>
        <button type="button" className="btn btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </div>
  );
}

export function AccountModal({
  isAdmin,
  account,
  profiles,
  onClose,
  onSaved,
}: {
  isAdmin: boolean;
  account: AccountRow | null;
  profiles: ProfileOpt[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const creating = !account;
  const [form, setForm] = useState({
    name: account?.name ?? "",
    email: account?.email ?? "",
    status: account?.status ?? "approved",
    role: (account?.role ?? "bidder") as Role,
    feePerApplication: account?.feePerApplication !== undefined ? String(account.feePerApplication) : "",
    assignedProfiles: account?.assignedProfiles.map((p) => p._id) ?? [],
    managedProfiles: (account?.managedProfiles ?? []).map((p) => p._id),
    password: account ? "" : generatePassword(),
    sendInvite: true,
    trusted: !!account?.trusted,
    interviewAccess: account?.interviewAccess !== false,
    manualLimit: String(account?.manualLimit ?? 100),
    timezone: account?.timezone || DEFAULT_TZ,
  });
  const [showPassword, setShowPassword] = useState(!account);
  const zones = useMemo(() => timeZoneChoices(), []);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (id: string, key: "assignedProfiles" | "managedProfiles") =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const checklist = (key: "assignedProfiles" | "managedProfiles") => (
    <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-lg border border-slate-300 p-1">
      {profiles.length ? (
        profiles.map((p) => (
          <label key={p._id} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-slate-100">
            <input type="checkbox" className="size-4 rounded" checked={form[key].includes(p._id)} onChange={() => toggle(p._id, key)} />
            <span className="min-w-0 font-medium text-slate-900">{p.label}</span>
            <span className="min-w-0 text-xs text-slate-400">{p.fullName}</span>
            {!p.active && (
              <span className="ml-auto">
                <Badge value="inactive" />
              </span>
            )}
          </label>
        ))
      ) : (
        <div className="px-2 py-3 text-center text-sm text-slate-400">No profiles yet.</div>
      )}
    </div>
  );

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (!isAdmin) {
        await api(`/api/admin/users/${account!._id}`, { method: "PATCH", json: { assignedProfiles: form.assignedProfiles, interviewAccess: form.interviewAccess, manualLimit: form.manualLimit } });
        onSaved(`${form.name} updated.`);
        return;
      }
      const { password, feePerApplication, sendInvite, trusted, interviewAccess, timezone, manualLimit, ...rest } = form;
      const body: Record<string, unknown> = {
        ...rest,
        trusted: form.role === "bidder" && trusted,
        ...(form.role === "bidder" ? { interviewAccess, manualLimit } : {}),
        ...(form.role === "caller" ? { timezone } : {}),
        ...(form.role === "bidder" && feePerApplication !== "" ? { feePerApplication: Number(feePerApplication) } : {}),
      };
      if (creating) {
        const r = await api<{ invited: boolean; inviteRequested: boolean; emailConfigured: boolean }>("/api/admin/users", {
          method: "POST",
          json: { ...body, password, sendInvite },
        });
        const label = ROLE_LABEL[form.role].toLowerCase();
        if (r.invited) onSaved(`${form.name} added as ${label}. Invitation with sign-in details emailed to ${form.email}.`);
        else
          setCredentials({
            name: form.name,
            email: form.email,
            password,
            role: form.role,
            reason: !r.inviteRequested
              ? `${form.name} was added as ${label}. No invitation was sent. Share these sign-in details securely:`
              : !r.emailConfigured
                ? `${form.name} was added as ${label}, but email is not configured, so no invitation was sent. Share these details securely:`
                : `${form.name} was added as ${label}, but the invitation email could not be delivered. Share these details securely:`,
          });
      } else {
        await api(`/api/admin/users/${account!._id}`, { method: "PATCH", json: { ...body, ...(password ? { newPassword: password } : {}) } });
        onSaved(`${form.name} updated.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={credentials ? () => onSaved(`${credentials.name} added.`) : onClose}
      title={credentials ? "Account created" : creating ? "Add account" : `Edit ${account!.name}`}
    >
      {credentials ? (
        <CredentialsPanel c={credentials} onDone={() => onSaved(`${credentials.name} added.`)} />
      ) : (
      <form className="space-y-5" onSubmit={save}>
        {error && <Alert>{error}</Alert>}
        {isAdmin && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label">Name *</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email *</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                <option value="bidder">Bidder (generates applications)</option>
                <option value="user">User (manages assigned profiles)</option>
                <option value="caller">Caller (schedules and conducts interviews)</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="approved">Active</option>
                <option value="suspended">Deactivated</option>
                <option value="pending">Pending approval</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            {form.role === "bidder" ? (
              <div>
                <label className="label">Fee per submitted application ($)</label>
                <input
                  className="input"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder={creating ? "Default fee" : ""}
                  value={form.feePerApplication}
                  onChange={(e) => setForm({ ...form, feePerApplication: e.target.value })}
                />
              </div>
            ) : (
              <div>
                <label className="label">Fee per application</label>
                <div className="input cursor-not-allowed bg-slate-50 text-slate-400 shadow-none">Only bidders are charged</div>
              </div>
            )}
            <div>
              <label className="label">{creating ? "Temporary password *" : "Reset password (optional)"}</label>
              <div className="flex items-center gap-1">
                <input
                  className="input min-w-0 font-mono"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={8}
                  required={creating}
                  placeholder={creating ? "At least 8 characters" : "Leave blank to keep"}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn-secondary btn-icon shrink-0"
                  aria-label="Generate"
                  title="Generate"
                  onClick={() => {
                    setForm({ ...form, password: generatePassword() });
                    setShowPassword(true);
                  }}
                >
                  <RefreshCw />
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-icon shrink-0"
                  aria-label={showPassword ? "Hide" : "Show"}
                  title={showPassword ? "Hide" : "Show"}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </button>
              </div>
            </div>
            {form.role === "bidder" && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:bg-slate-50 sm:col-span-2">
                <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.trusted} onChange={(e) => setForm({ ...form, trusted: e.target.checked })} />
                <span>
                  <span className="font-medium text-slate-900">Trusted bidder</span>
                  <span className="block text-xs text-slate-500">
                    Can submit applications without uploading a confirmation screenshot. Only admins see this setting; the bidder is never told.
                  </span>
                </span>
              </label>
            )}
            {creating && (
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:bg-slate-50 sm:col-span-2">
                <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.sendInvite} onChange={(e) => setForm({ ...form, sendInvite: e.target.checked })} />
                <span>
                  <span className="font-medium text-slate-900">Send invitation email</span>
                  <span className="block text-xs text-slate-500">
                    Emails the sign-in link, email, temporary password and role. They will be asked to change the password after signing in.
                  </span>
                </span>
              </label>
            )}
          </div>
        )}
        {/* Admins and profile managers (users) can both set this. */}
        {form.role === "bidder" && (
          <div className="rounded-lg border border-slate-200 p-3 text-sm">
            <label className="font-medium text-slate-900" htmlFor="acc-manual">
              Manual job description limit
            </label>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                id="acc-manual"
                className="input w-28"
                type="number"
                min={0}
                value={form.manualLimit}
                onChange={(e) => setForm({ ...form, manualLimit: e.target.value })}
              />
              <span className="text-xs text-slate-500">postings (default 100, 0 = no limit)</span>
            </div>
            <span className="mt-2 block text-xs text-slate-500">
              When this many job postings are waiting for the bidder to paste the description by hand, generating from job URLs pauses until they handle them.
            </span>
          </div>
        )}
        {/* Admins and profile managers (users) can both switch this. */}
        {form.role === "bidder" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm transition-colors hover:bg-slate-50">
            <input type="checkbox" className="mt-0.5 size-4 rounded" checked={form.interviewAccess} onChange={(e) => setForm({ ...form, interviewAccess: e.target.checked })} />
            <span>
              <span className="font-medium text-slate-900">Show the Interview Requests page</span>
              <span className="block text-xs text-slate-500">
                The bidder can ask callers to conduct interviews and follow their requests. Untick to hide the page from this bidder.
              </span>
            </span>
          </label>
        )}
        {isAdmin && form.role === "caller" && (
          <div>
            <label className="label" htmlFor="acc-tz">
              Time zone
            </label>
            <SearchSelect
              id="acc-tz"
              value={form.timezone}
              options={zones}
              onChange={(timezone) => setForm({ ...form, timezone })}
              searchPlaceholder="Find a time zone, e.g. Calgary, GMT-06…"
              emptyText="No time zone matches"
            />
            <div className="hint">
              The caller's emails show times in this zone, and their calendar opens in it when they sign in.
            </div>
          </div>
        )}
        {isAdmin && (form.role === "user" || form.role === "admin") && (
          <div>
            <label className="label">
              {form.role === "admin"
                ? "Managed profiles (optional: this admin also gets these profiles' milestone emails)"
                : "Managed profiles (this user edits them and gets their reports and notifications)"}
            </label>
            {checklist("managedProfiles")}
          </div>
        )}
        <div>
          <label className="label">
            {form.role === "caller"
              ? "Assigned profiles (receives interview requests for these profiles)"
              : isAdmin
                ? "Assigned profiles (can generate applications with)"
                : `Profiles assigned to ${form.name} (only the ones you manage are shown)`}
          </label>
          {checklist("assignedProfiles")}
        </div>
        <div className="-mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />}
            {creating ? (form.sendInvite ? "Add & send invite" : "Add account") : "Save"}
          </button>
        </div>
      </form>
      )}
    </Modal>
  );
}
