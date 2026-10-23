"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AudioLines, ChevronRight, Clock, MessageCircleQuestion } from "lucide-react";
import { Alert, api, EmptyState, fmtDateTime, PageHeader, TableSkeleton, useAsync, useClientPaging } from "@/components/ui";
import { duration, sessionTitle, STAGE_LABEL, type SessionSummary } from "@/components/interviewHistory";

export default function Page() {
  return (
    <Suspense>
      <InterviewHistory />
    </Suspense>
  );
}

function InterviewHistory() {
  const router = useRouter();
  const sp = useSearchParams();
  const list = useAsync(() => api<{ items: SessionSummary[]; canSeeAll: boolean }>("/api/interview-history"), []);
  const [q, setQ] = useState("");
  const [person, setPerson] = useState("");
  const [stage, setStage] = useState("");
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const people = useMemo(() => [...new Map(items.map((s) => [s.user, s.userName])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [items]);
  const needle = q.trim().toLowerCase();
  const rows = items.filter(
    (s) =>
      (!person || s.user === person) &&
      (!stage || s.stage === stage) &&
      (!needle || [s.company, s.role, s.profileLabel, s.userName, s.summary].some((v) => v?.toLowerCase().includes(needle)))
  );
  const { pageRows, pager } = useClientPaging(rows, "interview-history");

  // The assistant's "Open in TailorBid" link: ?open=<the assistant's id of the recording>.
  const open = sp.get("open");
  useEffect(() => {
    const s = open && items.find((x) => x.clientId === open);
    if (s) router.replace(`/interview-history/${s._id}`);
  }, [open, items, router]);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Interview History"
        subtitle={
          list.data?.canSeeAll
            ? "Every interview recorded with the Interview Assistant: transcript, suggested answers and AI review."
            : "Interviews you recorded with the Interview Assistant: transcript, suggested answers and AI review."
        }
      />
      {list.error && <Alert>{list.error}</Alert>}
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 sm:max-w-xs">
          <label className="label">Search</label>
          <input className="input w-full" placeholder="Company, role, profile…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {list.data?.canSeeAll && (
          <div className="min-w-0 flex-1 sm:flex-none">
            <label className="label">Recorded by</label>
            <select className="input w-full sm:w-48" value={person} onChange={(e) => setPerson(e.target.value)}>
              <option value="">Everyone</option>
              {people.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="min-w-0 flex-1 sm:flex-none">
          <label className="label">Stage</label>
          <select className="input w-full sm:w-48" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All</option>
            {Object.entries(STAGE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {list.data && (
          <div className="ml-auto pb-2 text-xs text-slate-500 tabular-nums">
            {rows.length} interview{rows.length === 1 ? "" : "s"}
          </div>
        )}
      </div>
      <div className="card overflow-hidden p-0">
        {list.loading && !list.data ? (
          <TableSkeleton rows={6} cols={5} />
        ) : !rows.length ? (
          <EmptyState
            icon={AudioLines}
            title={items.length ? "No interviews match." : "No interviews yet."}
            description={
              items.length
                ? "Try another search or filter."
                : "Open the Interview Assistant from an interview and click Start interview. When it ends, it shows up here."
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Interview</th>
                  {list.data?.canSeeAll && <th>Recorded by</th>}
                  <th>Stage</th>
                  <th>When</th>
                  <th className="num">Length</th>
                  <th className="actions">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((s) => (
                  <tr key={s._id} className="cursor-pointer" onClick={() => router.push(`/interview-history/${s._id}`)}>
                    <td className="min-w-[16rem]">
                      <Link href={`/interview-history/${s._id}`} className="font-medium text-slate-900 hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                        {sessionTitle(s)}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        {s.profileLabel && <span>{s.profileLabel}</span>}
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <MessageCircleQuestion className="size-3" />
                          {s.questionCount} question{s.questionCount === 1 ? "" : "s"}
                        </span>
                        {s.summary && <span className="chip">Reviewed</span>}
                      </div>
                      {s.summary && <div className="mt-1 line-clamp-1 text-xs text-slate-500">{s.summary}</div>}
                    </td>
                    {list.data?.canSeeAll && <td className="whitespace-nowrap">{s.userName}</td>}
                    <td className="whitespace-nowrap">{s.stage ? <span className="chip">{STAGE_LABEL[s.stage] ?? s.stage}</span> : "—"}</td>
                    <td className="whitespace-nowrap text-slate-600 tabular-nums">{fmtDateTime(s.startedAt)}</td>
                    <td className="num text-slate-600">
                      {duration(s) ? (
                        <span className="inline-flex items-center gap-1">
                          <Clock className="size-3" />
                          {duration(s)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="actions text-slate-400">
                      <ChevronRight className="ml-auto size-4" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!rows.length && <div className="border-t border-slate-200 px-4 pb-3">{pager}</div>}
      </div>
    </div>
  );
}
