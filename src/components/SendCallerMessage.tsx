"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Send } from "lucide-react";
import { Alert, api, Spinner, SkeletonText, useAsync } from "./ui";
import DateInput from "./DateInput";
import SearchSelect from "./SearchSelect";
import { tzDayKey } from "@/lib/viewerTz";

type Options = {
  me: { id: string; role: string };
  profiles: { id: string; label: string; callers: { id: string; name: string }[] }[];
  callers: { id: string; name: string }[];
};

/** Send a caller their interviews for a chosen day (plus an optional note), in-app and by email. */
export default function SendCallerMessage({ onCancel, onDone }: { onCancel: () => void; onDone: (msg: string) => void }) {
  const options = useAsync(() => api<Options>("/api/interviews/schedule"), []);
  const [callerId, setCallerId] = useState("");
  const [day, setDay] = useState(() => tzDayKey(new Date()));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Admins: every active caller. Profile managers: callers assigned to their profiles.
  const callers = useMemo(() => {
    const d = options.data;
    if (!d) return [];
    const list = d.me.role === "admin" ? d.callers : d.profiles.flatMap((p) => p.callers);
    const seen = new Set<string>();
    return list.filter((c) => !seen.has(c.id) && seen.add(c.id)).map((c) => ({ value: c.id, label: c.name }));
  }, [options.data]);
  useEffect(() => {
    if (!callerId && callers.length === 1) setCallerId(callers[0].value);
  }, [callers, callerId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ caller: string; interviews: number }>("/api/interviews/message", { method: "POST", json: { callerId, day, note } });
      onDone(`Message sent to ${r.caller}: ${r.interviews} interview${r.interviews === 1 ? "" : "s"} on ${day}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (options.loading && !options.data) return <SkeletonText lines={4} />;
  return (
    <form className="space-y-4" onSubmit={submit}>
      {error && <Alert>{error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="msg-caller">
            Caller *
          </label>
          <SearchSelect
            id="msg-caller"
            required
            value={callerId}
            options={callers}
            onChange={setCallerId}
            placeholder={callers.length ? "Choose a caller" : "No callers available"}
            searchPlaceholder="Find a caller…"
            emptyText="No caller matches"
          />
        </div>
        <div>
          <label className="label" htmlFor="msg-day">
            Date *
          </label>
          <DateInput id="msg-day" value={day} onChange={setDay} />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="msg-note">
          Message
        </label>
        <textarea
          id="msg-note"
          className="input min-h-24"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional: anything the caller should know for that day"
        />
      </div>
      <p className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500">
        <Info className="mt-px size-3.5 shrink-0 text-slate-400" aria-hidden />
        The caller gets their scheduled interviews for that day (time, profile, company and role) with your message, in their notifications and by email.
      </p>
      <div className="-mx-5 -mb-5 flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
        <button type="button" className="btn btn-secondary flex-1 sm:flex-none" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn-primary flex-1 sm:flex-none" disabled={busy || !callerId || !day}>
          {busy ? <Spinner /> : <Send />} Send message
        </button>
      </div>
    </form>
  );
}
