"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Bell, CalendarDays, CircleCheck, FileText, Globe, Inbox, KeyRound, Megaphone, Pencil, Receipt, Upload, UserRound, Users, Wallet } from "lucide-react";
import { Alert, api, Badge, fmtDate, Modal, money, PageHeader, Spinner, PageSkeleton, Stat, useAsync, type IconType } from "@/components/ui";
import { Avatar, AVATAR_PRESETS } from "@/components/Avatar";
import { DEFAULT_TZ, timeZoneChoices, zoneName } from "@/lib/viewerTz";
import SearchSelect from "@/components/SearchSelect";
import { useToast } from "@/components/Alerts";

type Me = {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    feePerApplication: number | null;
    createdAt: string;
    mustChangePassword: boolean;
    avatar: string;
    callerSettings: { reminderMinutes: number; digestHour: number } | null;
    timezone?: string;
  };
  notice: string;
  interviews: { pending: number; open: number; upcoming: number; reportDue: number; done: number } | null;
  stats: { generated: number; submitted: number; fees: number; monthGenerated: number; monthFees: number };
};

export default function MyPage() {
  const { data, error, reload } = useAsync(() => api<Me>("/api/me"), []);
  const [name, setName] = useState("");
  const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (data) setName(data.user.name);
  }, [data]);

  async function save(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setFormError("");
    try {
      await api("/api/me", { method: "PATCH", json: body });
      toast.success(ok);
      setPw({ currentPassword: "", newPassword: "", confirm: "" });
      reload();
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Alert>{error}</Alert>;
  if (!data) return <PageSkeleton stats variant="form" />;

  const { user, stats, notice } = data;
  const isBidder = user.role === "bidder";
  const isCaller = user.role === "caller";
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="My Page" subtitle={`Member since ${fmtDate(user.createdAt)}`} />

      {/* Profile summary */}
      <div className="card mb-6 flex flex-wrap items-center gap-4">
        <AvatarPicker name={user.name} value={user.avatar} onSaved={reload} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-base font-semibold tracking-tight text-slate-900">{user.name}</div>
            <Badge value={user.role} />
          </div>
          <div className="mt-0.5 truncate text-sm text-slate-500">{user.email}</div>
        </div>
      </div>

      {user.mustChangePassword && (
        <div className="mb-6">
          <Alert kind="info">You are using a temporary password from your administrator. Please set a new password below.</Alert>
        </div>
      )}

      {notice && (
        <div className="card mb-6 flex items-start gap-3">
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-600">
            <Megaphone className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-slate-900">Announcement</div>
            <div className="mt-1 text-sm whitespace-pre-wrap text-slate-600">{notice}</div>
          </div>
        </div>
      )}

      {isCaller && data.interviews && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Link href="/caller/requests" className="block rounded-xl transition-opacity hover:opacity-85">
            <Stat label="Waiting for you" value={data.interviews.pending} hint="requests to schedule" icon={Inbox} />
          </Link>
          <Link href="/caller/requests" className="block rounded-xl transition-opacity hover:opacity-85">
            <Stat label="Shared requests" value={data.interviews.open} hint="first to accept gets it" icon={Users} />
          </Link>
          <Link href="/caller/schedule" className="block rounded-xl transition-opacity hover:opacity-85">
            <Stat label="Upcoming interviews" value={data.interviews.upcoming} icon={CalendarDays} />
          </Link>
          <Link href="/caller/requests" className="block rounded-xl transition-opacity hover:opacity-85">
            <Stat
              label="Conducted"
              value={data.interviews.done}
              icon={CircleCheck}
              hint={data.interviews.reportDue ? `${data.interviews.reportDue} result report${data.interviews.reportDue === 1 ? "" : "s"} due` : "results reported"}
            />
          </Link>
        </div>
      )}

      {!isCaller && (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <Stat label="This month" value={stats.monthGenerated} hint={isBidder ? `${money(stats.monthFees)} in fees` : "applications"} icon={CalendarDays} />
          <Stat label="All time" value={stats.generated} hint={`${stats.submitted} submitted`} icon={FileText} />
          {isBidder && <Stat label="Total fees" value={money(stats.fees)} icon={Wallet} />}
          {isBidder && <Stat label="Fee / submitted application" value={money(user.feePerApplication ?? 0)} hint="charged when you submit" icon={Receipt} />}
        </div>
      )}

      {formError && (
        <div className="mb-4">
          <Alert>{formError}</Alert>
        </div>
      )}

      <div className="space-y-6">
        <form
          className="card p-0"
          onSubmit={(e) => {
            e.preventDefault();
            save({ name }, "Profile updated");
          }}
        >
          <SettingsHeader title="Account" description="Your display name and sign-in email." icon={UserRound} />
          <div className="card-body grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="me-name">
                Name
              </label>
              <input id="me-name" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="me-email">
                Email
              </label>
              <input id="me-email" className="input" value={user.email} disabled />
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" disabled={busy || name === user.name}>
              Save
            </button>
          </div>
        </form>

        {!isBidder && <TimezoneCard role={user.role} value={user.timezone || ""} onSaved={reload} />}

        {isCaller && user.callerSettings && (
          <CallerSettingsForm
            initial={user.callerSettings}
            timezone={user.timezone}
            busy={busy}
            onSave={(callerSettings) => save({ callerSettings }, "Reminder settings saved")}
          />
        )}

        <form
          className="card p-0"
          onSubmit={(e) => {
            e.preventDefault();
            if (pw.newPassword !== pw.confirm) return setFormError("New passwords do not match");
            save({ currentPassword: pw.currentPassword, newPassword: pw.newPassword }, "Password changed");
          }}
        >
          <SettingsHeader title="Change password" description="Use at least 8 characters." icon={KeyRound} />
          <div className="card-body grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2 sm:max-w-[calc(50%-0.5rem)]">
              <label className="label" htmlFor="me-pw-current">
                Current password
              </label>
              <input id="me-pw-current" className="input" type="password" required value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="me-pw-new">
                New password
              </label>
              <input id="me-pw-new" className="input" type="password" required minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="me-pw-confirm">
                Confirm new password
              </label>
              <input id="me-pw-confirm" className="input" type="password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
            </div>
          </div>
          <div className="card-footer">
            <button className="btn btn-primary" disabled={busy}>
              Change password
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Header row of a settings card: title, description and an optional muted icon. */
function SettingsHeader({ title, description, icon: Icon }: { title: string; description: ReactNode; icon?: IconType }) {
  return (
    <div className="card-header">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && (
          <div className="grid size-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
            <Icon className="size-4" />
          </div>
        )}
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          <p className="card-description">{description}</p>
        </div>
      </div>
    </div>
  );
}

/** Caller: reminder lead time before each interview, and when tomorrow's schedule is emailed. */
function CallerSettingsForm({
  initial,
  busy,
  onSave,
  timezone,
}: {
  initial: { reminderMinutes: number; digestHour: number };
  busy: boolean;
  onSave: (v: { reminderMinutes: number; digestHour: number }) => void;
  timezone?: string;
}) {
  const [f, setF] = useState(initial);
  const hour = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  return (
    <form
      className="card p-0"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(f);
      }}
    >
      <SettingsHeader
        title="Interview reminders"
        icon={Bell}
        description={<>You get tomorrow&apos;s interview schedule by email the day before, and a reminder before each interview.</>}
      />
      <div className="card-body">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="me-reminder">
              Reminder before each interview
            </label>
            <select id="me-reminder" className="input" value={f.reminderMinutes} onChange={(e) => setF({ ...f, reminderMinutes: Number(e.target.value) })}>
              {[0, 15, 30, 45, 60, 90, 120, 180, 240].map((m) => (
                <option key={m} value={m}>
                  {m === 0 ? "No reminder" : m < 60 ? `${m} minutes before` : `${m / 60} hour${m === 60 ? "" : "s"} before`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="me-digest">
              Send tomorrow&apos;s schedule at
            </label>
            <select id="me-digest" className="input tabular-nums" value={f.digestHour} onChange={(e) => setF({ ...f, digestHour: Number(e.target.value) })}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {hour(h)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="hint mt-3">Times are in your time zone: {zoneName(timezone || DEFAULT_TZ)}.</p>
      </div>
      <div className="card-footer">
        <button className="btn btn-primary" disabled={busy || !dirty}>
          Save reminder settings
        </button>
      </div>
    </form>
  );
}

/** Admins, users and callers: their own time zone (the interview pages open in it; callers' emails use it). */
function TimezoneCard({ role, value, onSaved }: { role: string; value: string; onSaved: () => void }) {
  const router = useRouter();
  const [tz, setTz] = useState(value || DEFAULT_TZ);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const zones = useMemo(() => timeZoneChoices(), []);
  useEffect(() => setTz(value || DEFAULT_TZ), [value]);
  const saved = value || DEFAULT_TZ;
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/me", { method: "PATCH", json: { timezone: tz === DEFAULT_TZ ? "" : tz } });
      toast.success("Time zone saved");
      onSaved();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card p-0">
      <SettingsHeader
        title="Time zone"
        icon={Globe}
        description={
          role === "caller"
            ? "Your interview calendar, schedule emails and reminders use this time zone."
            : "The Interviews (Schedule) page opens in this time zone. Other pages use GMT-04:00."
        }
      />
      <div className="card-body">
        <div className="sm:max-w-[calc(50%-0.5rem)]">
          <label className="label" htmlFor="me-tz">
            Your time zone
          </label>
          <SearchSelect id="me-tz" value={tz} options={zones} onChange={setTz} searchPlaceholder="Find a time zone, e.g. Calgary, GMT-06…" emptyText="No time zone matches" />
        </div>
      </div>
      <div className="card-footer justify-between">
        <div className="min-w-0 text-[13px]">{error && <span className="text-rose-600">{error}</span>}</div>
        <button className="btn btn-primary" disabled={busy || tz === saved} onClick={save}>
          {busy && <Spinner />} Save time zone
        </button>
      </div>
    </div>
  );
}

type Sign = { cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string };

/** Click the avatar to choose a preset or upload a photo. */
function AvatarPicker({ name, value, onSaved }: { name: string; value: string; onSaved: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();

  async function upload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("Choose an image file");
    if (file.size > 5 * 1024 * 1024) return setError("Images must be 5 MB or smaller");
    setBusy(true);
    setError("");
    try {
      const sign = await api<Sign>("/api/cloudinary/sign", { method: "POST" });
      const fd = new FormData();
      fd.append("file", file);
      fd.append("api_key", sign.apiKey);
      fd.append("timestamp", String(sign.timestamp));
      fd.append("folder", sign.folder);
      fd.append("signature", sign.signature);
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || "Upload failed");
      setPick(data.secure_url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError("");
    try {
      await api("/api/me", { method: "PATCH", json: { avatar: pick } });
      setOpen(false);
      toast.success("Avatar updated");
      onSaved();
      router.refresh(); // update the sidebar avatar
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPick(value);
          setOpen(true);
        }}
        className="group relative shrink-0 cursor-pointer rounded-full"
        title="Change avatar"
        aria-label="Change avatar"
      >
        <Avatar avatar={value} name={name} size={64} />
        <span className="absolute -right-0.5 -bottom-0.5 grid size-6 place-items-center rounded-full border border-line-strong bg-surface text-slate-500 shadow-xs transition-colors group-hover:text-slate-900">
          <Pencil className="size-3" aria-hidden />
        </span>
      </button>
      {open && (
        <Modal open onClose={() => setOpen(false)} title="Choose your avatar">
          <div className="space-y-5">
            {error && <Alert>{error}</Alert>}
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <Avatar avatar={pick} name={name} size={64} />
              <div className="flex flex-wrap gap-2">
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  {busy ? <Spinner className="h-3 w-3" /> : <Upload />} Upload photo
                  <input type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files?.[0])} />
                </label>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPick("")}>
                  Use initials
                </button>
              </div>
            </div>
            <div>
              <div className="mb-2 text-[13px] font-medium text-slate-500">Presets</div>
              <div className="grid grid-cols-4 gap-2 min-[400px]:grid-cols-6">
                {AVATAR_PRESETS.map((p) => {
                  const v = `preset:${p.id}`;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPick(v)}
                      aria-label={p.id}
                      aria-pressed={pick === v}
                      className={`flex cursor-pointer justify-center rounded-full p-0.5 transition ${pick === v ? "ring-2 ring-indigo-500 ring-offset-2 ring-offset-surface" : "hover:ring-2 hover:ring-slate-200"}`}
                    >
                      <Avatar avatar={v} name={name} size={48} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="-mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-page px-5 py-3">
              <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={busy || pick === value} onClick={save}>
                Save avatar
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
