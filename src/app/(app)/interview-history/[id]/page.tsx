"use client";

import { Fragment, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Check, Copy, Download, Sparkles, Trash2 } from "lucide-react";
import { Alert, api, downloadFile, fmtDateTime, PageHeader, PageSkeleton, Section, Spinner, Stat, useAsync } from "@/components/ui";
import { useConfirm, useToast } from "@/components/Alerts";
import { clock, duration, sessionTitle, STAGE_LABEL, type SessionDetail, type SessionReport } from "@/components/interviewHistory";

export default function Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const res = useAsync(() => api<{ session: SessionDetail }>(`/api/interview-history/${id}`), [id]);
  const [reviewing, setReviewing] = useState(false);
  const toast = useToast();
  const confirm = useConfirm();
  const s = res.data?.session;

  if (res.error) return <Alert>{res.error}</Alert>;
  if (!s) return <PageSkeleton variant="cards" />;
  const start = new Date(s.startedAt).getTime();

  async function review() {
    setReviewing(true);
    try {
      const { report } = await api<{ report: SessionReport }>(`/api/interview-history/${id}/report`, { method: "POST" });
      res.setData((d) => (d ? { session: { ...d.session, report } } : d));
    } catch (e) {
      toast.error("Couldn't review the interview", (e as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  async function remove(title: string) {
    const ok = await confirm({
      title: "Delete this interview?",
      message: (
        <>
          <b className="font-medium text-slate-900">{title}</b>: the transcript, suggested answers and AI review are deleted for everyone. This can&apos;t be undone.
        </>
      ),
      confirmLabel: "Delete interview",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/interview-history/${id}`, { method: "DELETE" });
      toast.success("Interview deleted", title);
      router.push("/interview-history");
    } catch (e) {
      toast.error("Couldn't delete the interview", (e as Error).message);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        back={{ href: "/interview-history", label: "Interview History" }}
        title={sessionTitle(s)}
        subtitle={[s.stage && (STAGE_LABEL[s.stage] ?? s.stage), fmtDateTime(s.startedAt), s.profileLabel, `recorded by ${s.userName}`].filter(Boolean).join(" · ")}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => downloadFile(`/api/interview-history/${id}/export`, `${sessionTitle(s)}.md`).catch((e) => toast.error("Export failed", e.message))}>
              <Download />
              Export
            </button>
            <button className="btn btn-secondary text-rose-600" onClick={() => remove(sessionTitle(s))}>
              <Trash2 />
              Delete
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Length" value={duration(s) || "—"} />
        <Stat label="Questions" value={s.answers.length} />
        <Stat label="Caption lines" value={s.captions.length} />
        <Stat label="AI review" value={s.report ? "Done" : "Not yet"} />
      </div>

      <Section
        title="AI review"
        description={
          s.report?.generatedAt
            ? `Written ${fmtDateTime(new Date(s.report.generatedAt))}.`
            : "A summary, what went well, what to improve, and a thank-you email. Uses TailorBid's OpenAI key."
        }
        actions={
          <button className={`btn ${s.report ? "btn-secondary" : "btn-primary"}`} onClick={review} disabled={reviewing || (!s.captions.length && !s.answers.length)}>
            {reviewing ? <Spinner /> : <Sparkles />}
            {reviewing ? "Reviewing…" : s.report ? "Write again" : "Review this interview"}
          </button>
        }
      >
        {reviewing && !s.report && <p className="text-sm text-slate-500">Reading the interview… This usually takes 10–30 seconds.</p>}
        {s.report ? <Report report={s.report} /> : !reviewing && <p className="text-sm text-slate-500">Not reviewed yet.</p>}
      </Section>

      <Section title={`Questions and suggested answers (${s.answers.length})`} bodyClassName="divide-y divide-slate-200">
        {!s.answers.length && <p className="card-body text-sm text-slate-500">No answers were written in this interview.</p>}
        {s.answers.map((a, i) => (
          <details key={i} className="group px-5 py-3" open={s.answers.length <= 3}>
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-900">
              <span className="mr-2 font-mono text-xs text-slate-400 tabular-nums">{clock(a.t - start)}</span>
              {a.question}
              {a.source === "prepared" && <span className="chip ml-2">Prepared</span>}
            </summary>
            <div className="mt-3 space-y-2 text-sm">
              {a.meaning && <p className="text-slate-500 italic">{a.meaning}</p>}
              {a.answer && <AnswerText text={a.answer} />}
              {a.keyPoints && <pre className="rounded-md bg-slate-50 px-3 py-2 font-sans text-xs whitespace-pre-wrap text-slate-600">{a.keyPoints}</pre>}
              {a.mood && (
                <p className="text-xs text-slate-500">
                  Interviewer mood: <b className="font-medium text-slate-700">{a.mood}</b>
                </p>
              )}
            </div>
          </details>
        ))}
      </Section>

      <Section title={`Transcript (${s.captions.length} lines)`} description="From Windows Live Captions, so some words may be wrong.">
        {!s.captions.length && <p className="text-sm text-slate-500">No captions were recorded.</p>}
        <div className="max-h-[32rem] space-y-1.5 overflow-y-auto text-sm">
          {s.captions.map((c, i) => (
            <p key={i} className="flex gap-3">
              <span className="w-12 shrink-0 font-mono text-xs leading-5 text-slate-400 tabular-nums">{clock(c.t - start)}</span>
              <span>
                {c.text}
                {c.translation && <span className="block text-slate-500">{c.translation}</span>}
              </span>
            </p>
          ))}
        </div>
      </Section>
    </div>
  );
}

/** The suggested answer as spoken lines; [cue] markers (smile, pause…) as small labels. */
function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-2 leading-relaxed text-slate-800">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p.split(/(\[[^\]\n]{1,30}\])/).map((part, j) =>
            /^\[.*\]$/.test(part) ? (
              <span key={j} className="chip mx-0.5 text-[11px]">
                {part.slice(1, -1)}
              </span>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            )
          )}
        </p>
      ))}
    </div>
  );
}

function Report({ report }: { report: SessionReport }) {
  const [copied, setCopied] = useState(false);
  const list = (title: string, items: string[]) =>
    items.length > 0 && (
      <div>
        <h3 className="mb-1.5 text-[13px] font-semibold text-slate-900">{title}</h3>
        <ul className="list-disc space-y-1 pl-5">
          {items.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <div className="space-y-4 text-sm text-slate-700">
      <p>{report.summary}</p>
      {list("What went well", report.wentWell)}
      {report.toImprove.length > 0 && (
        <div>
          <h3 className="mb-1.5 text-[13px] font-semibold text-slate-900">To improve</h3>
          <div className="space-y-2">
            {report.toImprove.map((x, i) => (
              <div key={i} className="rounded-md border border-slate-200 px-3 py-2">
                <div className="font-medium text-slate-900">{x.question}</div>
                <div className="text-slate-600">{x.tip}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {list("Prepare for the next stage", report.nextStagePrep)}
      <div>
        <h3 className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold text-slate-900">
          Thank-you email
          <button
            className="btn btn-ghost btn-sm"
            onClick={async () => {
              await navigator.clipboard.writeText(report.thankYouEmail);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
          >
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy"}
          </button>
        </h3>
        <pre className="rounded-md bg-slate-50 px-3 py-2 font-sans whitespace-pre-wrap">{report.thankYouEmail}</pre>
      </div>
    </div>
  );
}
