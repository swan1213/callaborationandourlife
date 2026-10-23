"use client";

import { useState } from "react";
import { MessageSquare } from "lucide-react";
import Lightbox from "./Lightbox";
import { Badge, fmtDateTime } from "./ui";

export type FeedbackItem = {
  _id: string;
  user?: { _id: string; name: string; email: string; role: string; avatar?: string } | null;
  userName: string;
  userEmail: string;
  role: string;
  category: "bug" | "idea" | "question" | "other";
  subject: string;
  message: string;
  screenshots: { url: string; publicId: string }[];
  status: "new" | "in_progress" | "resolved";
  replies: { byName: string; message: string; at: string }[];
  seenAt?: string | null;
  createdAt: string;
};

export const CATEGORY_LABEL: Record<FeedbackItem["category"], string> = { bug: "Bug / problem", idea: "Idea / request", question: "Question", other: "Other" };
export const STATUS_LABEL: Record<FeedbackItem["status"], string> = { new: "New", in_progress: "In progress", resolved: "Resolved" };
const STATUS_BADGE: Record<FeedbackItem["status"], string> = { new: "pending", in_progress: "generated", resolved: "approved" };

export const FeedbackStatus = ({ s }: { s: FeedbackItem["status"] }) => <Badge value={STATUS_BADGE[s]} label={STATUS_LABEL[s]} />;

export function Shots({ items, caption }: { items: { url: string; publicId: string }[]; caption: string }) {
  const [start, setStart] = useState<number | null>(null);
  if (!items.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <button key={s.publicId} type="button" className="cursor-zoom-in" onClick={() => setStart(i)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={s.url.replace("/upload/", "/upload/c_fill,w_240,h_160/")}
              alt={`Screenshot ${i + 1}`}
              className="h-24 w-36 rounded-lg border border-slate-200 object-cover transition-shadow hover:ring-2 hover:ring-indigo-400"
            />
          </button>
        ))}
      </div>
      {start !== null && <Lightbox slides={items.map((s) => ({ url: s.url, caption }))} start={start} onClose={() => setStart(null)} />}
    </>
  );
}

export function Thread({ f }: { f: FeedbackItem }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span className="chip">{CATEGORY_LABEL[f.category]}</span>
        <span className="tabular-nums">{fmtDateTime(f.createdAt)}</span>
      </div>
      {f.message && <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-700">{f.message}</p>}
      <Shots items={f.screenshots} caption={f.subject} />
      {!!f.replies.length && (
        <div className="space-y-2 border-l-2 border-slate-200 pl-3">
          {f.replies.map((r, i) => (
            <div key={i} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
              <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                <MessageSquare className="size-3.5 text-indigo-600" />
                <span className="font-medium text-slate-900">{r.byName}</span>
                <span className="text-slate-400">·</span>
                <span className="text-slate-500 tabular-nums">{fmtDateTime(r.at)}</span>
              </div>
              <div className="whitespace-pre-wrap text-slate-700">{r.message}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
