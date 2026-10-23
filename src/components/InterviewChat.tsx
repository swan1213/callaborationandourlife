"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, RotateCcw, Send } from "lucide-react";
import { Spinner } from "./ui";

type Turn = { role: "user" | "assistant"; content: string };

const FIRST_QUESTION = "Tell me about yourself.";
/** One click asks these; the answers come from this application's resume and job description. */
const SUGGESTIONS = [
  "Why do you want to work here?",
  "Walk me through the hardest project you've worked on.",
  "Why are you leaving your current job?",
  "What's your biggest strength and your biggest weakness?",
  "Tell me about a time you disagreed with a teammate.",
  "Do you have any questions for us?",
];

/**
 * Interview practice on an application: you ask as the interviewer, the AI answers as the candidate
 * (api/applications/[id]/chat). The "Chat" tab of an application: opens with "Tell me about yourself."
 * Nothing is saved: leaving the tab clears the chat.
 */
export default function InterviewChat({ appId }: { appId: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(-1);
  const list = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  const ask = useCallback(
    async (question: string, history: Turn[]) => {
      const q = question.trim();
      if (!q) return;
      const next: Turn[] = [...history, { role: "user", content: q }];
      setTurns(next);
      setDraft("");
      setError("");
      setBusy(true);
      const ctrl = new AbortController();
      abort.current = ctrl;
      let answer = "";
      try {
        const res = await fetch(`/api/applications/${appId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Request failed (${res.status})`);
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
        }
      } finally {
        if (!ctrl.signal.aborted) setBusy(false);
      }
    },
    [appId]
  );

  // Open with the classic first question; leaving the tab stops an answer that is still streaming.
  // (React's development double mount cancels the first request and the second one asks again.)
  useEffect(() => {
    ask(FIRST_QUESTION, []);
    return () => abort.current?.abort();
  }, [ask]);

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
    ask(FIRST_QUESTION, []);
  };
  const asked = new Set(turns.filter((t) => t.role === "user").map((t) => t.content));

  return (
    <div className="card-body p-3 sm:p-5">
      <p className="mb-3 text-[13px] text-slate-500">
        Interview practice: you ask as the interviewer, the candidate answers from this application&apos;s resume and job description. Leaving this tab clears the chat.
      </p>

      <div ref={list} className="max-h-[60vh] min-h-80 space-y-4 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50/60 p-4">
        {turns.map((t, i) =>
          t.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-indigo-600 px-3.5 py-2 text-sm text-white">{t.content}</div>
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
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!busy) ask(draft, turns);
        }}
      >
        <textarea
          className="input min-h-11 flex-1 resize-y"
          rows={2}
          placeholder="Ask an interview question… (Enter to send, Shift+Enter for a new line)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (!busy) ask(draft, turns);
            }
          }}
          maxLength={4000}
        />
        <button type="submit" className="btn btn-primary" disabled={busy || !draft.trim()}>
          <Send className="size-4" /> Ask
        </button>
      </form>
      <div className="mt-2 flex justify-end">
        <button type="button" className="btn btn-ghost btn-sm text-xs" onClick={restart} disabled={busy}>
          <RotateCcw className="size-3.5" /> Start over
        </button>
      </div>
    </div>
  );
}
