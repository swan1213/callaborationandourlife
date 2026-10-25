"use client";

import { Fragment, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Hash, MessageCirclePlus, Search, SendHorizontal, SmilePlus, Users, X } from "lucide-react";
import { useToast } from "@/components/Alerts";
import { Avatar } from "@/components/Avatar";
import { useChat, type ChatConversation, type ChatPerson } from "@/components/Chat";
import { EmojiPicker } from "@/components/EmojiPicker";
import { isEmojiOnly } from "@/lib/emoji";
import { PresenceAvatar, PresenceLabel, usePresence } from "@/components/Presence";
import { api, fmtDate, fmtDateTime, Spinner } from "@/components/ui";

type Reaction = { emoji: string; users: { _id: string; name: string }[] };
type Msg = { _id: string; sender: string; senderName: string; body: string; reactions: Reaction[]; createdAt: string };
type Thread = { conversation: { _id: string; kind: "team" | "direct"; name: string; other: ChatPerson | null }; messages: Msg[]; hasMore: boolean; now: string };

const POLL_MS = 3000;
/** One-click reactions at the top of the reaction picker. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏"];
const MAX_MESSAGE = 4000;
const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };

export default function Page() {
  return (
    <Suspense>
      <ChatPage />
    </Suspense>
  );
}

function ChatPage() {
  const sp = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const chat = useChat();
  const withUser = sp.get("with");
  const team = chat.conversations.find((c) => c.kind === "team");
  // Phones show the list or one conversation; wider screens both side by side.
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  // ?c= picks a conversation; without it wide screens open the team channel (phones show the list).
  const active = sp.get("c") || (wide ? (team?._id ?? "") : "");
  const [picking, setPicking] = useState(false);

  const open = useCallback((id: string) => router.replace(`/chat?c=${id}`, { scroll: false }), [router]);

  // ?with=<account> (from Who is online): open or create that direct conversation.
  useEffect(() => {
    if (!withUser) return;
    api<{ _id: string }>("/api/chat", { method: "POST", json: { userId: withUser } })
      .then((r) => {
        open(r._id);
        chat.refresh();
      })
      .catch((e) => {
        toast.error("Couldn't open the conversation", (e as Error).message);
        router.replace("/chat");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withUser]);

  async function startWith(userId: string) {
    setPicking(false);
    try {
      const r = await api<{ _id: string }>("/api/chat", { method: "POST", json: { userId } });
      open(r._id);
      chat.refresh();
    } catch (e) {
      toast.error("Couldn't open the conversation", (e as Error).message);
    }
  }

  const showThreadOnPhone = !!sp.get("c");
  return (
    <div className="card mx-auto flex h-[calc(100dvh-6.5rem)] min-h-[28rem] max-w-[1400px] overflow-hidden p-0 lg:h-[calc(100dvh-8rem)]">
      <aside className={`w-full shrink-0 flex-col border-r border-slate-200 md:flex md:w-72 lg:w-80 ${showThreadOnPhone ? "hidden" : "flex"}`}>
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3">
          <h1 className="text-[15px] font-semibold text-slate-900">Chat</h1>
          <button className="btn btn-secondary btn-sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
            {picking ? <X /> : <MessageCirclePlus />} {picking ? "Cancel" : "New message"}
          </button>
        </div>
        {picking ? (
          <PeoplePicker me={chat.me} onPick={startWith} />
        ) : (
          <ConversationList conversations={chat.conversations} active={active} loaded={chat.loaded} onOpen={open} />
        )}
      </aside>
      <section className={`min-w-0 flex-1 flex-col md:flex ${showThreadOnPhone ? "flex" : "hidden"}`}>
        {active ? (
          <ThreadView key={active} id={active} me={chat.me} onRead={chat.refresh} onBack={() => router.replace("/chat")} />
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        )}
      </section>
    </div>
  );
}

function ConversationList({ conversations, active, loaded, onOpen }: { conversations: ChatConversation[]; active: string; loaded: boolean; onOpen: (id: string) => void }) {
  if (!loaded)
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  const directs = conversations.filter((c) => c.kind === "direct");
  return (
    <ul className="flex-1 overflow-y-auto p-1.5">
      {conversations.map((c, i) => (
        <Fragment key={c._id}>
          {c.kind === "direct" && i === conversations.findIndex((x) => x.kind === "direct") && <li className="px-2 pt-3 pb-1 text-[11px] font-medium text-slate-400">Direct messages</li>}
          <li>
            <button
              type="button"
              onClick={() => onOpen(c._id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${c._id === active ? "bg-indigo-50" : "hover:bg-slate-50"}`}
              aria-current={c._id === active ? "true" : undefined}
            >
              {c.kind === "team" ? (
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
                  <Hash className="size-4" />
                </span>
              ) : (
                <PresenceAvatar userId={c.other?._id ?? ""} avatar={c.other?.avatar} name={c.name} size={32} />
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-[13px] ${c.unread ? "font-semibold text-slate-900" : "font-medium text-slate-800"}`}>{c.name}</span>
                  {c.lastMessage && <span className="shrink-0 text-[11px] text-slate-400">{shortWhen(c.lastMessage.at)}</span>}
                </span>
                <span className="flex items-center justify-between gap-2">
                  <span className={`truncate text-xs ${c.unread ? "text-slate-700" : "text-slate-500"}`}>
                    {c.lastMessage ? `${c.lastMessage.mine ? "You" : c.kind === "team" ? c.lastMessage.senderName : ""}${c.lastMessage.mine || c.kind === "team" ? ": " : ""}${c.lastMessage.body}` : c.kind === "team" ? "Everyone on the team" : "No messages yet"}
                  </span>
                  {c.unread > 0 && (
                    <span className="inline-flex h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-semibold text-white tabular-nums">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </button>
          </li>
        </Fragment>
      ))}
      {!directs.length && <li className="px-2 pt-3 text-xs text-slate-400">No direct messages yet. Click New message, or the chat icon next to someone in Who is online.</li>}
    </ul>
  );
}

function PeoplePicker({ me, onPick }: { me: string; onPick: (userId: string) => void }) {
  const { people } = usePresence();
  const [q, setQ] = useState("");
  const order = { online: 0, away: 1, offline: 2 };
  const list = people
    .filter((p) => p._id !== me && p.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative shrink-0 p-2">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <ul className="flex-1 overflow-y-auto p-1.5 pt-0">
        {list.map((p) => (
          <li key={p._id}>
            <button type="button" onClick={() => onPick(p._id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
              <PresenceAvatar userId={p._id} avatar={p.avatar} name={p.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-slate-900">{p.name}</span>
                <span className="block text-[11px] text-slate-500">{ROLE_LABEL[p.role] ?? p.role}</span>
              </span>
            </button>
          </li>
        ))}
        {!list.length && <li className="px-2 py-3 text-xs text-slate-400">{people.length ? "No one matches." : "Loading…"}</li>}
      </ul>
    </div>
  );
}

function ThreadView({ id, me, onRead, onBack }: { id: string; me: string; onRead: () => void; onBack: () => void }) {
  const toast = useToast();
  const { byId } = usePresence();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Scroll to the bottom after the next render (first load, sent message, or new ones while at the bottom).
  const stick = useRef(true);
  // Keeps the view in place when older messages are added above.
  const keepFrom = useRef<number | null>(null);
  // Server time of the last load or poll: the next poll also asks for messages whose reactions changed since then.
  const since = useRef("");

  // New messages are added; ones already shown are replaced when their reactions changed.
  const merge = useCallback((incoming: Msg[], where: "end" | "start") => {
    setThread((t) => {
      if (!t) return t;
      const byId = new Map(incoming.map((m) => [m._id, m]));
      let changed = false;
      const kept = t.messages.map((m) => {
        const n = byId.get(m._id);
        if (!n || JSON.stringify(n.reactions) === JSON.stringify(m.reactions)) return m;
        changed = true;
        return n;
      });
      const have = new Set(t.messages.map((m) => m._id));
      const fresh = incoming.filter((m) => !have.has(m._id));
      if (!fresh.length && !changed) return t;
      return { ...t, messages: where === "end" ? [...kept, ...fresh] : [...fresh, ...kept] };
    });
  }, []);

  useEffect(() => {
    let alive = true;
    api<Thread>(`/api/chat/${id}`)
      .then((t) => {
        if (!alive) return;
        stick.current = true;
        since.current = t.now;
        setThread(t);
        onRead();
      })
      .catch((e) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [id, onRead]);

  const last = thread?.messages.at(-1)?.createdAt ?? "";
  const loaded = !!thread;
  useEffect(() => {
    if (!loaded) return;
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      const p = new URLSearchParams(last ? { after: last } : {});
      if (last && since.current) p.set("changed", since.current);
      api<Thread>(`/api/chat/${id}${p.size ? `?${p}` : ""}`)
        .then((t) => {
          since.current = t.now;
          const el = scroller.current;
          const fromOthers = t.messages.some((m) => m.sender !== me && m.createdAt > last);
          if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) stick.current = true;
          merge(t.messages, "end");
          if (fromOthers) onRead();
        })
        .catch(() => {});
    };
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, [id, last, loaded, me, merge, onRead]);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (keepFrom.current != null) {
      el.scrollTop = el.scrollHeight - keepFrom.current;
      keepFrom.current = null;
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight;
      stick.current = false;
    }
  }, [thread]);

  async function loadOlder() {
    const first = thread?.messages[0];
    if (!first) return;
    setLoadingOlder(true);
    try {
      const t = await api<Thread>(`/api/chat/${id}?before=${encodeURIComponent(first.createdAt)}`);
      const el = scroller.current;
      keepFrom.current = el ? el.scrollHeight - el.scrollTop : null;
      merge(t.messages, "start");
      setThread((x) => (x ? { ...x, hasMore: t.hasMore } : x));
    } catch (e) {
      toast.error("Couldn't load earlier messages", (e as Error).message);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const r = await api<{ message: Msg }>(`/api/chat/${id}`, { method: "POST", json: { body } });
      stick.current = true;
      merge([r.message], "end");
      setDraft("");
      onRead();
    } catch (e) {
      toast.error("Message not sent", (e as Error).message);
    } finally {
      setSending(false);
      input.current?.focus();
    }
  }

  /** Adds my reaction, or takes it back when I already reacted with that emoji. */
  async function react(messageId: string, emoji: string) {
    try {
      const r = await api<{ message: Msg }>(`/api/chat/${id}/react`, { method: "POST", json: { messageId, emoji } });
      merge([r.message], "end");
    } catch (e) {
      toast.error("Reaction not saved", (e as Error).message);
    }
  }

  /** Puts the emoji where the caret is (or replaces the selection) and keeps typing there. */
  function insertEmoji(emoji: string) {
    const el = input.current;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + emoji + draft.slice(end);
    if (next.length > MAX_MESSAGE) return;
    setDraft(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + emoji.length, start + emoji.length);
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    });
  }

  const c = thread?.conversation;
  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-3">
        <button className="btn btn-ghost btn-sm btn-icon md:hidden" onClick={onBack} aria-label="All conversations">
          <ArrowLeft />
        </button>
        {c?.kind === "team" ? (
          <>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Hash className="size-4" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">Team chat</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="size-3" /> Everyone on the team can read this
              </span>
            </span>
          </>
        ) : c?.other ? (
          <>
            <PresenceAvatar userId={c.other._id} avatar={c.other.avatar} name={c.other.name} size={32} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {c.other.name} <span className="font-normal text-slate-400">· {ROLE_LABEL[c.other.role] ?? c.other.role}</span>
              </span>
              <PresenceLabel userId={c.other._id} />
            </span>
          </>
        ) : null}
      </header>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5">
        {error ? (
          <div className="py-10 text-center text-sm text-slate-500">{error}</div>
        ) : !thread ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {thread.hasMore && (
              <div className="mb-3 flex justify-center">
                <button className="btn btn-ghost btn-sm" onClick={loadOlder} disabled={loadingOlder}>
                  {loadingOlder && <Spinner className="size-3.5" />} Load earlier messages
                </button>
              </div>
            )}
            {!messages.length && (
              <div className="py-10 text-center text-sm text-slate-500">{c?.kind === "team" ? "No messages yet. Say hello to the team." : `No messages yet. Say hello to ${c?.other?.name ?? "them"}.`}</div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const day = fmtDate(m.createdAt);
              const newDay = !prev || fmtDate(prev.createdAt) !== day;
              // Messages from the same person within 5 minutes are grouped under one name.
              const grouped = !newDay && prev?.sender === m.sender && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              const mine = m.sender === me;
              const person = byId.get(m.sender);
              const big = isEmojiOnly(m.body);
              return (
                <Fragment key={m._id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" />
                      {day}
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                  <div className={`flex gap-2 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"}`}>
                    <span className="w-7 shrink-0">{!mine && !grouped && <Avatar avatar={person?.avatar} name={m.senderName} size={28} />}</span>
                    <div className={`group flex max-w-[75%] min-w-0 flex-col ${mine ? "items-end" : "items-start"}`}>
                      {!grouped && (
                        <span className="mb-0.5 text-[11px] text-slate-500">
                          {!mine && <span className="font-medium text-slate-700">{m.senderName} </span>}
                          {fmtDateTime(m.createdAt).slice(11)}
                        </span>
                      )}
                      {/* The react button sits beside the bubble: shown on hover, always on touch screens. */}
                      <div className={`flex max-w-full items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                        <div
                          className={
                            big
                              ? "min-w-0 text-4xl leading-tight"
                              : `min-w-0 rounded-2xl px-3 py-1.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap ${mine ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900"}`
                          }
                          title={fmtDateTime(m.createdAt)}
                          style={{ overflowWrap: "anywhere" }}
                        >
                          {linkify(m.body, mine)}
                        </div>
                        <EmojiPicker
                          onPick={(e) => react(m._id, e)}
                          quick={QUICK_REACTIONS}
                          closeOnPick
                          label="React"
                          icon={<SmilePlus />}
                          buttonClassName="btn btn-ghost btn-sm btn-icon shrink-0 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100 pointer-coarse:opacity-100"
                        />
                      </div>
                      {m.reactions.length > 0 && (
                        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
                          {m.reactions.map((r) => {
                            const minePick = r.users.some((u) => u._id === me);
                            const names = r.users.map((u) => (u._id === me ? "You" : u.name)).join(", ");
                            return (
                              <button
                                key={r.emoji}
                                type="button"
                                onClick={() => react(m._id, r.emoji)}
                                title={`${names} reacted with ${r.emoji}`}
                                aria-pressed={minePick}
                                className={`inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs font-medium tabular-nums transition-colors ${
                                  minePick ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <span className="text-sm leading-none">{r.emoji}</span>
                                {r.users.length}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      <form
        className="flex shrink-0 items-end gap-2 border-t border-slate-200 p-2.5 sm:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <textarea
          ref={input}
          className="input max-h-40 min-h-10 flex-1 resize-none py-2"
          rows={1}
          placeholder={c?.kind === "team" ? "Message the team" : c?.other ? `Message ${c.other.name}` : "Write a message"}
          value={draft}
          maxLength={MAX_MESSAGE}
          disabled={!thread}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = "auto";
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter adds a line (and IME composition is left alone).
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          autoFocus
        />
        <EmojiPicker onPick={insertEmoji} disabled={!thread} />
        <button type="submit" className="btn btn-primary h-10" disabled={!draft.trim() || sending || !thread} aria-label="Send">
          {sending ? <Spinner className="size-4" /> : <SendHorizontal />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>
    </>
  );
}

/** Plain text with http(s) links made clickable (job links get pasted here a lot). */
function linkify(text: string, mine: boolean): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) =>
    i % 2 ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className={`underline underline-offset-2 ${mine ? "text-white" : "text-indigo-600"}`}>
        {part}
      </a>
    ) : (
      part
    )
  );
}

/** "14:05" today, otherwise "2026-10-21". */
function shortWhen(iso: string) {
  const d = fmtDate(iso);
  return d === fmtDate(new Date()) ? fmtDateTime(iso).slice(11) : d;
}
