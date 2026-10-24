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
  kind: "team" | "direct";
  name: string;
  other: ChatPerson | null;
  lastMessage: { body: string; senderName: string; mine: boolean; at: string } | null;
  unread: number;
};

const POLL_MS = 15_000;

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
        // Announce conversations whose unread count went up since the last poll (not on the first load).
        if (seen.current && !quiet.current)
          for (const c of d.conversations)
            if (c.unread > (seen.current.get(c._id) ?? 0) && c.lastMessage && !c.lastMessage.mine)
              toast.info(c.kind === "team" ? `${c.lastMessage.senderName} in Team chat` : `Message from ${c.lastMessage.senderName}`, c.lastMessage.body.slice(0, 140));
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
