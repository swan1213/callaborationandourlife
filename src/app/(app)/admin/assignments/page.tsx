"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/Alerts";
import { Eye, RotateCcw, Save, Search } from "lucide-react";
import { Alert, api, Badge, PageHeader, Segmented, Spinner, PageSkeleton, useAsync, useClientPaging } from "@/components/ui";

type P = { id: string; label: string; fullName: string; active: boolean; title: string };
type A = { id: string; name: string; email: string; role: "admin" | "user" | "bidder" | "caller"; status: string; assigned: string[]; managed: string[] };
type Data = { canManageUsers: boolean; profiles: P[]; accounts: A[] };

export default function Page() {
  return (
    <Suspense>
      <Assignments />
    </Suspense>
  );
}

function Assignments() {
  const sp = useSearchParams();
  const { data, error, loading, reload } = useAsync(() => api<Data>("/api/admin/assignments"), []);
  const [view, setView] = useState<"profile" | "matrix">("profile");
  const [profileId, setProfileId] = useState(sp.get("profile") ?? "");
  const [profileQ, setProfileQ] = useState("");

  useEffect(() => {
    if (data && !data.profiles.some((p) => p.id === profileId)) setProfileId(data.profiles[0]?.id ?? "");
  }, [data, profileId]);

  if (loading && !data) return <PageSkeleton />;
  if (error || !data) return <Alert>{error || "Could not load assignments"}</Alert>;

  const profiles = data.profiles.filter((p) => !profileQ || `${p.label} ${p.fullName}`.toLowerCase().includes(profileQ.toLowerCase()));
  const bidders = data.accounts.filter((a) => a.role === "bidder");
  const callers = data.accounts.filter((a) => a.role === "caller");
  const users = data.accounts.filter((a) => a.role === "user" || a.role === "admin");

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Assignments"
        subtitle={
          data.canManageUsers
            ? "Choose which users and admins manage each profile, which bidders can generate applications with it, and which callers handle its interviews."
            : "Choose which bidders can generate applications with the profiles you manage, and which callers handle their interviews."
        }
        actions={
          <Segmented
            label="View"
            value={view}
            onChange={setView}
            options={[
              { value: "profile", label: "By profile" },
              { value: "matrix", label: "Matrix" },
            ]}
          />
        }
      />

      {!data.profiles.length ? (
        <Alert kind="info">No profiles yet. Create a profile first.</Alert>
      ) : view === "matrix" ? (
        <Matrix data={data} onSaved={reload} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
          <aside className="card min-w-0 self-start p-0 lg:sticky lg:top-20">
            <div className="border-b border-slate-200 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
                <input className="input pl-9" placeholder="Search profiles" value={profileQ} onChange={(e) => setProfileQ(e.target.value)} />
              </div>
            </div>
            <ul className="max-h-64 space-y-0.5 overflow-y-auto p-1.5 lg:max-h-[65vh]">
              {profiles.map((p) => {
                const nb = bidders.filter((b) => b.assigned.includes(p.id)).length;
                const nc = callers.filter((c) => c.assigned.includes(p.id)).length;
                const nu = users.filter((u) => u.managed.includes(p.id)).length;
                return (
                  <li key={p.id}>
                    <button
                      onClick={() => setProfileId(p.id)}
                      aria-current={p.id === profileId ? "true" : undefined}
                      className={`w-full cursor-pointer rounded-md px-3 py-2 text-left transition-colors ${p.id === profileId ? "bg-indigo-50 ring-1 ring-indigo-200 ring-inset" : "hover:bg-slate-100"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`truncate text-sm font-medium ${p.id === profileId ? "text-indigo-700" : "text-slate-900"}`}>{p.label}</span>
                        {!p.active && <Badge value="inactive" />}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 tabular-nums">
                        {nb} bidder{nb === 1 ? "" : "s"} · {nc} caller{nc === 1 ? "" : "s"}
                        {data.canManageUsers && ` · ${nu} manager${nu === 1 ? "" : "s"}`}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>
          {profileId && <ProfileAssignments key={profileId} data={data} profileId={profileId} onSaved={reload} />}
        </div>
      )}
    </div>
  );
}

function PeopleList({
  title,
  hint,
  people,
  selected,
  onToggle,
  onAll,
  empty,
}: {
  title: string;
  hint: string;
  people: A[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onAll: (ids: string[], on: boolean) => void;
  empty: React.ReactNode;
}) {
  const [q, setQ] = useState("");
  const shown = people.filter((p) => !q || `${p.name} ${p.email}`.toLowerCase().includes(q.toLowerCase()));
  const allOn = shown.length > 0 && shown.every((p) => selected.has(p.id));
  return (
    <section className="card flex min-w-0 flex-col p-0">
      <div className="card-header flex-nowrap items-start">
        <div className="min-w-0 flex-1">
          <h2 className="card-title flex flex-wrap items-center gap-2">
            {title} <span className="chip font-normal tabular-nums">{selected.size} selected</span>
          </h2>
          <p className="card-description">{hint}</p>
        </div>
        {people.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onAll(shown.map((p) => p.id), !allOn)}>
            {allOn ? "Clear" : "Select all"}
          </button>
        )}
      </div>
      <div className="card-body">
        {people.length > 6 && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="Search name or email" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        )}
      {!people.length ? (
        <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center text-[13px] text-slate-500">{empty}</div>
      ) : (
        <ul className="max-h-80 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200">
          {shown.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 transition-colors hover:bg-slate-50">
                <input type="checkbox" className="size-4 rounded" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900">{p.name}</span>
                  <span className="block truncate text-xs text-slate-500">{p.email}</span>
                </span>
                {(p.role === "admin" || p.role === "user") && <Badge value="admin" label={p.role === "admin" ? "Admin" : "User"} />}
                {p.status !== "approved" && <Badge value={p.status} label={p.status === "suspended" ? "deactivated" : p.status} />}
              </label>
            </li>
          ))}
        </ul>
      )}
      </div>
    </section>
  );
}

function ProfileAssignments({ data, profileId, onSaved }: { data: Data; profileId: string; onSaved: () => void }) {
  const profile = data.profiles.find((p) => p.id === profileId)!;
  const bidders = data.accounts.filter((a) => a.role === "bidder");
  const callers = data.accounts.filter((a) => a.role === "caller");
  const users = data.accounts.filter((a) => a.role === "user" || a.role === "admin");
  const initialC = useMemo(() => new Set(callers.filter((c) => c.assigned.includes(profileId)).map((c) => c.id)), [data, profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const initialB = useMemo(() => new Set(bidders.filter((b) => b.assigned.includes(profileId)).map((b) => b.id)), [data, profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const initialU = useMemo(() => new Set(users.filter((u) => u.managed.includes(profileId)).map((u) => u.id)), [data, profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selB, setSelB] = useState(initialB);
  const [selU, setSelU] = useState(initialU);
  const [selC, setSelC] = useState(initialC);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
  const dirty = !same(selB, initialB) || !same(selC, initialC) || (data.canManageUsers && !same(selU, initialU));
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void) => (id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    setter(n);
  };
  const all = (set: Set<string>, setter: (s: Set<string>) => void) => (ids: string[], on: boolean) => {
    const n = new Set(set);
    ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
    setter(n);
  };

  async function save() {
    setBusy(true);
    try {
      await api("/api/admin/assignments", {
        method: "PUT",
        json: { profileId, bidders: [...selB], callers: [...selC], ...(data.canManageUsers ? { users: [...selU] } : {}) },
      });
      toast.success("Assignments saved", profile.label);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight text-slate-900">
            {profile.label} {!profile.active && <Badge value="inactive" />}
          </div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            {profile.fullName}
            {profile.title && ` · ${profile.title}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/profiles/${profileId}/view`} className="btn btn-ghost">
            <Eye />
            View profile
          </Link>
          <button className="btn btn-secondary" disabled={!dirty || busy} onClick={() => (setSelB(new Set(initialB)), setSelU(new Set(initialU)), setSelC(new Set(initialC)))}>
            <RotateCcw />
            Reset
          </button>
          <button className="btn btn-primary" disabled={!dirty || busy} onClick={save}>
            {busy ? <Spinner /> : <Save />} Save assignments
          </button>
        </div>
      </div>
      {!profile.active && <Alert kind="info">This profile is inactive. Assigned bidders cannot generate with it until it is activated.</Alert>}

      <div className={`grid gap-4 ${data.canManageUsers ? "xl:grid-cols-2" : ""}`}>
        {data.canManageUsers && (
          <PeopleList
            title="Managed by (users & admins)"
            hint="Users can edit the profile and assign it to bidders. Everyone ticked here receives its milestone emails; users also get its daily report (admins get the full report)."
            people={users}
            selected={selU}
            onToggle={toggle(selU, setSelU)}
            onAll={all(selU, setSelU)}
            empty={
              <>
                No users or admins yet.{" "}
                <Link href="/admin/users" className="link">
                  Add one
                </Link>
              </>
            }
          />
        )}
        <PeopleList
          title="Bidders (can generate with this profile)"
          hint="Assigned bidders see this profile on Generate Resume and View Profile's Information."
          people={bidders}
          selected={selB}
          onToggle={toggle(selB, setSelB)}
          onAll={all(selB, setSelB)}
          empty="No bidders yet."
        />
        <PeopleList
          title="Callers (handle this profile's interviews)"
          hint="Bidders send interview requests for this profile to one of these callers. Callers see the profile on My Profiles."
          people={callers}
          selected={selC}
          onToggle={toggle(selC, setSelC)}
          onAll={all(selC, setSelC)}
          empty={
            data.canManageUsers ? (
              <>
                No callers yet.{" "}
                <Link href="/admin/users" className="link">
                  Add one
                </Link>
              </>
            ) : (
              "No callers yet. Ask an admin to add one."
            )
          }
        />
      </div>
    </div>
  );
}

/** Profiles × accounts grid; each change saves immediately. */
function Matrix({ data, onSaved }: { data: Data; onSaved: () => void }) {
  const rank = { admin: 0, user: 1, caller: 2, bidder: 3 } as const;
  const { pageRows: profileRows, pager } = useClientPaging(data.profiles, "assignments-matrix");
  const cols = data.accounts.filter((a) => data.canManageUsers || a.role === "bidder" || a.role === "caller").sort((x, y) => rank[x.role] - rank[y.role]);
  const [pending, setPending] = useState("");
  const toast = useToast();

  async function flip(p: P, a: A) {
    const key = `${p.id}:${a.id}`;
    setPending(key);
    const members = (role: "bidder" | "caller" | "user") =>
      data.accounts
        .filter((x) =>
          role === "user" ? (x.role === "user" || x.role === "admin") && x.managed.includes(p.id) : x.role === role && x.assigned.includes(p.id)
        )
        .map((x) => x.id);
    const flipIn = (list: string[]) => (list.includes(a.id) ? list.filter((x) => x !== a.id) : [...list, a.id]);
    try {
      await api("/api/admin/assignments", {
        method: "PUT",
        json: {
          profileId: p.id,
          bidders: a.role === "bidder" ? flipIn(members("bidder")) : members("bidder"),
          ...(a.role === "caller" ? { callers: flipIn(members("caller")) } : {}),
          ...(a.role === "user" || a.role === "admin" ? { users: flipIn(members("user")) } : {}),
        },
      });
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPending("");
    }
  }

  if (!cols.length) return <Alert kind="info">No bidders yet.</Alert>;
  return (
    <div className="space-y-3">
      <div className="card overflow-auto p-0">
        <table className="text-[13px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border-r border-b border-slate-200 bg-slate-50 py-2.5 pr-3 pl-5 text-left text-xs font-medium text-slate-500">Profile</th>
              {cols.map((a) => (
                <th key={a.id} className="border-b border-slate-200 bg-slate-50 px-2 py-2.5 text-center align-bottom">
                  <div className="mx-auto w-24 truncate text-xs font-medium text-slate-700" title={`${a.name} (${a.email})`}>
                    {a.name}
                  </div>
                  <div className={`mt-0.5 text-[11px] font-medium capitalize ${a.role === "caller" ? "text-emerald-600" : a.role !== "bidder" ? "text-violet-600" : "text-slate-400"}`}>{a.role}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {profileRows.map((p) => (
              <tr key={p.id} className="group">
                <td className="sticky left-0 z-10 border-r border-b border-slate-200 bg-white py-2 pr-3 pl-5 whitespace-nowrap">
                  <span className="inline-block max-w-[9rem] truncate align-middle font-medium text-slate-900 sm:max-w-none" title={p.label}>{p.label}</span> {!p.active && <Badge value="inactive" />}
                </td>
                {cols.map((a) => {
                  const on = (a.role === "bidder" || a.role === "caller" ? a.assigned : a.managed).includes(p.id);
                  const key = `${p.id}:${a.id}`;
                  return (
                    <td key={a.id} className="border-b border-slate-200 px-2 py-2 text-center transition-colors group-hover:bg-slate-50">
                      {pending === key ? (
                        <Spinner className="mx-auto h-4 w-4 text-indigo-500" />
                      ) : (
                        <input
                          type="checkbox"
                          className={`h-4 w-4 cursor-pointer ${a.role === "caller" ? "accent-emerald-600" : a.role !== "bidder" ? "accent-violet-600" : "accent-indigo-600"}`}
                          checked={on}
                          disabled={!!pending}
                          onChange={() => flip(p, a)}
                          aria-label={`${a.name} ↔ ${p.label}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pager}
      <p className="px-1 text-xs text-slate-500">
        {data.canManageUsers ? "Violet = user or admin manages the profile. " : ""}Indigo = bidder can generate with it. Green = caller handles its interviews. Changes save immediately.
      </p>
    </div>
  );
}
