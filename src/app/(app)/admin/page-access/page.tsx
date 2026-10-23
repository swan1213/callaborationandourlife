"use client";

import { useEffect, useState } from "react";
import { Lock, RotateCcw, Save } from "lucide-react";
import { Alert, api, PageHeader, PageSkeleton, Section, Spinner } from "@/components/ui";
import { useConfirm, useToast } from "@/components/Alerts";
import { EDITABLE_ROLES, PAGES, type AccessRole, type DisabledPages, type EditableRole, type PageDef } from "@/lib/pageAccess";

const ROLE_LABEL: Record<AccessRole, string> = { admin: "Admin", user: "User", bidder: "Bidder", caller: "Caller" };
const COLUMNS: AccessRole[] = ["admin", ...EDITABLE_ROLES];
const GROUPS: PageDef["group"][] = ["Workspace", "Caller", "Admin"];
/** Pages only admins can have: nothing to switch, listed once below the tables. */
const ADMIN_ONLY = PAGES.filter((p) => p.roles.length === 1 && p.roles[0] === "admin");

const sameTable = (a: DisabledPages, b: DisabledPages) =>
  EDITABLE_ROLES.every((r) => [...(a[r] ?? [])].sort().join() === [...(b[r] ?? [])].sort().join());

export default function Page() {
  const [saved, setSaved] = useState<DisabledPages | null>(null);
  const [table, setTable] = useState<DisabledPages>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    api<{ disabled: DisabledPages }>("/api/admin/page-access")
      .then(({ disabled }) => {
        setSaved(disabled);
        setTable(disabled);
      })
      .catch((e) => setError(e.message));
  }, []);

  const isOn = (role: EditableRole, key: string) => !(table[role] ?? []).includes(key);
  const toggle = (role: EditableRole, key: string) =>
    setTable((t) => {
      const list = t[role] ?? [];
      return { ...t, [role]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] };
    });

  async function save() {
    setBusy(true);
    setError("");
    try {
      const { disabled } = await api<{ disabled: DisabledPages }>("/api/admin/page-access", { method: "PUT", json: { disabled: table } });
      setSaved(disabled);
      setTable(disabled);
      toast.success("Page access saved", "Menus update the next time each person loads TailorBid.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    if (!(await confirm({ title: "Turn every page back on?", confirmLabel: "All on", message: "Each role gets all the pages it can have. Nothing is saved until you click Save." }))) return;
    setTable({});
  }

  if (!saved) return error ? <Alert>{error}</Alert> : <PageSkeleton />;
  const dirty = !sameTable(table, saved);
  const offCount = EDITABLE_ROLES.reduce((n, r) => n + (table[r]?.length ?? 0), 0);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Page Access"
        subtitle="Choose which pages each role can open. A page that is off is hidden from the menu, its address redirects to the role's start page, and its data can't be loaded. Admins always have every page."
        actions={
          <>
            <button type="button" className="btn btn-secondary" onClick={reset} disabled={busy || !offCount}>
              <RotateCcw className="size-4" /> All on
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={busy || !dirty}>
              {busy ? <Spinner /> : <Save className="size-4" />} Save
            </button>
          </>
        }
      />
      {error && <Alert>{error}</Alert>}
      {dirty && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-800 ring-1 ring-amber-200 ring-inset">You have unsaved changes.</p>
      )}

      <div className="space-y-5">
        {GROUPS.map((group) => {
          const rows = PAGES.filter((p) => p.group === group && !ADMIN_ONLY.includes(p));
          if (!rows.length) return null;
          return (
            <Section key={group} title={group === "Admin" ? "Admin pages" : group === "Caller" ? "Interview pages" : "Workspace"} bodyClassName="">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      {COLUMNS.map((r) => (
                        <th key={r} className="w-24 text-center">
                          {ROLE_LABEL[r]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p.key}>
                        <td className="min-w-56">
                          <span className="block font-medium text-slate-900">{p.label}</span>
                          <span className="block font-mono text-xs text-slate-400">{p.href}</span>
                          {p.note && <span className="mt-0.5 block text-xs text-slate-500">{p.note}</span>}
                        </td>
                        {COLUMNS.map((r) => (
                          <td key={r} className="text-center align-middle">
                            {!p.roles.includes(r) ? (
                              <span className="text-slate-300" title={`${ROLE_LABEL[r]}s don't use this page`}>
                                —
                              </span>
                            ) : r === "admin" || p.locked ? (
                              <Switch on locked label={`${p.label} for ${ROLE_LABEL[r]}`} />
                            ) : (
                              <Switch on={isOn(r, p.key)} label={`${p.label} for ${ROLE_LABEL[r]}`} onChange={() => toggle(r, p.key)} />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          );
        })}
      </div>

      <p className="mt-4 text-[13px] text-slate-500">
        <span className="font-medium text-slate-700">Admin only (always on): </span>
        {ADMIN_ONLY.map((p) => p.label).join(", ")}.
      </p>
    </div>
  );
}

function Switch({ on, locked = false, label, onChange }: { on: boolean; locked?: boolean; label: string; onChange?: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={locked}
      title={locked ? "Always on" : on ? "On: click to turn off" : "Off: click to turn on"}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full align-middle transition-colors ${locked ? "cursor-default opacity-60" : "cursor-pointer"} ${on ? "bg-indigo-600" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 grid size-4 place-items-center rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`}>
        {locked && <Lock className="size-2.5 text-slate-400" />}
      </span>
    </button>
  );
}
