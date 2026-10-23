"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LogIn, RefreshCw } from "lucide-react";
import { LATEST_RELEASE } from "@/lib/releaseNotes";
import { api, ApiError, Modal } from "./ui";

type ProfileChange = { id: string; label: string; at: string; by: string; sections: string[] };
type Account = { role: string; interviewAccess: boolean; profiles: Record<string, string>; managed: Record<string, string>; pages: string[] };
type Updates = { now: string; release?: { id: string; title: string }; profiles: ProfileChange[]; account: Account };

/** The server runs a newer deploy than this page was built with (lib/releaseNotes.ts): what to tell the person. */
const releaseLine = (u: Updates) =>
  u.release?.id && u.release.id !== LATEST_RELEASE ? [`TailorBid was updated${u.release.title ? `: ${u.release.title}` : ""}. Reload to get the new version and see what changed.`] : [];
/** "reload": a page reload picks the change up; "signin": the session itself is out of date or gone. */
type State = { kind: "reload" | "signin" | "signedout"; lines: string[] };

const POLL_MS = 60_000;
const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };

const names = (ids: string[], labels: Record<string, string>) => ids.map((id) => labels[id]).join(", ");
const minus = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).filter((id) => !(id in b));

/** What differs between the account as the page loaded and now, in words. */
function accountChanges(was: Account, now: Account): string[] {
  const out: string[] = [];
  if (was.role !== now.role) out.push(`Your role changed from ${ROLE_LABEL[was.role] ?? was.role} to ${ROLE_LABEL[now.role] ?? now.role}.`);
  const added = minus(now.profiles, was.profiles);
  const removed = minus(was.profiles, now.profiles);
  if (added.length) out.push(`You can now use: ${names(added, now.profiles)}.`);
  if (removed.length) out.push(`You can no longer use: ${names(removed, was.profiles)}.`);
  const mAdded = minus(now.managed, was.managed);
  const mRemoved = minus(was.managed, now.managed);
  if (mAdded.length) out.push(`You now manage: ${names(mAdded, now.managed)}.`);
  if (mRemoved.length) out.push(`You no longer manage: ${names(mRemoved, was.managed)}.`);
  if (was.interviewAccess !== now.interviewAccess) out.push(`Interview Requests was turned ${now.interviewAccess ? "on" : "off"} for you.`);
  if (was.pages.join() !== now.pages.join()) out.push("An administrator changed which pages you can open.");
  return out;
}

/**
 * Asks to reload, or to sign in again, when something this page loaded with is out of date: TailorBid was redeployed
 * with newer release notes (What's new then shows them after the reload), a profile the account uses
 * was edited by someone else, or the account's access changed (role, profiles, interview access, page access), or the
 * session ended (signed out elsewhere, account deactivated). Checks every minute and when the window gets focus.
 * "Later" leaves a bar at the top; a newer change asks again.
 */
export default function UpdatePrompt() {
  const start = useRef<{ at: string; account: Account } | null>(null);
  const seen = useRef("");
  const [state, setState] = useState<State | null>(null);
  const [open, setOpen] = useState(false);

  const show = useCallback((next: State) => {
    setState(next);
    const key = `${next.kind}|${next.lines.join("|")}`;
    if (key !== seen.current) {
      seen.current = key;
      setOpen(true);
    }
  }, []);

  const check = useCallback(async () => {
    try {
      if (!start.current) {
        const u = await api<Updates>("/api/me/updates");
        start.current = { at: u.now, account: u.account };
        const lines = releaseLine(u);
        if (lines.length) show({ kind: "reload", lines });
        return;
      }
      const u = await api<Updates>(`/api/me/updates?since=${encodeURIComponent(start.current.at)}`);
      const lines = [
        ...releaseLine(u),
        ...accountChanges(start.current.account, u.account),
        ...u.profiles.map((p) => `${p.by || "Someone"} updated ${p.label}${p.sections.length ? `: ${p.sections.join(", ")}` : ""}.`),
      ];
      if (lines.length) show({ kind: u.account.role !== start.current.account.role ? "signin" : "reload", lines });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401 && start.current)
        show({ kind: "signedout", lines: ["Your session ended: you signed out in another window, or an administrator changed your account."] });
      /* offline or a server hiccup: try again on the next check */
    }
  }, [show]);

  useEffect(() => {
    check();
    const t = setInterval(check, POLL_MS);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  if (!state) return null;
  const reload = () => window.location.reload();
  const signIn = async () => {
    // A role change needs a new session (the role is part of it); a session that is already gone just needs the form.
    if (state.kind === "signin") await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  };
  const needsSignIn = state.kind !== "reload";
  const title = state.kind === "signedout" ? "You've been signed out" : state.kind === "signin" ? "Your account changed" : "Updates for you";
  const bar =
    state.kind === "signedout" ? "You've been signed out." : state.kind === "signin" ? "Your account changed. Sign in again to continue." : "Something you use changed. Reload to use the latest version.";

  return (
    <>
      <div className="mx-auto mb-6 flex max-w-7xl flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm text-indigo-800">
        {needsSignIn ? <LogIn className="size-4 shrink-0" /> : <RefreshCw className="size-4 shrink-0" />}
        <span className="flex-1">{bar}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={needsSignIn ? signIn : reload}>
          {needsSignIn ? "Sign in again" : "Reload"}
        </button>
      </div>

      {/* Signed out: nothing on the page works any more, so this one can't be put off. */}
      <Modal open={open} onClose={() => state.kind !== "signedout" && setOpen(false)} title={title}>
        <div className="space-y-2 text-sm text-slate-700">
          {state.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          <p className="pt-1 text-slate-500">
            {needsSignIn
              ? "Sign in again to continue with your current access."
              : "Reload TailorBid so what you see and generate uses the latest version."}{" "}
            Anything you haven&apos;t saved on this page will be lost.
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {state.kind !== "signedout" && (
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>
              Later
            </button>
          )}
          {needsSignIn ? (
            <button type="button" className="btn btn-primary" onClick={signIn}>
              <LogIn className="size-4" /> Sign in again
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={reload}>
              <RefreshCw className="size-4" /> Reload now
            </button>
          )}
        </div>
      </Modal>
    </>
  );
}
