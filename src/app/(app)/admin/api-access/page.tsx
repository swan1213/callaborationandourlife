"use client";

import { useEffect, useState } from "react";
import { Ban, Check, Copy, KeyRound, Plus, ShieldAlert, Terminal, Trash2 } from "lucide-react";
import { useConfirm, useToast } from "@/components/Alerts";
import { Alert, api, Badge, EmptyState, fmtDateTime, Modal, PageHeader, Section, Spinner, TableSkeleton, useAsync } from "@/components/ui";

const CODE = "rounded border border-slate-200 bg-slate-50 px-1 py-px font-mono text-[12px] text-slate-800";
const PRE = "overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800";

type Key = {
  _id: string;
  name: string;
  prefix: string;
  createdByName: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedByName: string;
  lastUsedAt: string | null;
  lastUsedIp: string;
  useCount: number;
};

const ENDPOINTS: { path: string; what: string; params?: string }[] = [
  { path: "GET /api/v1/interviews", what: "Interviews on the calendar.", params: "from, to (YYYY-MM-DD in GMT-04:00, or ISO), status (default scheduled,completed), profile, caller, limit (≤500), page" },
  { path: "GET /api/v1/interviews/{id}", what: "One interview: time, step, company, role, profile, caller, meeting note, result and feedback." },
  { path: "GET /api/v1/interviews/{id}/profile", what: "Full details of the interview's candidate profile." },
  { path: "GET /api/v1/interviews/{id}/resume", what: "The generated resume used for the interview, with cover letter and job description.", params: "format = json (default) | pdf | docx | jd-docx" },
  { path: "GET /api/v1/interviews/{id}/job-description", what: "The job posting the interview is for.", params: "format = json (default) | docx" },
  { path: "GET /api/v1/profiles", what: "All active profiles (summary).", params: "active=false to include inactive ones" },
  { path: "GET /api/v1/profiles/{id}", what: "Full profile details." },
  { path: "GET /api/v1/applications/{id}", what: "Any generated resume, cover letter and job description.", params: "format = json (default) | pdf | docx | jd-docx" },
];

function status(k: Key) {
  if (k.revokedAt) return <Badge value="rejected" label="Revoked" />;
  if (k.expiresAt && new Date(k.expiresAt).getTime() < Date.now()) return <Badge value="suspended" label="Expired" />;
  return <Badge value="approved" label="Active" />;
}

/** Admin: keys for the read-only external API (scheduled interviews, profiles, generated resumes). */
export default function ApiAccessPage() {
  const list = useAsync(() => api<{ keys: Key[] }>("/api/admin/access-keys").then((r) => r.keys), []);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const [origin, setOrigin] = useState("https://your-site");
  useEffect(() => setOrigin(window.location.origin), []);

  async function revoke(k: Key) {
    if (
      !(await confirm({
        title: "Revoke this key?",
        message: `Anything using "${k.name}" stops working immediately. This can't be undone.`,
        confirmLabel: "Revoke key",
        danger: true,
      }))
    )
      return;
    try {
      await api(`/api/admin/access-keys/${k._id}`, { method: "DELETE" });
      toast.success(`${k.name} revoked`);
      list.reload();
    } catch (e) {
      toast.error("Couldn't revoke the key", (e as Error).message);
    }
  }
  async function purge(k: Key) {
    if (!(await confirm({ title: "Remove this key?", message: `"${k.name}" is already revoked and will no longer be listed.`, confirmLabel: "Remove", danger: true }))) return;
    try {
      await api(`/api/admin/access-keys/${k._id}?purge=1`, { method: "DELETE" });
      toast.success(`${k.name} removed`);
      list.reload();
    } catch (e) {
      toast.error("Couldn't remove the key", (e as Error).message);
    }
  }

  const example = `curl -H "Authorization: Bearer YOUR_KEY" "${origin}/api/v1/interviews?from=2026-10-01&to=2026-10-31"`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="API Access"
        subtitle="Keys for the read-only TailorBid API: scheduled interviews, their profiles, generated resumes and job descriptions. (OpenAI keys are on API Keys.)"
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />
            Create API key
          </button>
        }
      />
      {list.error && (
        <div className="mb-4">
          <Alert>{list.error}</Alert>
        </div>
      )}

      <div className="card mb-6 overflow-hidden p-0">
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={7} />
        ) : !list.data?.length ? (
          <EmptyState
            icon={KeyRound}
            title="No API keys yet."
            description="Click Create API key to make one."
            action={
              <button className="btn btn-secondary" onClick={() => setCreating(true)}>
                <Plus />
                Create API key
              </button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key</th>
                <th>Status</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Last used</th>
                <th className="num">Requests</th>
                <th className="actions">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((k) => (
                <tr key={k._id} className={k.revokedAt ? "text-slate-400" : ""}>
                  <td className={`font-medium ${k.revokedAt ? "" : "text-slate-900"}`}>{k.name}</td>
                  <td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">
                      <KeyRound className="size-3 text-slate-400" />
                      {k.prefix}…
                    </span>
                  </td>
                  <td>
                    {status(k)}
                    {k.revokedAt && <div className="mt-1 text-xs whitespace-nowrap tabular-nums">by {k.revokedByName} · {fmtDateTime(k.revokedAt)}</div>}
                  </td>
                  <td className="text-xs whitespace-nowrap tabular-nums">
                    {fmtDateTime(k.createdAt)}
                    <div className="text-slate-400">by {k.createdByName}</div>
                  </td>
                  <td className="text-xs whitespace-nowrap tabular-nums">{k.expiresAt ? fmtDateTime(k.expiresAt) : "Never"}</td>
                  <td className="text-xs whitespace-nowrap tabular-nums">
                    {k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "Never"}
                    {k.lastUsedIp && <div className="font-mono text-[11px] text-slate-400">{k.lastUsedIp}</div>}
                  </td>
                  <td className="num">{k.useCount}</td>
                  <td className="actions">
                    {k.revokedAt ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => purge(k)}>
                        <Trash2 />
                        Remove
                      </button>
                    ) : (
                      <button className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => revoke(k)}>
                        <Ban />
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <Section
        title="How to use the API"
        description={
          <>
            Send the key in the <code className={CODE}>Authorization</code> header (or <code className={CODE}>X-API-Key</code>). Every endpoint is read-only and returns JSON unless
            you ask for a file with <code className={CODE}>format</code>. Times include ISO (UTC) and the GMT-04:00 local time. Deleted interviews are never returned.
          </>
        }
        bodyClassName=""
      >
        <div className="p-5">
          <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-slate-500">
            <Terminal className="size-3.5" />
            Example request
          </div>
          <pre className={PRE}>{example}</pre>
        </div>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="table">
            <thead>
              <tr>
                <th className="sm:w-80">Endpoint</th>
                <th>Returns</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.path}>
                  <td className="font-mono text-xs whitespace-nowrap text-slate-900">{e.path}</td>
                  <td className="text-slate-700">
                    {e.what}
                    {e.params && (
                      <div className="mt-0.5 text-xs text-slate-500">
                        Options: <span className="font-mono text-[11px]">{e.params}</span>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card-footer justify-start">
          <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-500">
            <ShieldAlert className="mt-px size-3.5 shrink-0 text-slate-400" />
            <span>
              Errors come back as <code className={CODE}>{`{ "error": "…" }`}</code> with status 400 (bad input), 401 (missing, invalid, revoked or expired key) or 404 (not found).
              Keys see every profile and interview, including personal details, so share them only with systems you trust and revoke any key you no longer need.
            </span>
          </p>
        </div>
      </Section>

      {creating && (
        <CreateKey
          onClose={() => setCreating(false)}
          onCreated={(c) => {
            setCreating(false);
            setCreated(c);
            toast.success(`${c.name} created`);
            list.reload();
          }}
        />
      )}
      {created && <ShowKey created={created} example={example} onClose={() => setCreated(null)} />}
    </div>
  );
}

function CreateKey({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { name: string; key: string }) => void }) {
  const [name, setName] = useState("");
  const [days, setDays] = useState("0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ key: string; name: string }>("/api/admin/access-keys", { method: "POST", json: { name, expiresInDays: Number(days) } });
      onCreated({ name: r.name, key: r.key });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title="Create API key">
      <form className="space-y-4" onSubmit={submit}>
        {error && <Alert>{error}</Alert>}
        <div>
          <label className="label" htmlFor="ak-name">
            Name *
          </label>
          <input id="ak-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="What will use it, e.g. Calendar sync" autoFocus />
        </div>
        <div>
          <label className="label" htmlFor="ak-exp">
            Expires
          </label>
          <select id="ak-exp" className="input" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="0">Never</option>
            <option value="30">In 30 days</option>
            <option value="90">In 90 days</option>
            <option value="180">In 180 days</option>
            <option value="365">In 1 year</option>
          </select>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:justify-end">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>
            {busy && <Spinner />} Create key
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ShowKey({ created, example, onClose }: { created: { name: string; key: string }; example: string; onClose: () => void }) {
  const [copied, setCopied] = useState("");
  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      setCopied("");
    }
  };
  return (
    <Modal open onClose={onClose} title={`API key created: ${created.name}`}>
      <div className="space-y-4">
        <Alert kind="info">Copy the key now. For security it is shown only once; if you lose it, revoke it and create a new one.</Alert>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-slate-500">API key</div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <code id="ak-key" className="flex min-w-0 flex-1 items-center overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs break-all text-slate-900">
              {created.key}
            </code>
            <button className="btn btn-primary" onClick={() => copy(created.key, "key")}>
              {copied === "key" ? <Check /> : <Copy />}
              {copied === "key" ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-[13px] font-medium text-slate-500">Try it:</div>
          <pre className={PRE}>{example.replace("YOUR_KEY", created.key)}</pre>
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:flex-wrap sm:justify-end">
          <button className="btn btn-secondary" onClick={() => copy(example.replace("YOUR_KEY", created.key), "curl")}>
            {copied === "curl" ? <Check /> : <Copy />}
            {copied === "curl" ? "Copied" : "Copy example"}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
