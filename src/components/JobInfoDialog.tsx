"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Alert, api, Modal, Spinner } from "./ui";
import { isUnknownCompany, isUntitledRole } from "@/lib/jobInfo";

/**
 * Fill in an application's missing company / role ("Unknown company" / "Untitled role").
 * Bidders can only fill in the missing one; admins (canChangeAll) may change both.
 */
export default function JobInfoDialog({
  app,
  reason,
  canChangeAll = false,
  onClose,
  onSaved,
}: {
  app: { _id: string; company: string; jobTitle: string; jobUrl?: string };
  /** Shown at the top, e.g. why Submit was refused. */
  reason?: string;
  canChangeAll?: boolean;
  onClose: () => void;
  onSaved: (msg: string) => void;
}) {
  const companyOpen = canChangeAll || isUnknownCompany(app.company);
  const roleOpen = canChangeAll || isUntitledRole(app.jobTitle);
  const [company, setCompany] = useState(isUnknownCompany(app.company) ? "" : app.company);
  const [jobTitle, setJobTitle] = useState(isUntitledRole(app.jobTitle) ? "" : app.jobTitle);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ready = !isUnknownCompany(company) && !isUntitledRole(jobTitle);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`/api/applications/${app._id}`, {
        method: "PATCH",
        json: { ...(companyOpen ? { company } : {}), ...(roleOpen ? { jobTitle } : {}) },
      });
      onSaved(`Saved: ${company} · ${jobTitle}.`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="Add company and role">
      <form className="space-y-4" onSubmit={save}>
        {reason && <Alert>{reason}</Alert>}
        {error && <Alert>{error}</Alert>}
        <div className="space-y-2">
          <p className="text-sm text-slate-600">
            The company or role couldn&apos;t be read from the job posting. Fill in what&apos;s missing{app.jobUrl ? " (check the job posting)" : ""}. Once set, they can&apos;t
            be changed.
          </p>
          {app.jobUrl && (
            <a href={app.jobUrl} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
              Open the job posting
              <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
        <div>
          <label className="label" htmlFor="ji-company">
            Company *
          </label>
          <input
            id="ji-company"
            className="input"
            value={company}
            readOnly={!companyOpen}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Acme Corp"
            autoFocus={companyOpen}
          />
        </div>
        <div>
          <label className="label" htmlFor="ji-role">
            Role *
          </label>
          <input
            id="ji-role"
            className="input"
            value={jobTitle}
            readOnly={!roleOpen}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Senior Backend Engineer"
            autoFocus={!companyOpen && roleOpen}
          />
        </div>
        <div className="-mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-page px-5 py-3">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !ready}>
            {busy && <Spinner />} Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
