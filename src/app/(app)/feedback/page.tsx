"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ScreenshotDrop } from "@/components/interviews";
import { useToast } from "@/components/Alerts";
import { CATEGORY_LABEL, FeedbackStatus, Thread, type FeedbackItem } from "@/components/FeedbackUi";
import { ChevronDown, Image as ImageIcon, MessageSquare, Plus } from "lucide-react";
import { Alert, api, EmptyState, fmtDate, Modal, PageHeader, Spinner, SkeletonText, useAsync } from "@/components/ui";

export default function Page() {
  return (
    <Suspense>
      <FeedbackPage />
    </Suspense>
  );
}

function FeedbackPage() {
  const sp = useSearchParams();
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (sp.get("new") === "1") setCreating(true);
  }, [sp]);
  const list = useAsync(() => api<{ items: FeedbackItem[] }>("/api/feedback?mine=1").then((r) => r.items), []);
  const [category, setCategory] = useState<FeedbackItem["category"]>("idea");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [shots, setShots] = useState<{ url: string; publicId: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const [openId, setOpenId] = useState("");

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/feedback", { method: "POST", json: { category, subject, message, screenshots: shots } });
      setSubject("");
      setMessage("");
      setShots([]);
      setCreating(false);
      toast.success("Thanks! Your feedback was sent", "Replies from the administrators appear here and in your notifications.");
      list.reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Feedback"
        subtitle="Feedback you sent and the administrators' replies. Report a problem, suggest an improvement or ask a question."
        actions={
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus />
            Send feedback
          </button>
        }
      />
      {list.error && (
        <div className="mb-4">
          <Alert>{list.error}</Alert>
        </div>
      )}
      <div>
        {creating && (
          <Modal open onClose={() => setCreating(false)} title="Send feedback">
            <form className="space-y-4" onSubmit={send}>
              {error && <Alert>{error}</Alert>}
              <div>
                <label className="label">Type</label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(CATEGORY_LABEL) as FeedbackItem["category"][]).map((c) => (
                    <label
                      key={c}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors ${category === c ? "border-indigo-300 bg-indigo-50 font-medium text-slate-900" : "border-slate-200 text-slate-700 hover:bg-slate-50"}`}
                    >
                      <input type="radio" name="category" className="size-4" checked={category === c} onChange={() => setCategory(c)} />
                      {CATEGORY_LABEL[c]}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className="label" htmlFor="fb-subject">
                  Subject <span className="text-rose-600">*</span>
                </label>
                <input id="fb-subject" className="input" required maxLength={200} value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <label className="label" htmlFor="fb-details">
                  Details
                </label>
                <textarea
                  id="fb-details"
                  className="input min-h-32"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="What happened, what you expected, or your idea"
                />
              </div>
              <div>
                <label className="label">Screenshots</label>
                <ScreenshotDrop value={shots} onChange={setShots} max={10} />
              </div>
              <div className="-mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-page px-5 py-3">
                <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button className="btn btn-primary" disabled={busy || !subject.trim()}>
                  {busy && <Spinner />} Send to administrators
                </button>
              </div>
            </form>
          </Modal>
        )}

        <div className="card overflow-hidden p-0">
          <div className="card-header">
            <h2 className="card-title">My feedback</h2>
            {!!list.data?.length && <span className="text-xs text-slate-500 tabular-nums">{list.data.length}</span>}
          </div>
          {list.loading && !list.data ? (
            <div className="divide-y divide-slate-200">
              {Array.from({ length: 5 }, (_, i) => (
                <div key={i} className="px-5 py-4">
                  <SkeletonText lines={2} />
                </div>
              ))}
            </div>
          ) : !list.data?.length ? (
            <EmptyState
              icon={MessageSquare}
              title="You haven’t sent any feedback yet."
              description="Report a problem, suggest an improvement or ask a question."
              action={
                <button className="btn btn-secondary" onClick={() => setCreating(true)}>
                  <Plus />
                  Send feedback
                </button>
              }
            />
          ) : (
            <ul className="divide-y divide-slate-200">
              {list.data.map((f) => (
                <li key={f._id}>
                  <button
                    className="flex w-full cursor-pointer items-start justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-slate-50"
                    onClick={() => setOpenId(openId === f._id ? "" : f._id)}
                    aria-expanded={openId === f._id}
                  >
                    <span className="flex min-w-0 items-start gap-2.5">
                      <ChevronDown className={`mt-0.5 size-4 shrink-0 text-slate-400 transition-transform ${openId === f._id ? "" : "-rotate-90"}`} />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-slate-900">{f.subject}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-slate-500">
                          <span className="chip">{CATEGORY_LABEL[f.category]}</span>
                          <span className="tabular-nums">{fmtDate(f.createdAt)}</span>
                          {f.screenshots.length ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <ImageIcon className="size-3" />
                                {`${f.screenshots.length} screenshot${f.screenshots.length === 1 ? "" : "s"}`}
                              </span>
                            </>
                          ) : null}
                          {f.replies.length ? (
                            <>
                              <span aria-hidden>·</span>
                              <span className="inline-flex items-center gap-1">
                                <MessageSquare className="size-3" />
                                {`${f.replies.length} repl${f.replies.length === 1 ? "y" : "ies"}`}
                              </span>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </span>
                    <FeedbackStatus s={f.status} />
                  </button>
                  {openId === f._id && (
                    <div className="px-5 pb-4 sm:pl-11">
                      <Thread f={f} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
