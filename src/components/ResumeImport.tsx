"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileText, FileUp, X } from "lucide-react";
import { Alert, api, Spinner } from "./ui";

export type ExtractedProfile = Record<string, unknown> & {
  skills?: string[];
  certifications?: string[];
  experience?: Record<string, unknown>[];
  education?: Record<string, unknown>[];
};

export type ResumeReference = { text: string; fileName: string };

/**
 * Drop / choose (PDF, DOCX, TXT) or paste a resume. AI extracts profile fields for review, and the resume text is
 * handed back so the profile can keep it as the reference for every generation.
 */
export default function ResumeImport({
  onExtracted,
  referenceName,
  onRemoveReference,
}: {
  onExtracted: (p: ExtractedProfile, ref: ResumeReference) => void;
  /** Name of the reference resume currently stored on the profile, if any. */
  referenceName?: string;
  onRemoveReference?: () => void;
}) {
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function extract(file: File | null) {
    setBusy(true);
    setError("");
    setDone("");
    try {
      let r: { profile: ExtractedProfile; text: string; fileName: string };
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch("/api/admin/profiles/extract", { method: "POST", body: fd });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Import failed (${res.status})`);
        r = data;
      } else {
        r = await api("/api/admin/profiles/extract", { method: "POST", json: { text } });
      }
      onExtracted(r.profile, { text: r.text, fileName: r.fileName || "Pasted resume" });
      const p = r.profile;
      setDone(
        `Filled in ${[p.firstName, p.lastName].filter(Boolean).join(" ") || "the profile"}: ${p.experience?.length ?? 0} experience, ${p.education?.length ?? 0} education, ${p.skills?.length ?? 0} skills. Review the fields, then save.`
      );
      setText("");
      setPasting(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`flex flex-wrap items-center gap-4 rounded-xl border border-dashed p-5 transition-colors ${
          dragging ? "border-indigo-500 bg-indigo-50" : "border-line-strong hover:border-indigo-400 hover:bg-slate-50"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files[0];
          if (f && !busy) extract(f);
        }}
      >
        <div
          className={`grid size-10 shrink-0 place-items-center rounded-lg border bg-surface ${dragging ? "border-indigo-200 text-indigo-600" : "border-slate-200 text-slate-500"}`}
        >
          {busy ? <Spinner /> : <FileUp className="size-5" aria-hidden />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">{busy ? "Reading the resume…" : "Import an existing resume"}</div>
          <div className="mt-0.5 text-[13px] text-slate-500">
            Drop a PDF, Word (.docx) or text file here. It fills in the form, and its facts, section order and emphasis are used as a reference for every
            new resume and cover letter.{" "}
            <button type="button" className="link inline-flex cursor-pointer items-center gap-1" onClick={() => setPasting(!pasting)}>
              {!pasting && <ClipboardPaste className="size-3.5" />}
              {pasting ? "Hide paste box" : "Or paste the text"}
            </button>
          </div>
        </div>
        <input ref={input} type="file" accept=".pdf,.docx,.txt" hidden onChange={(e) => e.target.files?.[0] && extract(e.target.files[0])} />
        <button type="button" className="btn btn-secondary w-full sm:w-auto" disabled={busy} onClick={() => input.current?.click()}>
          <FileUp />
          Choose file…
        </button>
      </div>

      {pasting && (
        <div className="animate-fade-in space-y-2">
          <textarea className="input min-h-32" value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the full resume text" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-slate-500 tabular-nums">{text.trim().length} characters (min 100)</span>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy || text.trim().length < 100} onClick={() => extract(null)}>
              {busy && <Spinner />} Import pasted text
            </button>
          </div>
        </div>
      )}

      {referenceName && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-500">
          <FileText className="size-4 shrink-0 text-slate-400" />
          <span className="min-w-0 flex-1">
            Reference resume: <span className="font-medium text-slate-900">{referenceName}</span>
          </span>
          {onRemoveReference && (
            <button type="button" className="btn btn-ghost btn-sm text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={onRemoveReference}>
              <X />
              Remove
            </button>
          )}
        </div>
      )}
      {done && <Alert kind="success">{done}</Alert>}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}
