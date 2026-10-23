"use client";

import { useEffect, useState, type ReactNode } from "react";

// Postings opened in this session (so every link to the same URL greys out immediately).
const openedThisSession = new Set<string>();
const listeners = new Set<() => void>();

function markRead(url: string) {
  openedThisSession.add(url);
  listeners.forEach((l) => l());
  const body = JSON.stringify({ url });
  // sendBeacon survives the tab switch to the posting; fall back to fetch.
  const sent = typeof navigator !== "undefined" && navigator.sendBeacon?.("/api/reads", new Blob([body], { type: "application/json" }));
  if (!sent) fetch("/api/reads", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/**
 * Job posting link that turns gray once the current user has opened it.
 * "Read" is stored per user on the server (`read` comes from the API), not per browser.
 */
export default function PostingLink({
  url,
  read,
  children,
  className = "",
  unreadClassName = "text-indigo-600 underline-offset-2 transition-colors hover:underline",
  readClassName = "text-slate-400 underline-offset-2 transition-colors hover:text-slate-500 hover:underline",
}: {
  url: string;
  read?: boolean;
  children: ReactNode;
  className?: string;
  unreadClassName?: string;
  readClassName?: string;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const isRead = read || openedThisSession.has(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={() => markRead(url)}
      onAuxClick={(e) => e.button === 1 && markRead(url)}
      title={isRead ? "Already opened" : "Open job posting"}
      className={`${className} ${isRead ? readClassName : unreadClassName}`}
    >
      {children}
    </a>
  );
}
