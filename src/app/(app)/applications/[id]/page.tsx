"use client";

import { use, useEffect, useState } from "react";
import { Briefcase, CircleCheck, Clock, Download, ExternalLink, FileText, FolderCog, FolderDown, Mail, MessagesSquare, Pencil, RefreshCw, Send, Sparkles, Trash2, TriangleAlert, Undo2 } from "lucide-react";
import ScreenshotUploader from "@/components/ScreenshotUploader";
import Lightbox, { type Slide } from "@/components/Lightbox";
import PostingLink from "@/components/PostingLink";
import { Alert, api, Badge, downloadFile, fmtDateTime, PageHeader, Section, Spinner, PageSkeleton, useAsync } from "@/components/ui";
import type { ResumeContent } from "@/lib/generate";
import ResumePreview from "@/components/ResumePreview";
import MatchScore from "@/components/MatchScore";
import type { AtsReview } from "@/lib/atsReview";
import JobInfoDialog from "@/components/JobInfoDialog";
import InterviewChat from "@/components/InterviewChat";
import { useRole } from "@/components/AppShell";
import { useConfirm, useToast } from "@/components/Alerts";
import { isUnknownCompany, isUntitledRole, missingJobInfo } from "@/lib/jobInfo";
import { canSaveToFolder, chooseFolder, savedFolderName, saveZipToFolder } from "@/lib/saveToFolder";

type Detail = {
  /** Submit works without a screenshot for this application's owner. */
  quickSubmit?: boolean;
  _id: string;
  company: string;
  jobTitle: string;
  jobUrl: string;
  jobUrlRead?: boolean;
  jobLocation: string;
  jobDescription: string;
  coverLetter: string;
  notes: string;
  status: string;
  generationError?: string;
  submittedAt?: string;
  createdAt: string;
  resume: ResumeContent;
  atsReview?: AtsReview | null;
  resumeDesign?: string;
  screenshots: { url: string; publicId: string; uploadedAt: string }[];
  profile?: { label: string; fullName: string };
  user?: { name: string; email: string };
  deletedByUser?: boolean;
};

const TABS = ["Resume", "Cover letter", "Job description", "Chat"] as const;

export default function ApplicationDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = use(params);
  const isNew = use(searchParams).new === "1";
  const { data: app, error, loading, reload } = useAsync(
    () => api<{ application: Detail; quickSubmit?: boolean }>(`/api/applications/${id}`).then((r) => ({ ...r.application, quickSubmit: r.quickSubmit })),
    [id]
  );
  const [tab, setTab] = useState<(typeof TABS)[number]>("Resume");
  const [coverLetter, setCoverLetter] = useState("");
  const [notes, setNotes] = useState("");
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState("");
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);
  const [fixing, setFixing] = useState<{ reason?: string } | null>(null);
  const role = useRole();
  // Save to folder needs the File System Access API (desktop Chrome / Edge); elsewhere only the ZIP is offered.
  const [folderApi, setFolderApi] = useState(false);
  const [folderName, setFolderName] = useState("");
  useEffect(() => {
    if (!canSaveToFolder()) return;
    setFolderApi(true);
    savedFolderName().then(setFolderName);
  }, []);

  useEffect(() => {
    if (app) {
      setCoverLetter(app.coverLetter);
      setNotes(app.notes ?? "");
    }
  }, [app]);

  async function patch(body: Record<string, unknown>, ok: string, key: string) {
    setBusy(key);
    try {
      await api(`/api/applications/${id}`, { method: "PATCH", json: body });
      toast.success(ok);
      reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function download() {
    setBusy("download");
    try {
      await downloadFile(`/api/applications/${id}/download?layout=job`, "application.zip");
    } catch (e) {
      toast.error("Download failed", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function saveToFolder() {
    setBusy("save");
    try {
      const where = await saveZipToFolder(`/api/applications/${id}/download?layout=job`);
      if (where) {
        setFolderName(where.split("/")[0]);
        toast.success("Saved to folder", where);
      }
    } catch (e) {
      toast.error("Couldn't save to the folder", (e as Error).message);
    } finally {
      setBusy("");
    }
  }

  async function changeFolder() {
    try {
      const dir = await chooseFolder();
      if (dir) {
        setFolderName(dir.name);
        toast.success("Folder set", `Applications will be saved in "${dir.name}".`);
      }
    } catch (e) {
      toast.error("Couldn't use that folder", (e as Error).message);
    }
  }

  if (loading && !app) return <PageSkeleton variant="cards" />;
  if (error || !app) return <Alert>{error || "Not found"}</Alert>;
  if (app.status === "not_generated") return <NotGeneratedView app={app} onGenerated={reload} />;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ href: "/applications", label: "Back to applications" }}
        title={`${app.jobTitle || "Untitled role"} · ${app.company || "Unknown company"}`}
        subtitle={[app.jobLocation, `Profile: ${app.profile?.label ?? "—"}`, `Generated ${fmtDateTime(app.createdAt)}`, app.user && `By ${app.user.name}`]
          .filter(Boolean)
          .join("  ·  ")}
        actions={
          <>
            {app.jobUrl && (
              <PostingLink
                url={app.jobUrl}
                read={app.jobUrlRead}
                className="btn btn-secondary"
                unreadClassName="text-slate-700"
                readClassName="text-slate-400"
              >
                <ExternalLink />
                {app.jobUrlRead ? "Job posting (opened)" : "Open job posting"}
              </PostingLink>
            )}
            {app.status !== "not_generated" && (isUnknownCompany(app.company) || isUntitledRole(app.jobTitle)) && (
              <button className="btn btn-secondary" onClick={() => setFixing({})}>
                <Pencil /> Add company & role
              </button>
            )}
            {folderApi ? (
              <>
                <button className="btn btn-secondary" onClick={download} disabled={busy === "download"}>
                  {busy === "download" ? <Spinner /> : <Download />} Download ZIP
                </button>
                <div className="flex">
                  <button
                    className="btn btn-primary rounded-r-none"
                    onClick={saveToFolder}
                    disabled={busy === "save"}
                    title={folderName ? `Save into ${folderName}/[Date]/[Profile]/[Job]` : "Choose a folder, then save into [Date]/[Profile]/[Job]"}
                  >
                    {busy === "save" ? <Spinner /> : <FolderDown />} Save to folder
                  </button>
                  <button
                    className="btn btn-primary btn-icon rounded-l-none border-l border-white/25"
                    onClick={changeFolder}
                    disabled={busy === "save"}
                    aria-label="Change folder"
                    title={folderName ? `Saving into "${folderName}". Click to change.` : "Choose the folder"}
                  >
                    <FolderCog />
                  </button>
                </div>
              </>
            ) : (
              <button className="btn btn-primary" onClick={download} disabled={busy === "download"}>
                {busy === "download" ? <Spinner /> : <Download />} Download ZIP
              </button>
            )}
          </>
        }
      />
      {fixing && (
        <JobInfoDialog
          app={app}
          reason={fixing.reason}
          canChangeAll={role === "admin"}
          onClose={() => setFixing(null)}
          onSaved={(m) => {
            setFixing(null);
            toast.success(m, "You can submit it now.");
            reload();
          }}
        />
      )}

      {isNew && app.status !== "submitted" && (
        <div className="mb-6 flex animate-fade-in gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-emerald-800">Your tailored application is ready</div>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-400">
              <li>
                {folderApi ? (
                  <>
                    <button className="link cursor-pointer underline" onClick={saveToFolder}>
                      Save to folder
                    </button>{" "}
                    into [Date]/[Profile]/[Job] (resume PDF + DOCX, cover letter PDF + DOCX, job description DOCX), or{" "}
                    <button className="link cursor-pointer underline" onClick={download}>
                      download the ZIP
                    </button>
                    .
                  </>
                ) : (
                  <>
                    <button className="link cursor-pointer underline" onClick={download}>
                      Download the ZIP
                    </button>{" "}
                    (resume PDF + DOCX, cover letter PDF + DOCX, job description DOCX).
                  </>
                )}
              </li>
              <li>Apply on the job site{app.jobUrl ? " using the posting link above" : ""}.</li>
              <li>
                Take a screenshot of the confirmation page and press <span className="kbd">Ctrl</span>+<span className="kbd">V</span> anywhere here, or drag it into the Submission box.
              </li>
              <li>
                Click <b className="font-semibold text-slate-900">Submit application</b>
                {app.quickSubmit ? "" : " (enabled once a screenshot is uploaded)"}.
              </li>
            </ol>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <div className="card overflow-hidden p-0">
            <div className="tabs gap-4 px-4 sm:gap-5 sm:px-5" role="tablist" aria-label="Documents">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
                  {t === "Resume" ? (
                    <FileText className="size-4" />
                  ) : t === "Cover letter" ? (
                    <Mail className="size-4" />
                  ) : t === "Chat" ? (
                    <MessagesSquare className="size-4" />
                  ) : (
                    <Briefcase className="size-4" />
                  )}
                  {t}
                </button>
              ))}
            </div>
            {tab === "Resume" && (
              <div className="card-body overflow-x-auto p-3 sm:p-5">
                <ResumePreview r={app.resume} design={app.resumeDesign} />
              </div>
            )}
            {tab === "Cover letter" && (
              <>
                <div className="card-body p-3 sm:p-5">
                  <textarea className="input min-h-[20rem] sm:min-h-[28rem] font-serif leading-relaxed" value={coverLetter} onChange={(e) => setCoverLetter(e.target.value)} />
                </div>
                <div className="card-footer">
                  <button
                    className="btn btn-primary"
                    disabled={coverLetter === app.coverLetter || busy === "cl"}
                    onClick={() => patch({ coverLetter }, "Cover letter saved — it will be used in the next download.", "cl")}
                  >
                    {busy === "cl" && <Spinner />} Save cover letter
                  </button>
                </div>
              </>
            )}
            {tab === "Job description" && (
              <div className="card-body">
                <pre className="font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{app.jobDescription}</pre>
              </div>
            )}
            {/* Unmounted when another tab is chosen, which clears the chat. */}
            {tab === "Chat" && <InterviewChat appId={app._id} />}
          </div>
        </div>

        <div className="space-y-4">
          <MatchScore
            resume={app.resume}
            coverLetter={coverLetter}
            jobDescription={app.jobDescription ?? ""}
            company={app.company ?? ""}
            jobTitle={app.jobTitle ?? ""}
            atsReview={app.atsReview}
            runReview={() => api<{ review: AtsReview }>(`/api/applications/${app._id}/ats`, { method: "POST" }).then((r) => r.review)}
          />
          <Section title="Submission" actions={<Badge value={app.status} />} bodyClassName="card-body space-y-3">
            {app.submittedAt && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="size-3.5 text-slate-400" />
                Submitted {fmtDateTime(app.submittedAt)}
              </div>
            )}
            <p className="text-[13px] leading-relaxed text-slate-500">
              After applying, paste (Ctrl+V anywhere on this page), drag in, or choose a screenshot of the confirmation page, then click Submit application.
            </p>
            <ScreenshotUploader applicationId={app._id} onUploaded={reload} globalPaste />
            {!!app.screenshots.length && (
              <div className="grid grid-cols-2 gap-2">
                {app.screenshots.map((s, idx) => (
                  <div key={s.publicId} className="group relative">
                    <button
                      type="button"
                      className="block w-full cursor-zoom-in rounded-lg"
                      title="View screenshots"
                      onClick={() => setViewer({ slides: app.screenshots.map((x) => ({ url: x.url, caption: `${app.company} · ${app.jobTitle}` })), start: idx })}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={s.url.replace("/upload/", "/upload/c_fill,w_300,h_200/")}
                        alt="Submission screenshot"
                        className="aspect-[3/2] w-full rounded-lg border border-slate-200 object-cover transition hover:border-indigo-400 hover:ring-2 hover:ring-indigo-500/20"
                      />
                    </button>
                    <button
                      className="btn btn-secondary btn-sm absolute top-1.5 right-1.5 h-6 px-1.5 text-rose-600 opacity-0 group-hover:opacity-100 hover:text-rose-700 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                      onClick={async () => {
                        if (!(await confirm({ title: "Remove this screenshot?", message: "It is deleted from this application's submission proof.", confirmLabel: "Remove screenshot", danger: true }))) return;
                        patch({ removeScreenshot: s.publicId }, "Screenshot removed", "rm");
                      }}
                    >
                      <Trash2 />
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
            {app.status === "submitted" && (
              <button className="btn btn-ghost btn-sm -ml-2" onClick={() => patch({ status: "generated" }, "Marked as not submitted", "st")}>
                <Undo2 /> Mark as not submitted
              </button>
            )}
            {app.status !== "submitted" && (
              <div className="space-y-1.5 border-t border-slate-200 pt-3">
                <button
                  className="btn btn-primary w-full"
                  disabled={(!app.screenshots.length && !app.quickSubmit) || busy === "st"}
                  onClick={() => {
                    // No company / role yet: explain why and let the bidder fill them in.
                    const missing = missingJobInfo(app);
                    if (missing) {
                      toast.warning("Can't submit yet", missing);
                      setFixing({ reason: missing });
                      return;
                    }
                    patch({ status: "submitted" }, "Application submitted.", "st");
                  }}
                  title={app.screenshots.length || app.quickSubmit ? "Mark this application as submitted" : "Upload a confirmation screenshot first"}
                >
                  {busy === "st" ? <Spinner /> : <Send />} Submit application
                </button>
                {!app.screenshots.length && !app.quickSubmit && <div className="text-center text-xs text-slate-400">Upload a confirmation screenshot to enable Submit.</div>}
              </div>
            )}
          </Section>

          <section className="card p-0">
            <div className="card-header">
              <h2 className="card-title">Notes</h2>
            </div>
            <div className="card-body">
              <textarea className="input min-h-24" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Recruiter name, referral, follow-up date…" />
            </div>
            <div className="card-footer">
              <button
                className="btn btn-secondary btn-sm"
                disabled={notes === (app.notes ?? "") || busy === "notes"}
                onClick={() => patch({ notes }, "Notes saved", "notes")}
              >
                Save notes
              </button>
            </div>
          </section>
        </div>
      </div>
      {viewer && <Lightbox slides={viewer.slides} start={viewer.start} onClose={() => setViewer(null)} />}
    </div>
  );
}

/** A job imported from a URL whose description could not be read: paste it to generate the documents. */
function NotGeneratedView({ app, onGenerated }: { app: Detail; onGenerated: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"" | "paste" | "retry">("");
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  async function generate(mode: "paste" | "retry") {
    setBusy(mode);
    setMsg(null);
    try {
      const r = await api<{ status: string; message?: string }>("/api/applications/generate", {
        method: "POST",
        json: { applicationId: app._id, ...(mode === "paste" ? { jobText: text } : {}) },
      });
      if (r.status === "not_generated") setMsg({ kind: "error", text: r.message || "The job page still could not be read. Paste the description instead." });
      else onGenerated();
    } catch (e) {
      setMsg({ kind: "error", text: (e as Error).message });
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/applications", label: "Back to applications" }}
        title={app.company || "Job posting"}
        subtitle={[`Profile: ${app.profile?.label ?? "—"}`, `Imported ${fmtDateTime(app.createdAt)}`, app.user && `By ${app.user.name}`].filter(Boolean).join("  ·  ")}
        actions={
          app.jobUrl ? (
            <PostingLink url={app.jobUrl} read={app.jobUrlRead} className="btn btn-secondary" unreadClassName="text-slate-700" readClassName="text-slate-400">
              <ExternalLink />
              Open job posting
            </PostingLink>
          ) : undefined
        }
      />
      <div className="card p-0">
        <div className="flex items-start gap-3 rounded-t-xl border-b border-amber-200 bg-amber-50 px-5 py-4">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">We couldn&apos;t read the job description from this URL.</span>
              <Badge value="not_generated" />
            </div>
            {app.generationError && <div className="mt-1 text-[13px] text-slate-600">{app.generationError}</div>}
          </div>
        </div>
        <div className="card-body space-y-4">
          <div>
            <label className="label">Paste the job description</label>
            <textarea
              className="input min-h-64"
              placeholder="Open the job posting, copy the full description and paste it here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
              disabled={!!busy}
            />
            <div className={`hint tabular-nums ${text.trim().length >= 100 ? "text-emerald-600" : ""}`}>{text.trim().length} characters (min 100)</div>
          </div>
          {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
        </div>
        <div className="card-footer">
          {app.jobUrl && (
            <button className="btn btn-ghost" disabled={!!busy} onClick={() => generate("retry")}>
              {busy === "retry" ? <Spinner /> : <RefreshCw />} Try the URL again
            </button>
          )}
          <button className="btn btn-primary" disabled={!!busy || text.trim().length < 100} onClick={() => generate("paste")}>
            {busy === "paste" ? <Spinner /> : <Sparkles />} {busy === "paste" ? "Generating… up to a minute" : "Generate resume, cover letter & JD"}
          </button>
        </div>
      </div>
    </div>
  );
}
