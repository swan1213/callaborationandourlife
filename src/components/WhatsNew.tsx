"use client";

import { useEffect, useState } from "react";
import { CircleCheck, ListChecks, Sparkles } from "lucide-react";
import type { ReleaseNote } from "@/lib/releaseNotes";
import { api, Modal, Spinner } from "./ui";

const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

/**
 * "What's new" after a redeploy: the release notes (lib/releaseNotes.ts) this account hasn't seen, for its role, once.
 * "Got it" marks them seen for the account (every device); closing it any other way shows it again on the next load.
 */
export default function WhatsNew() {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ notes: ReleaseNote[] }>("/api/me/whats-new")
      .then((r) => {
        setNotes(r.notes);
        setOpen(r.notes.length > 0);
      })
      .catch(() => {});
  }, []);

  async function done() {
    setBusy(true);
    await api("/api/me/whats-new", { method: "POST" }).catch(() => {});
    setBusy(false);
    setOpen(false);
  }

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="What's new in TailorBid" wide={notes.length > 1}>
      <div className="max-h-[65vh] space-y-6 overflow-y-auto pr-1">
        {notes.map((n) => (
          <article key={n.id} className="space-y-3">
            <div>
              <div className="text-xs text-slate-400">{day(n.date)}</div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Sparkles className="size-4 shrink-0 text-indigo-600" />
                {n.title}
              </h3>
            </div>
            <ul className="space-y-1.5">
              {n.changes.map((c) => (
                <li key={c.text} className="flex items-start gap-2 text-[13px] leading-relaxed text-slate-700">
                  <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
            {!!n.steps?.length && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[13px] font-medium text-indigo-800">
                  <ListChecks className="size-4" /> What to do
                </div>
                <ol className="list-decimal space-y-1 pl-5 text-[13px] leading-relaxed text-indigo-900">
                  {n.steps.map((s) => (
                    <li key={s.text}>{s.text}</li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={done}>
          {busy && <Spinner />} Got it
        </button>
      </div>
    </Modal>
  );
}
