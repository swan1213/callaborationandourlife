"use client";

import { Fragment, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, BellOff, ClipboardList, Hash, MessageCirclePlus, Search, X } from "lucide-react";
import { useToast } from "@/components/Alerts";
import { chatSoundOn, setChatSound, useChat, type ChatConversation } from "@/components/Chat";
import { PresenceAvatar, usePresence } from "@/components/Presence";
import { api, fmtDate, fmtDateTime, Spinner } from "@/components/ui";
import { ThreadView } from "./thread";

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
          <span className="flex items-center gap-1">
            <SoundToggle />
            <button className="btn btn-secondary btn-sm" onClick={() => setPicking((p) => !p)} aria-expanded={picking}>
              {picking ? <X /> : <MessageCirclePlus />} {picking ? "Cancel" : "New message"}
            </button>
          </span>
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
              ) : c.kind === "reports" ? (
                <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
                  <ClipboardList className="size-4" />
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
                  {c.typing?.length ? (
                    <span className="truncate text-xs font-medium text-indigo-600">
                      {c.kind === "direct" ? "typing…" : c.typing.length === 1 ? `${c.typing[0]} is typing…` : `${c.typing.length} people are typing…`}
                    </span>
                  ) : (
                  <span className={`truncate text-xs ${c.unread ? "text-slate-700" : "text-slate-500"}`}>
                    {c.lastMessage
                      ? `${c.lastMessage.mine ? "You: " : c.kind !== "direct" && c.lastMessage.senderName !== "TailorBid" ? `${c.lastMessage.senderName}: ` : ""}${c.lastMessage.body}`
                      : c.kind === "team"
                        ? "Everyone on the team"
                        : c.kind === "reports"
                          ? "Member reports arrive every evening"
                          : "No messages yet"}
                  </span>
                  )}
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

/** "14:05" today, otherwise "2026-10-21". */
function shortWhen(iso: string) {
  const d = fmtDate(iso);
  return d === fmtDate(new Date()) ? fmtDateTime(iso).slice(11) : d;
}

/** Turns the new-message sound on or off (per browser). */
function SoundToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(chatSoundOn()), []);
  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm btn-icon"
      onClick={() => {
        setChatSound(!on);
        setOn(!on);
      }}
      aria-pressed={on}
      aria-label={on ? "Turn the message sound off" : "Turn the message sound on"}
      title={on ? "Sound on for new messages (click to mute)" : "Sound off (click to turn on)"}
    >
      {on ? <Bell /> : <BellOff />}
    </button>
  );
}
