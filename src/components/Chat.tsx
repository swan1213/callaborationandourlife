"use client";

// Team chat (lib/chat.ts). The provider polls the conversation list for unread counts, the header button shows
// them, and a toast announces new messages while the chat page is closed.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MessagesSquare } from "lucide-react";
import { useToast } from "./Alerts";

export type ChatPerson = { _id: string; name: string; avatar: string; role: string };
export type ChatConversation = {
  _id: string;
  kind: "team" | "direct" | "reports";
  name: string;
  other: ChatPerson | null;
  lastMessage: { body: string; senderName: string; mine: boolean; at: string } | null;
  unread: number;
};

const POLL_MS = 15_000;

/** New-message sound: on unless turned off on the chat page (per browser). */
const SOUND_KEY = "chat-sound";
export function chatSoundOn() {
  try {
    return localStorage.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}
export function setChatSound(on: boolean) {
  try {
    localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    /* storage unavailable */
  }
}
let audio: AudioContext | null = null;
/** A short two-note chime (generated, no audio file). Browsers only allow it after the person has clicked the page once. */
export function playChatSound() {
  if (!chatSoundOn()) return;
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    for (const [freq, start] of [[880, 0], [1320, 0.12]] as const) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.exponentialRampToValueAtTime(0.12, t + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.25);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.3);
    }
  } catch {
    /* no audio */
  }
}

type ChatState = { me: string; conversations: ChatConversation[]; unread: number; loaded: boolean; refresh: () => void };
const ChatContext = createContext<ChatState>({ me: "", conversations: [], unread: 0, loaded: false, refresh: () => {} });
export const useChat = () => useContext(ChatContext);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ me: string; conversations: ChatConversation[]; unread: number; loaded: boolean }>({
    me: "",
    conversations: [],
    unread: 0,
    loaded: false,
  });
  const toast = useToast();
  const pathname = usePathname();
  const onChatPage = pathname === "/chat" || pathname.startsWith("/chat/");
  const quiet = useRef(onChatPage);
  useEffect(() => {
    quiet.current = onChatPage;
  }, [onChatPage]);
  const seen = useRef<Map<string, number> | null>(null);

  const refresh = useCallback(() => {
    fetch("/api/chat", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { me: string; conversations: ChatConversation[]; unread: number } | null) => {
        if (!d) return;
        // Announce conversations whose unread count went up since the last poll (not on the first load): a toast and
        // the sound elsewhere; on the chat page only the sound, and not for the conversation that is open.
        if (seen.current) {
          const open = quiet.current ? new URLSearchParams(window.location.search).get("c") : null;
          let ding = false;
          for (const c of d.conversations)
            if (c.unread > (seen.current.get(c._id) ?? 0) && c.lastMessage && !c.lastMessage.mine && c._id !== open) {
              ding = true;
              if (!quiet.current)
                toast.info(
                  c.kind === "direct" ? `Message from ${c.lastMessage.senderName}` : `${c.lastMessage.senderName} in ${c.name}`,
                  c.lastMessage.body.slice(0, 140)
                );
            }
          if (ding) playChatSound();
        }
        seen.current = new Map(d.conversations.map((c) => [c._id, c.unread]));
        setState({ ...d, loaded: true });
      })
      .catch(() => {});
  }, [toast]);

  useEffect(() => {
    refresh();
    const id = setInterval(() => document.visibilityState === "visible" && refresh(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const value = useMemo(() => ({ ...state, refresh }), [state, refresh]);
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

/** Header button to the chat page, with the unread count. */
export function ChatButton() {
  const { unread } = useChat();
  return (
    <Link href="/chat" className="btn btn-ghost btn-sm btn-icon relative" title={unread ? `Chat · ${unread} unread` : "Chat"} aria-label={unread ? `Chat, ${unread} unread` : "Chat"}>
      <MessagesSquare />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] leading-none font-semibold text-white tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </Link>
  );
}
