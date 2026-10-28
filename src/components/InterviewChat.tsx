"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, FileText, Paperclip, RotateCcw, Send, X } from "lucide-react";
import { Spinner } from "./ui";
import Lightbox, { type Slide } from "./Lightbox";

type ChatFile = { name: string; text: string };
type Turn = { role: "user" | "assistant"; content: string; images?: string[]; files?: ChatFile[] };
/** Waiting to be sent with the next question; a document is read to text first (`loading`). */
type Pending = { id: number; kind: "image"; name: string; url: string } | { id: number; kind: "file"; name: string; text: string; loading?: boolean };

/** One click asks these; the answers come from this application's resume and job description. */
const SUGGESTIONS = [
  "Tell me about yourself.",
  "Why do you want to work here?",
  "Walk me through the hardest project you've worked on.",
  "Why are you leaving your current job?",
  "What's your biggest strength and your biggest weakness?",
  "Tell me about a time you disagreed with a teammate.",
  "Do you have any questions for us?",
];

const MAX_ATTACHMENTS = 4;
/** Images sent with the conversation (newest first): enough for follow-ups, small enough for the request limit. */
const MAX_SENT_IMAGES = 4;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const DOC = /\.(pdf|docx|txt|md|csv|json)$/i;
const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,.pdf,.docx,.txt,.md,.csv,.json";

/** The image as a JPEG data URL, at most 1600 px on its longest side (screenshot text stays readable). */
async function shrinkImage(file: File): Promise<string> {
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = src;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; // transparent screenshots stay readable as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(src);
  }
}

/**
 * Interview practice on an application: you ask as the interviewer, the AI answers as the candidate
 * (api/applications/[id]/chat). The "Chat" tab of an application: starts empty until the first question.
 * A question can carry images (pasted, dropped or chosen) and documents, read by api/applications/[id]/chat/attach.
 * Nothing is saved: leaving the tab clears the chat.
 */
export default function InterviewChat({ appId }: { appId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(-1);
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const nextId = useRef(1);

  const ask = useCallback(
    async (question: string, history: Turn[], attached: Pending[] = []) => {
      // Keep the line breaks of a pasted form question, but not its empty lines.
      const q = question
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{2,}/g, "\n")
        .trim();
      const images = attached.flatMap((a) => (a.kind === "image" ? [a.url] : []));
      const files = attached.flatMap((a) => (a.kind === "file" ? [{ name: a.name, text: a.text }] : []));
      if (!q && !images.length && !files.length) return;
      const next: Turn[] = [...history, { role: "user", content: q, ...(images.length && { images }), ...(files.length && { files }) }];
      setTurns(next);
      setDraft("");
      setPending([]);
      setError("");
      setBusy(true);
      const ctrl = new AbortController();
      abort.current = ctrl;
      let answer = "";
      // Only the newest images travel with the conversation (each is a few hundred KB).
      let room = MAX_SENT_IMAGES;
      const sent = next
        .slice()
        .reverse()
        .map((t) => {
          if (!t.images) return t;
          const keep = t.images.slice(0, Math.max(0, room));
          room -= keep.length;
          return { ...t, images: keep };
        })
        .reverse();
      try {
        const res = await fetch(`/api/applications/${appId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: sent }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || (res.status === 413 ? "The attachments are too large. Remove one and try again." : `Request failed (${res.status})`));
        }
        // The answer streams in: show it as it is written.
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setTurns([...next, { role: "assistant", content: answer }]);
        }
        if (!answer.trim()) throw new Error("The AI returned an empty answer. Please try again.");
      } catch (e) {
        if (ctrl.signal.aborted) return; // tab left or started over
        setError((e as Error).message);
        if (!answer.trim()) {
          setTurns(history); // drop the unanswered question so it can be asked again
          setDraft(q);
          setPending(attached);
        }
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    },
    [appId]
  );

  const attach = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError("");
      const room = MAX_ATTACHMENTS - pending.length;
      if (files.length > room) setError(`Up to ${MAX_ATTACHMENTS} attachments per question.`);
      for (const file of files.slice(0, Math.max(0, room))) {
        const id = nextId.current++;
        if (file.type.startsWith("image/")) {
          if (file.size > MAX_IMAGE_BYTES) {
            setError(`"${file.name}" is too large (15 MB at most).`);
            continue;
          }
          try {
            const url = await shrinkImage(file);
            setPending((p) => [...p, { id, kind: "image", name: file.name || "Pasted image", url }]);
          } catch {
            setError(`Couldn't open the image "${file.name}".`);
          }
        } else if (DOC.test(file.name)) {
          if (file.size > MAX_FILE_BYTES) {
            setError(`"${file.name}" is too large (4 MB at most).`);
            continue;
          }
          setPending((p) => [...p, { id, kind: "file", name: file.name, text: "", loading: true }]);
          try {
            const form = new FormData();
            form.append("file", file);
            const res = await fetch(`/api/applications/${appId}/chat/attach`, { method: "POST", body: form });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || `Couldn't read "${file.name}"`);
            setPending((p) => p.map((a) => (a.id === id ? { id, kind: "file", name: file.name, text: data.text } : a)));
          } catch (e) {
            setPending((p) => p.filter((a) => a.id !== id));
            setError((e as Error).message);
          }
        } else {
          setError(`"${file.name}" can't be attached. Use an image, PDF, Word (.docx) or text file.`);
        }
      }
    },
    [appId, pending.length]
  );

  // Leaving the tab stops an answer that is still streaming.
  useEffect(() => () => abort.current?.abort(), []);

  // Keep the newest message in view, scrolling only the message list (not the page).
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns, busy]);

  const copy = async (i: number) => {
    try {
      await navigator.clipboard.writeText(turns[i].content);
      setCopied(i);
      setTimeout(() => setCopied(-1), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const restart = () => {
    setTurns([]);
    setError("");
  };
  const asked = new Set(turns.filter((t) => t.role === "user").map((t) => t.content));
  const reading = pending.some((a) => a.kind === "file" && a.loading);
  const canSend = !busy && !reading && (!!draft.trim() || pending.length > 0);
  const send = () => canSend && ask(draft, turns, pending);

  return (
    <div className="card-body p-3 sm:p-5">
      <p className="mb-3 text-[13px] text-slate-500">
        Interview practice: you ask as the interviewer, the candidate answers from this application&apos;s resume and job description. Attach a screenshot or file
        (a form, a task) to ask about it. Leaving this tab clears the chat.
      </p>

      <div ref={list} className="max-h-[60vh] min-h-80 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        {!turns.length && !busy && (
          <p className="flex min-h-72 items-center justify-center text-center text-sm text-slate-400">Ask an interview question below, or click a suggested one.</p>
        )}
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex flex-col items-end gap-1.5">
              {!!t.images?.length && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {t.images.map((url, j) => (
                    <button
                      key={j}
                      type="button"
                      className="overflow-hidden rounded-lg border border-slate-200 bg-white"
                      onClick={() => setViewer({ slides: t.images!.map((u) => ({ url: u })), start: j })}
                      aria-label="Open image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="max-h-40 max-w-56 object-cover" />
                    </button>
                  ))}
                </div>
              )}
              {!!t.files?.length && (
                <div className="flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {t.files.map((f, j) => (
                    <span key={j} className="chip max-w-64 text-xs">
                      <FileText className="size-3.5 shrink-0" />
                      <span className="truncate">{f.name}</span>
                    </span>
                  ))}
                </div>
              )}
              {t.content && (
                <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-white">{t.content}</div>
              )}
            </div>
          ) : (
            <div key={i} className="group">
              <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
                {t.content}
              </div>
              <button type="button" className="btn btn-ghost btn-sm mt-1 text-xs text-slate-500" onClick={() => copy(i)}>
                {copied === i ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} {copied === i ? "Copied" : "Copy answer"}
              </button>
            </div>
          )
        )}
        {busy && turns[turns.length - 1]?.role === "user" && (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Spinner /> Thinking about the answer…
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {SUGGESTIONS.filter((s) => !asked.has(s)).map((s) => (
          <button key={s} type="button" className="chip cursor-pointer text-xs hover:bg-slate-100" disabled={busy} onClick={() => ask(s, turns)}>
            {s}
          </button>
        ))}
      </div>

      <form
        className={`mt-3 rounded-lg ${dragging ? "outline-2 outline-offset-4 outline-indigo-400 outline-dashed" : ""}`}
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setDragging(false);
          attach([...e.dataTransfer.files]);
        }}
      >
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((a) => (
              <div key={a.id} className="relative flex items-center gap-2 rounded-lg border border-slate-200 bg-white p-1.5 pr-7 text-xs text-slate-600">
                {a.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt="" className="size-10 rounded object-cover" />
                ) : a.loading ? (
                  <Spinner />
                ) : (
                  <FileText className="size-4 shrink-0 text-slate-500" />
                )}
                <span className="max-w-40 truncate">{a.kind === "file" && a.loading ? `Reading ${a.name}…` : a.name}</span>
                <button
                  type="button"
                  className="absolute top-1 right-1 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  onClick={() => setPending((p) => p.filter((x) => x.id !== a.id))}
                  aria-label={`Remove ${a.name}`}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={picker}
            type="file"
            accept={ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              attach([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-secondary px-2.5"
            disabled={busy || pending.length >= MAX_ATTACHMENTS}
            onClick={() => picker.current?.click()}
            title="Attach an image or file (PDF, Word, text)"
            aria-label="Attach an image or file"
          >
            <Paperclip className="size-4" />
          </button>
          <textarea
            className="input min-h-11 flex-1 resize-y"
            rows={2}
            placeholder="Ask a question… (Enter sends, Shift+Enter new line; paste or drop screenshots and files)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={(e) => {
              // A copied screenshot or file; copied text (even with a picture, as from Word) pastes as text.
              const files = [...e.clipboardData.files];
              if (!files.length || e.clipboardData.getData("text/plain")) return;
              e.preventDefault();
              attach(files);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            maxLength={4000}
          />
          <button type="submit" className="btn btn-primary" disabled={!canSend}>
            <Send className="size-4" /> Ask
          </button>
        </div>
      </form>
      <div className="mt-2 flex justify-end">
        <button type="button" className="btn btn-ghost btn-sm text-xs" onClick={restart} disabled={busy || !turns.length}>
          <RotateCcw className="size-3.5" /> Start over
        </button>
      </div>
      {viewer && <Lightbox slides={viewer.slides} start={viewer.start} onClose={() => setViewer(null)} />}
    </div>
  );
}
