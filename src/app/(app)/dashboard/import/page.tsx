"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Alerts";
import { ArrowRight, CircleCheck, Link2, ListChecks, Pause, Play, RefreshCw, Sparkles, Square, X } from "lucide-react";
import { Alert, api, ApiError, Badge, EmptyState, PageHeader, Spinner, useAsync, useClientPaging } from "@/components/ui";
import { urlKey } from "@/lib/links";

type ProfileOpt = { id: string; label: string; fullName: string; monthlyQuota: number; usedThisMonth: number };

type RowState = "queued" | "running" | "done" | "not_generated" | "skipped" | "blocked" | "failed" | "stopped";
type Row = {
  n: number;
  url: string;
  state: RowState;
  message?: string;
  appId?: string;
  company?: string;
  jobTitle?: string;
};

const MAX_ROWS = 200;
const CONCURRENCY = 2;

/* ------------------------------------------------------------- CSV parsing */

/** RFC-4180-ish CSV parser (quotes, escaped quotes, CRLF). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === "," || c === ";" || c === "\t") row.push(cell), (cell = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  return rows.map((r) => r.map((x) => x.trim())).filter((r) => r.some(Boolean));
}

const isUrl = (s: string) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(s);

const URL_HEADERS = /^(url|link|job ?url|job ?link|posting|posting ?url|job ?posting|href|apply ?url|application ?url)$/i;

/** Extracts job URLs: a URL-named column if present, otherwise every cell that looks like a link. */
function extractUrls(text: string) {
  const rows = parseCsv(text);
  let urls: string[] = [];
  const header = rows[0] ?? [];
  const col = header.findIndex((h) => URL_HEADERS.test(h));
  if (col >= 0) urls = rows.slice(1).map((r) => r[col] ?? "");
  else urls = rows.flatMap((r) => r.filter(isUrl));
  const valid = urls.map((u) => u.trim()).filter(isUrl);
  const invalid = (col >= 0 ? rows.length - 1 : 0) - valid.length;
  const seen = new Set<string>();
  const unique = valid.filter((u) => {
    const k = urlKey(u);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { urls: unique, duplicates: valid.length - unique.length, invalid: Math.max(0, invalid) };
}

const STATE_BADGE: Record<RowState, [string, string]> = {
  queued: ["user", "queued"],
  running: ["generated", "generating…"],
  done: ["submitted", "generated"],
  not_generated: ["not_generated", "not-generated"],
  skipped: ["suspended", "already generated"],
  blocked: ["pending", "blocked"],
  failed: ["rejected", "failed"],
  stopped: ["suspended", "not run"],
};

/* ------------------------------------------------------------------- page */

export default function ImportPage() {
  const profiles = useAsync(() => api<{ profiles: ProfileOpt[] }>("/api/profiles").then((r) => r.profiles), []);
  const [profileId, setProfileId] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [notice, setNotice] = useState("");
  const toast = useToast();
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const cancelRef = useRef(false);
  const rowsRef = useRef<Row[]>([]);
  const [pasted, setPasted] = useState("");
  // Job postings waiting for a manual paste: at the bidder's limit, generating from URLs is paused.
  const manual = useAsync(() => api<{ manualQueue: { pending: number; limit: number; blocked: boolean } | null }>("/api/me").then((r) => r.manualQueue), []);
  const q = manual.data;
  const nearLimit = !!q && q.limit > 0 && !q.blocked && q.pending >= Math.ceil(q.limit * 0.8);

  useEffect(() => {
    if (!profileId && profiles.data?.length) setProfileId(profiles.data[0].id);
  }, [profiles.data, profileId]);

  // Warn before leaving while the queue is running.
  useEffect(() => {
    if (!running) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [running]);

  const setRow = (n: number, patch: Partial<Row>) => {
    rowsRef.current = rowsRef.current.map((r) => (r.n === n ? { ...r, ...patch } : r));
    setRows(rowsRef.current);
  };

  /** Turns the pasted links into the row list; returns false when there are none. */
  function load(text: string, source: string) {
    const { urls, duplicates, invalid } = extractUrls(text);
    if (!urls.length) {
      setNotice(`No job URLs found in ${source}. Paste one link per line.`);
      return false;
    }
    const kept = urls.slice(0, MAX_ROWS);
    rowsRef.current = kept.map((url, i) => ({ n: i + 1, url, state: "queued" }));
    setRows(rowsRef.current);
    const notes = [
      `${kept.length} job URL${kept.length === 1 ? "" : "s"} loaded from ${source}.`,
      duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} removed.` : "",
      invalid ? `${invalid} row${invalid === 1 ? "" : "s"} without a valid URL skipped.` : "",
      urls.length > MAX_ROWS ? `Only the first ${MAX_ROWS} are imported per batch.` : "",
    ];
    setNotice(notes.filter(Boolean).join(" "));
    return true;
  }

  const processRow = useCallback(async (row: Row): Promise<"ok" | "quota"> => {
    setRow(row.n, { state: "running", message: undefined });
    try {
      const r = await api<{ id: string; status: string; company: string; jobTitle: string; message?: string }>("/api/applications/generate", {
        method: "POST",
        json: { profileId, jobUrl: row.url, keepOnScrapeFail: true },
      });
      if (r.status === "not_generated")
        setRow(row.n, {
          state: "not_generated",
          appId: r.id,
          company: r.company,
          message: r.message?.startsWith("Resume generation failed")
            ? "The AI step failed. Saved as not-generated; retry or open it."
            : "Job description couldn't be read. Saved as not-generated; open it to paste the description.",
        });
      else setRow(row.n, { state: "done", appId: r.id, company: r.company, jobTitle: r.jobTitle });
    } catch (e) {
      const err = e as ApiError;
      if (err.status === 409 && err.data.duplicateId) setRow(row.n, { state: "skipped", appId: String(err.data.duplicateId), message: "Already generated with this profile" });
      else if (err.status === 409) setRow(row.n, { state: "blocked", message: err.message });
      else if (err.status === 429) {
        setRow(row.n, { state: "stopped", message: err.message });
        return "quota";
      } else if (!err.status || err.status >= 500)
        // Timed out / connection lost: the server already saved the attempt as "not generated" in the history.
        setRow(row.n, { state: "not_generated", message: "Timed out. Saved in the history as not-generated; retry or paste the description." });
      else setRow(row.n, { state: "failed", message: err.message || "Request failed" });
    }
    return "ok";
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(onlyStates: RowState[]) {
    cancelRef.current = false;
    pausedRef.current = false;
    setPaused(false);
    setRunning(true);
    const queue = rowsRef.current.filter((r) => onlyStates.includes(r.state)).map((r) => r.n);
    queue.forEach((n) => setRow(n, { state: "queued", message: undefined }));
    let quotaHit = false;
    const worker = async () => {
      while (queue.length && !cancelRef.current && !quotaHit) {
        while (pausedRef.current && !cancelRef.current) await new Promise((r) => setTimeout(r, 300));
        if (cancelRef.current) break;
        const n = queue.shift()!;
        const row = rowsRef.current.find((r) => r.n === n)!;
        if ((await processRow(row)) === "quota") quotaHit = true;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    // Anything left over: quota reached or cancelled.
    for (const n of queue) setRow(n, { state: "stopped", message: quotaHit ? "Monthly quota reached for this profile" : "Cancelled" });
    setRunning(false);
    const done = rowsRef.current.filter((r) => r.state === "done").length;
    const notGenerated = rowsRef.current.filter((r) => r.state === "not_generated").length;
    if (quotaHit) toast.warning("Monthly quota reached", "The remaining job URLs were not run.");
    if (done)
      toast({
        title: `${done} application${done === 1 ? "" : "s"} generated`,
        description: notGenerated ? `${notGenerated} saved as not generated: add their job descriptions.` : undefined,
        tone: "success",
        action: { label: "Review & submit", onClick: () => router.push("/applications?status=generated") },
      });
    else if (notGenerated) toast.warning(`${notGenerated} saved as not generated`, "Add their job descriptions in View Generated Resumes.");
    manual.reload();
    setPaused(false);
    profiles.reload();
  }

  const count = (s: RowState) => rows.filter((r) => r.state === s).length;
  const finished = rows.filter((r) => !["queued", "running"].includes(r.state)).length;
  const pct = rows.length ? Math.round((finished / rows.length) * 100) : 0;
  const selected = profiles.data?.find((p) => p.id === profileId);
  const remainingQuota = selected && selected.monthlyQuota > 0 ? Math.max(0, selected.monthlyQuota - selected.usedThisMonth) : null;
  const { pageRows, pager } = useClientPaging(rows, "csv-import");

  const pastedCount = extractUrls(pasted).urls.length;
  /** "Generate resume": load the pasted links (if any) and start generating straight away. */
  function generate() {
    if (pastedCount) {
      if (load(pasted, "pasted text")) run(["queued"]);
    } else if (count("queued")) run(["queued"]);
    else setNotice("Paste at least one job URL (one per line).");
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Generate resume"
        subtitle="Paste job posting URLs and get a tailored resume, cover letter and job description for each. They're saved as generated; submit them later from View Generated Resumes."
      />

      {profiles.error && (
        <div className="mb-4">
          <Alert>{profiles.error}</Alert>
        </div>
      )}
      {q?.blocked && (
        <div className="mb-4">
          <Alert>
            Automatic generation is paused: {q.pending} job posting{q.pending === 1 ? " is" : "s are"} waiting for you to paste the job description (limit {q.limit}).{" "}
            <Link href="/applications?status=not_generated" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Handle them in View Generated Resumes
              <ArrowRight className="size-3.5" />
            </Link>
          </Alert>
        </div>
      )}
      {nearLimit && q && (
        <div className="mb-4">
          <Alert kind="info">
            {q.pending} of {q.limit} job postings are waiting for you to paste the description. At {q.limit}, generating from job URLs pauses until you handle them.{" "}
            <Link href="/applications?status=not_generated" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
              Handle them now
              <ArrowRight className="size-3.5" />
            </Link>
          </Alert>
        </div>
      )}
      {profiles.data && !profiles.data.length && <Alert kind="info">No profiles are assigned to you yet. Ask an administrator to assign one.</Alert>}

      {!!profiles.data?.length && (
        <div className="grid items-start gap-6 lg:grid-cols-3">
          <section className="card min-w-0 p-0 lg:sticky lg:top-20 lg:col-span-1 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
            <div className="card-header">
              <div className="min-w-0">
                <h2 className="card-title">New batch</h2>
                <p className="card-description">Pick a profile, paste links, generate.</p>
              </div>
            </div>

            <div className="card-body space-y-5">
              <div>
                <label className="label flex items-center gap-2" htmlFor="import-profile">
                  <StepNumber n={1} />
                  Profile
                </label>
                <select id="import-profile" className="input" value={profileId} onChange={(e) => setProfileId(e.target.value)} disabled={running}>
                  {profiles.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {selected && (
                  <>
                    {selected.monthlyQuota > 0 && (
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${remainingQuota === 0 ? "bg-rose-500" : selected.usedThisMonth / selected.monthlyQuota >= 0.8 ? "bg-amber-500" : "bg-indigo-600"}`}
                          style={{ width: `${Math.min(100, (selected.usedThisMonth / selected.monthlyQuota) * 100)}%` }}
                        />
                      </div>
                    )}
                    <div className={`hint tabular-nums ${remainingQuota === 0 ? "text-rose-600" : ""}`}>
                      {remainingQuota === null ? `${selected.usedThisMonth} generated this month · no quota` : `${remainingQuota} of ${selected.monthlyQuota} left this month`}
                    </div>
                  </>
                )}
              </div>

              <div>
                <label className="label flex items-center gap-2" htmlFor="job-urls">
                  <StepNumber n={2} />
                  Job URLs
                </label>
                <textarea
                  id="job-urls"
                  className="input min-h-48 font-mono text-xs leading-relaxed"
                  placeholder={"https://boards.greenhouse.io/company/jobs/123456\nhttps://jobs.lever.co/company/abcdef"}
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  disabled={running}
                />
                <div className="hint flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span>
                    One link per line · up to {MAX_ROWS}
                  </span>
                  <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${pastedCount ? "text-slate-900" : "text-slate-500"}`}>
                    <Link2 className="size-3.5 text-slate-400" />
                    {pastedCount} URL{pastedCount === 1 ? "" : "s"} found
                  </span>
                </div>
              </div>

              {notice && <Alert kind="info">{notice}</Alert>}
            </div>

            <div className="space-y-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-4">
              {!running ? (
                <>
                  <button className="btn btn-primary btn-lg h-auto min-h-10 w-full py-2 whitespace-normal" disabled={(!pastedCount && !count("queued")) || !!q?.blocked} onClick={generate}>
                    <Sparkles />
                    Generate resume{pastedCount > 1 ? `s (${pastedCount})` : ""}
                  </button>
                  {count("failed") + count("stopped") + count("not_generated") > 0 && (
                    <button className="btn btn-secondary h-auto min-h-9 w-full py-2 text-center whitespace-normal" onClick={() => run(["failed", "stopped", "not_generated"])}>
                      <RefreshCw />
                      Retry {count("failed") + count("stopped") + count("not_generated")} failed / not generated / not run
                    </button>
                  )}
                  {!!rows.length && (
                    <button className="btn btn-ghost btn-sm w-full" onClick={() => ((rowsRef.current = []), setRows([]), setNotice(""))}>
                      <X />
                      Clear list
                    </button>
                  )}
                </>
              ) : (
                <div className="flex gap-2">
                  <button
                    className="btn btn-secondary flex-1"
                    onClick={() => {
                      pausedRef.current = !pausedRef.current;
                      setPaused(pausedRef.current);
                    }}
                  >
                    {paused ? <Play /> : <Pause />}
                    {paused ? "Resume" : "Pause"}
                  </button>
                  <button className="btn btn-danger flex-1" onClick={() => (cancelRef.current = true)}>
                    <Square />
                    Cancel
                  </button>
                </div>
              )}
              {running && <p className="pt-1 text-center text-xs text-slate-500">Keep this page open until it finishes. {CONCURRENCY} run at a time.</p>}
            </div>
          </section>

          <div className="min-w-0 space-y-4 lg:col-span-2">
            {!!rows.length && (
              <section className="card space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    {running ? (
                      <Spinner className="size-4 text-indigo-600" />
                    ) : (
                      <CircleCheck className="size-4 text-emerald-600" />
                    )}
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {finished} / {rows.length} processed
                    </span>
                    {paused && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                        <Pause className="size-3" />
                        paused
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-medium text-slate-500 tabular-nums">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-indigo-600 transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                  <Count label="generated" value={count("done")} dot="bg-emerald-500" />
                  <Count label="not generated" value={count("not_generated")} dot="bg-amber-500" />
                  <Count label="already generated" value={count("skipped")} dot="bg-slate-400" />
                  <Count label="blocked" value={count("blocked")} dot="bg-amber-500" />
                  <Count label="failed" value={count("failed")} dot="bg-rose-500" />
                </div>
                {!running && count("done") + count("not_generated") > 0 && (
                  <Alert kind="success">
                    {count("done") > 0 && (
                      <>
                        {count("done")} application{count("done") === 1 ? "" : "s"} generated.{" "}
                        <Link href="/applications?status=generated" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                          Review &amp; submit them in View Generated Resumes
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </>
                    )}
                    {count("not_generated") > 0 && (
                      <>
                        {" "}
                        {count("not_generated")} saved as not generated:{" "}
                        <Link href="/applications?status=not_generated" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
                          add their job descriptions
                          <ArrowRight className="size-3.5" />
                        </Link>
                      </>
                    )}
                  </Alert>
                )}
              </section>
            )}

            <section className="card overflow-hidden p-0">
              <div className="card-header">
                <div className="min-w-0">
                  <h2 className="card-title">Results</h2>
                  <p className="card-description">Each job URL with its generation status.</p>
                </div>
                {!!rows.length && <span className="chip tabular-nums">{rows.length} URL{rows.length === 1 ? "" : "s"}</span>}
              </div>
              {!rows.length ? (
                <EmptyState icon={ListChecks} title="No jobs in this batch yet" description="Paste job URLs and click Generate resume; each one appears here with its status." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th className="num w-10">#</th>
                        <th>Job URL</th>
                        <th>Job</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pageRows.map((r) => {
                        const [tone, label] = STATE_BADGE[r.state];
                        let host = r.url;
                        try {
                          const u = new URL(r.url);
                          host = `${u.hostname.replace(/^www\./, "")}${u.pathname.length > 1 ? u.pathname : ""}`;
                        } catch {
                          /* keep raw */
                        }
                        return (
                          <tr key={r.n} className={r.state === "running" ? "bg-indigo-50" : ""}>
                            <td className="num text-xs text-slate-400">{r.n}</td>
                            <td className="max-w-72 min-w-[10rem]">
                              <a href={r.url} target="_blank" rel="noreferrer" className="block truncate font-mono text-xs text-indigo-600 hover:underline" title={r.url}>
                                {host}
                              </a>
                            </td>
                            <td>
                              {r.appId && (r.company || r.jobTitle) ? (
                                <Link href={`/applications/${r.appId}`} className="group block">
                                  <span className="font-medium text-slate-900 group-hover:underline">{r.company || "Unknown company"}</span>
                                  <span className="block text-xs text-slate-500">{r.jobTitle}</span>
                                </Link>
                              ) : r.appId ? (
                                <Link href={`/applications/${r.appId}`} className="link inline-flex items-center gap-1 text-xs">
                                  {r.state === "not_generated" ? `${r.company ? `${r.company} · ` : ""}Add job description` : "Open existing"}
                                  <ArrowRight className="size-3" />
                                </Link>
                              ) : (
                                <span className="text-slate-300">—</span>
                              )}
                            </td>
                            <td>
                              <span className="inline-flex items-center gap-1.5">
                                {r.state === "running" && <Spinner className="size-3 text-indigo-600" />}
                                <Badge value={tone} label={label} />
                              </span>
                              {r.message && <div className="mt-1 max-w-72 min-w-[12rem] text-xs text-slate-500">{r.message}</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            {!!rows.length && pager}
          </div>
        </div>
      )}
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden className="grid size-5 shrink-0 place-items-center rounded-full border border-slate-300 bg-slate-50 text-[11px] font-semibold text-slate-700 tabular-nums">
      {n}
    </span>
  );
}

function Count({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <div className="text-lg font-semibold text-slate-900 tabular-nums">{value}</div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500">
        <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${dot}`} />
        <span className="min-w-0 leading-tight">{label}</span>
      </div>
    </div>
  );
}
