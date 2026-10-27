"use client";

// One conversation on the chat page: messages (replies, images, @mentions, reactions, edits, read receipts, job link
// cards, daily report cards), the pinned bar, search, "is typing" and the composer. Polls GET /api/chat/[id] every few seconds.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  AtSign,
  Briefcase,
  ChevronRight,
  ClipboardList,
  Copy,
  Hash,
  ImagePlus,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Reply,
  Search,
  SendHorizontal,
  SmilePlus,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useConfirm, useToast } from "@/components/Alerts";
import { ActionMenu, type ActionItem } from "@/components/ActionMenu";
import { useRole } from "@/components/AppShell";
import { Avatar } from "@/components/Avatar";
import { playChatSound, type ChatPerson } from "@/components/Chat";
import { EmojiPicker } from "@/components/EmojiPicker";
import Lightbox, { type Slide } from "@/components/Lightbox";
import { PresenceAvatar, PresenceLabel, usePresence } from "@/components/Presence";
import { api, fmtDate, fmtDateTime, Spinner } from "@/components/ui";
import { isEmojiOnly } from "@/lib/emoji";
import { fmtMinutes, isEmptyReport, OUTCOME_LABEL, type WorkReport } from "@/lib/workReport";

type Reaction = { emoji: string; users: { _id: string; name: string }[] };
type Img = { url: string; width: number | null; height: number | null };
export type Msg = {
  _id: string;
  sender: string;
  senderName: string;
  body: string;
  images: Img[];
  replyTo: { _id: string; senderName: string; body: string; image: boolean } | null;
  mentions: { _id: string; name: string }[];
  /** A member's automatic daily report (Daily reports chat). */
  report: WorkReport | null;
  reactions: Reaction[];
  edited: boolean;
  deleted: boolean;
  createdAt: string;
};
/** How far someone else has read the conversation. */
type Reader = { user: string; name: string; avatar: string; at: string };
type PinRow = { _id: string; body: string; senderName: string; pinnedBy: string; pinnedAt: string };
type LinkInfo = Record<string, { company: string; jobTitle: string }>;
type Thread = {
  conversation: { _id: string; kind: "team" | "direct" | "reports"; name: string; other: ChatPerson | null; pinned: PinRow[] };
  messages: Msg[];
  hasMore: boolean;
  now: string;
  reads: Reader[];
  typing: string[];
  links: LinkInfo;
};
type Pending = { url: string; publicId: string; width: number; height: number };

const POLL_MS = 3000;
const MAX_MESSAGE = 4000;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const EDIT_WINDOW_MS = 15 * 60_000;
const TYPING_PING_MS = 3000;
/** One-click reactions at the top of the reaction picker. */
const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "😮", "😢", "🙏"];
const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };
const URL_RE = /(https?:\/\/[^\s<>"]+)/g;
/** Cloudinary resize (other URLs unchanged). */
const sized = (url: string, t: string) => (url.includes("/upload/") ? url.replace("/upload/", `/upload/${t}/`) : url);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function ThreadView({ id, me, onRead, onBack }: { id: string; me: string; onRead: () => void; onBack: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const role = useRole();
  const router = useRouter();
  const { byId, people } = usePresence();
  const [thread, setThread] = useState<Thread | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [editing, setEditing] = useState<Msg | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [uploading, setUploading] = useState(0);
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const [viewer, setViewer] = useState<{ slides: Slide[]; start: number } | null>(null);
  const [highlight, setHighlight] = useState("");
  const [pinIdx, setPinIdx] = useState(0);
  const [searching, setSearching] = useState(false);
  const [posting, setPosting] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Scroll to the bottom after the next render (first load, sent message, or new ones while at the bottom).
  const stick = useRef(true);
  // Keeps the view in place when older messages are added above.
  const keepFrom = useRef<number | null>(null);
  // Server time of the last load or poll: the next poll also asks for messages that changed since then.
  const since = useRef("");
  const threadRef = useRef<Thread | null>(null);
  threadRef.current = thread;
  const lastPing = useRef(0);

  // New messages are added; ones already shown are replaced when they changed (reactions, edits, deletion).
  const merge = useCallback((incoming: Msg[], where: "end" | "start") => {
    setThread((t) => {
      if (!t) return t;
      const byMsg = new Map(incoming.map((m) => [m._id, m]));
      let changed = false;
      const kept = t.messages.map((m) => {
        const n = byMsg.get(m._id);
        if (!n || JSON.stringify(n) === JSON.stringify(m)) return m;
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
          // Read markers, typing, pins and link details: only re-render when something changed.
          setThread((x) => {
            if (!x) return x;
            const next = { ...x, reads: t.reads, typing: t.typing, conversation: { ...x.conversation, pinned: t.conversation.pinned }, links: { ...x.links, ...t.links } };
            const key = (v: Thread) => JSON.stringify([v.reads, v.typing, v.conversation.pinned, v.links]);
            return key(next) === key(x) ? x : next;
          });
          if (fromOthers) {
            onRead();
            if (!document.hasFocus()) playChatSound();
          }
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
    const first = threadRef.current?.messages[0];
    if (!first) return false;
    setLoadingOlder(true);
    try {
      const t = await api<Thread>(`/api/chat/${id}?before=${encodeURIComponent(first.createdAt)}`);
      const el = scroller.current;
      keepFrom.current = el ? el.scrollHeight - el.scrollTop : null;
      merge(t.messages, "start");
      setThread((x) => (x ? { ...x, hasMore: t.hasMore, links: { ...x.links, ...t.links } } : x));
      return t.hasMore;
    } catch (e) {
      toast.error("Couldn't load earlier messages", (e as Error).message);
      return false;
    } finally {
      setLoadingOlder(false);
    }
  }

  /** Scrolls to a message and flashes it, loading earlier pages first when it isn't loaded yet (up to 20 pages). */
  async function jumpTo(messageId: string) {
    for (let i = 0; i < 20 && !threadRef.current?.messages.some((m) => m._id === messageId); i++) {
      if (!threadRef.current?.hasMore || !(await loadOlder())) {
        if (!threadRef.current?.messages.some((m) => m._id === messageId)) break;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    requestAnimationFrame(() => {
      const el = document.getElementById(`msg-${messageId}`);
      if (!el) return toast.warning("That message is too far back to show here.");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      setHighlight(messageId);
      setTimeout(() => setHighlight((h) => (h === messageId ? "" : h)), 1800);
    });
  }

  const growInput = () => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  function resetComposer() {
    setDraft("");
    setReplyTo(null);
    setEditing(null);
    setPending([]);
    setMentionIds(new Set());
    setMention(null);
    requestAnimationFrame(growInput);
  }

  async function send() {
    const body = draft.trim();
    if (sending || uploading || (!body && !pending.length)) return;
    setSending(true);
    try {
      if (editing) {
        const r = await api<{ message: Msg }>(`/api/chat/${id}/message`, { method: "PATCH", json: { messageId: editing._id, body } });
        merge([r.message], "end");
      } else {
        const r = await api<{ message: Msg }>(`/api/chat/${id}`, {
          method: "POST",
          json: { body, images: pending, replyTo: replyTo?._id, mentions: [...mentionIds] },
        });
        stick.current = true;
        merge([r.message], "end");
        onRead();
      }
      resetComposer();
    } catch (e) {
      toast.error(editing ? "Message not saved" : "Message not sent", (e as Error).message);
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

  async function remove(m: Msg) {
    if (!(await confirm({ title: "Delete this message?", message: "It will show as \"Message deleted\" for everyone.", confirmLabel: "Delete", danger: true }))) return;
    try {
      const r = await api<{ message: Msg }>(`/api/chat/${id}/message`, { method: "DELETE", json: { messageId: m._id } });
      merge([r.message], "end");
      if (editing?._id === m._id) resetComposer();
    } catch (e) {
      toast.error("Couldn't delete the message", (e as Error).message);
    }
  }

  async function postReports() {
    if (
      !(await confirm({
        title: "Post the reports now?",
        message: "Every member's report since the last reports is posted now. Tonight's reports then start from here.",
        confirmLabel: "Post now",
      }))
    )
      return;
    setPosting(true);
    try {
      const r = await api<{ posted: number }>("/api/chat/reports", { method: "POST" });
      stick.current = true;
      toast.success(r.posted ? `Posted ${r.posted} report${r.posted === 1 ? "" : "s"}` : "No member had activity to report");
    } catch (e) {
      toast.error("Couldn't post the reports", (e as Error).message);
    } finally {
      setPosting(false);
    }
  }

  async function pin(m: Msg | PinRow, pinned: boolean) {
    try {
      await api(`/api/chat/${id}/pin`, { method: "POST", json: { messageId: m._id, pinned } });
      const t = await api<Thread>(`/api/chat/${id}?after=${encodeURIComponent(new Date().toISOString())}`);
      setThread((x) => (x ? { ...x, conversation: { ...x.conversation, pinned: t.conversation.pinned } } : x));
      setPinIdx(0);
      toast.success(pinned ? "Pinned to the top of the team chat" : "Unpinned");
    } catch (e) {
      toast.error(pinned ? "Couldn't pin the message" : "Couldn't unpin the message", (e as Error).message);
    }
  }

  function startEdit(m: Msg) {
    setReplyTo(null);
    setPending([]);
    setEditing(m);
    setDraft(m.body);
    requestAnimationFrame(() => {
      input.current?.focus();
      growInput();
    });
  }

  function startReply(m: Msg) {
    setEditing(null);
    setReplyTo(m);
    input.current?.focus();
  }

  /** Uploads pasted, dropped or picked images straight to Cloudinary; they go out with the next message. */
  async function addImages(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || editing) return;
    const room = MAX_IMAGES - pending.length;
    if (room <= 0) return toast.warning(`At most ${MAX_IMAGES} images per message`);
    for (const file of images.slice(0, room)) {
      if (file.size > MAX_IMAGE_BYTES) {
        toast.warning(`${file.name || "Image"} is larger than 10 MB`);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        const sign = await api<{ cloudName: string; apiKey: string; timestamp: number; folder: string; signature: string }>("/api/cloudinary/sign", {
          method: "POST",
          json: { kind: "chat" },
        });
        const fd = new FormData();
        fd.append("file", file);
        fd.append("api_key", sign.apiKey);
        fd.append("timestamp", String(sign.timestamp));
        fd.append("folder", sign.folder);
        fd.append("signature", sign.signature);
        const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error?.message || "Upload failed");
        setPending((p) => [...p, { url: data.secure_url, publicId: data.public_id, width: data.width, height: data.height }].slice(0, MAX_IMAGES));
      } catch (e) {
        toast.error("Image not added", (e as Error).message);
      } finally {
        setUploading((n) => n - 1);
      }
    }
    input.current?.focus();
  }

  // @mentions (team chat): people matching what's typed after "@", plus everyone with the admin role.
  const c = thread?.conversation;
  const mentionOptions = useMemo(() => {
    if (!mention || c?.kind !== "team") return [];
    const q = mention.query.toLowerCase();
    const list: { id: string; name: string; hint: string; avatar?: string }[] = people
      .filter((p) => p._id !== me && p.name.toLowerCase().split(/\s+/).some((w) => w.startsWith(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 6)
      .map((p) => ({ id: p._id, name: p.name, hint: ROLE_LABEL[p.role] ?? p.role, avatar: p.avatar }));
    if ("admins".startsWith(q)) list.unshift({ id: "admins", name: "admins", hint: "Every admin" });
    return list;
  }, [mention, people, me, c?.kind]);

  function pickMention(o: { id: string; name: string }) {
    if (!mention) return;
    const caret = input.current?.selectionStart ?? draft.length;
    const insert = `@${o.name} `;
    const next = draft.slice(0, mention.start) + insert + draft.slice(caret);
    setDraft(next.slice(0, MAX_MESSAGE));
    if (o.id !== "admins") setMentionIds((s) => new Set(s).add(o.id));
    setMention(null);
    const at = mention.start + insert.length;
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(at, at);
    });
  }

  function onDraftChange(value: string, caret: number) {
    setDraft(value);
    growInput();
    const m = c?.kind === "team" ? /(?:^|\s)@([^\s@]{0,30})$/.exec(value.slice(0, caret)) : null;
    setMention(m ? { start: caret - m[1].length - 1, query: m[1] } : null);
    setMentionIdx(0);
    // "is typing" for the others, at most every few seconds.
    if (value.trim() && !editing && Date.now() - lastPing.current > TYPING_PING_MS) {
      lastPing.current = Date.now();
      fetch(`/api/chat/${id}/typing`, { method: "POST" }).catch(() => {});
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
      growInput();
    });
  }

  const messages = useMemo(() => thread?.messages ?? [], [thread]);
  // Read receipts: each other person is shown once, under the newest message they have read (as far as loaded).
  const seenAt = useMemo(() => {
    const at = new Map<string, Reader[]>();
    for (const r of thread?.reads ?? []) {
      const t = new Date(r.at).getTime();
      let lastRead: Msg | undefined;
      for (const m of messages) if (new Date(m.createdAt).getTime() <= t) lastRead = m;
      if (lastRead && lastRead.sender !== r.user) at.set(lastRead._id, [...(at.get(lastRead._id) ?? []), r]);
    }
    return at;
  }, [thread?.reads, messages]);

  const pins = c?.pinned ?? [];
  const pinShown = pins[Math.min(pinIdx, pins.length - 1)];
  const isAdmin = role === "admin";
  const canGenerate = role !== "caller";
  const typing = thread?.typing ?? [];

  function actionsFor(m: Msg): ActionItem[] {
    const mine = m.sender === me;
    const items: ActionItem[] = [{ label: "Reply", icon: Reply, onSelect: () => startReply(m) }];
    if (m.body) items.push({ label: "Copy text", icon: Copy, onSelect: () => navigator.clipboard.writeText(m.body).then(() => toast.success("Copied")).catch(() => {}) });
    if (mine && m.body && Date.now() - new Date(m.createdAt).getTime() < EDIT_WINDOW_MS) items.push({ label: "Edit", icon: Pencil, onSelect: () => startEdit(m) });
    if (isAdmin && c?.kind === "team") {
      const pinned = pins.some((p) => p._id === m._id);
      items.push({ label: pinned ? "Unpin" : "Pin to top", icon: pinned ? PinOff : Pin, onSelect: () => pin(m, !pinned) });
    }
    if (mine || (isAdmin && c?.kind !== "direct")) items.push("divider", { label: "Delete", icon: Trash2, danger: true, onSelect: () => remove(m) });
    return items;
  }

  return (
    <>
      <header className="relative flex h-14 shrink-0 items-center gap-2.5 border-b border-slate-200 px-3">
        <button className="btn btn-ghost btn-sm btn-icon md:hidden" onClick={onBack} aria-label="All conversations">
          <ArrowLeft />
        </button>
        {c?.kind === "team" ? (
          <>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-white">
              <Hash className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">Team chat</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Users className="size-3" /> Everyone on the team can read this
              </span>
            </span>
          </>
        ) : c?.kind === "reports" ? (
          <>
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <ClipboardList className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">Daily reports</span>
              <span className="block truncate text-xs text-slate-500">Each member&apos;s day, posted every evening · only admins see this</span>
            </span>
            <button className="btn btn-ghost btn-sm shrink-0" onClick={postReports} disabled={posting} title="Post every member's report now, covering the time since the last reports">
              {posting ? <Spinner className="size-3.5" /> : <RefreshCw />} <span className="hidden sm:inline">Post now</span>
            </button>
          </>
        ) : c?.other ? (
          <>
            <PresenceAvatar userId={c.other._id} avatar={c.other.avatar} name={c.other.name} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-slate-900">
                {c.other.name} <span className="font-normal text-slate-400">· {ROLE_LABEL[c.other.role] ?? c.other.role}</span>
              </span>
              <PresenceLabel userId={c.other._id} />
            </span>
          </>
        ) : (
          <span className="flex-1" />
        )}
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => setSearching((s) => !s)} aria-label="Search this conversation" aria-expanded={searching} title="Search">
          {searching ? <X /> : <Search />}
        </button>
        {searching && thread && <SearchPanel convId={id} onPick={(mid) => (setSearching(false), jumpTo(mid))} />}
      </header>

      {pinShown && (
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-amber-50/60 px-3 py-1.5 text-xs">
          <Pin className="size-3.5 shrink-0 text-amber-600" />
          <button type="button" className="min-w-0 flex-1 truncate text-left text-slate-700 hover:underline" onClick={() => jumpTo(pinShown._id)} title={`Pinned by ${pinShown.pinnedBy}`}>
            <span className="font-medium text-slate-900">{pinShown.senderName}: </span>
            {pinShown.body}
          </button>
          {pins.length > 1 && (
            <button type="button" className="btn btn-ghost btn-sm h-6 shrink-0 px-1.5 tabular-nums" onClick={() => setPinIdx((i) => (i + 1) % pins.length)} title="Next pinned message">
              {Math.min(pinIdx, pins.length - 1) + 1}/{pins.length} <ChevronRight className="size-3.5" />
            </button>
          )}
          {isAdmin && (
            <button type="button" className="btn btn-ghost btn-sm btn-icon size-6 shrink-0" onClick={() => pin(pinShown, false)} aria-label="Unpin" title="Unpin">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}

      <div
        ref={scroller}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
        onDragOver={(e) => e.dataTransfer.types.includes("Files") && e.preventDefault()}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          addImages(Array.from(e.dataTransfer.files));
        }}
      >
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
              <div className="py-10 text-center text-sm text-slate-500">
                {c?.kind === "team"
                  ? "No messages yet. Say hello to the team."
                  : c?.kind === "reports"
                    ? "No reports yet. Each member's report is posted here every evening (or click Post now)."
                    : `No messages yet. Say hello to ${c?.other?.name ?? "them"}.`}
</div>
            )}
            {messages.map((m, i) => {
              const prev = messages[i - 1];
              const day = fmtDate(m.createdAt);
              const newDay = !prev || fmtDate(prev.createdAt) !== day;
              // Messages from the same person within 5 minutes are grouped under one name.
              const grouped = !newDay && prev?.sender === m.sender && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              const mine = m.sender === me;
              const person = byId.get(m.sender);
              const big = !m.deleted && !m.images.length && !m.replyTo && isEmojiOnly(m.body);
              const mentionsMe = m.mentions.some((x) => x._id === me) || (isAdmin && /@admins\b/i.test(m.body));
              const urls = m.deleted ? [] : [...new Set(m.body.match(URL_RE) ?? [])].slice(0, 3);
              return (
                <Fragment key={m._id}>
                  {newDay && (
                    <div className="my-3 flex items-center gap-3 text-[11px] text-slate-400">
                      <span className="h-px flex-1 bg-slate-200" />
                      {day}
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  )}
                  <div
                    id={`msg-${m._id}`}
                    className={`flex gap-2 rounded-xl transition-colors duration-700 ${mine ? "flex-row-reverse" : ""} ${grouped ? "mt-0.5" : "mt-3"} ${highlight === m._id ? "bg-amber-100/70" : ""}`}
                  >
                    <span className="w-7 shrink-0">{!mine && !grouped && <Avatar avatar={person?.avatar} name={m.senderName} size={28} />}</span>
                    <div className={`group flex min-w-0 flex-col ${m.report ? "max-w-[calc(100%-2.25rem)]" : "max-w-[75%]"} ${mine ? "items-end" : "items-start"}`}>
                      {!grouped && (
                        <span className="mb-0.5 text-[11px] text-slate-500">
                          {!mine && <span className="font-medium text-slate-700">{m.senderName} </span>}
                          {fmtDateTime(m.createdAt).slice(11)}
                        </span>
                      )}
                      {/* Actions sit beside the bubble: shown on hover, always on touch screens. */}
                      <div className={`flex max-w-full items-center gap-1 ${mine ? "flex-row-reverse" : ""}`}>
                        {m.deleted ? (
                          <div className="rounded-2xl border border-dashed border-slate-200 px-3 py-1.5 text-[13px] text-slate-400 italic">Message deleted</div>
                        ) : m.report ? (
                          <ReportCard r={m.report} highlight={mentionsMe} />
                        ) : (
                          <div
                            className={
                              big
                                ? "min-w-0 text-4xl leading-tight"
                                : `min-w-0 rounded-2xl px-3 py-1.5 text-[13.5px] leading-relaxed break-words whitespace-pre-wrap ${
                                    mine ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-900"
                                  } ${mentionsMe && !mine ? "ring-2 ring-amber-400/70" : ""}`
                            }
                            title={fmtDateTime(m.createdAt)}
                            style={{ overflowWrap: "anywhere" }}
                          >
                            {m.replyTo && (
                              <button
                                type="button"
                                onClick={() => jumpTo(m.replyTo!._id)}
                                className={`mb-1 block w-full rounded-md border-l-2 px-2 py-0.5 text-left text-xs ${mine ? "border-white/60 bg-white/15 text-white/90" : "border-indigo-400 bg-white/70 text-slate-600"}`}
                              >
                                <span className="font-semibold">{m.replyTo.senderName}</span>
                                <span className="line-clamp-2">{m.replyTo.body || (m.replyTo.image ? "📷 Photo" : "")}</span>
                              </button>
                            )}
                            {m.images.length > 0 && (
                              <div className={`my-1 grid gap-1 ${m.images.length > 1 ? "grid-cols-2" : ""}`}>
                                {m.images.map((img, k) => (
                                  <button
                                    key={img.url}
                                    type="button"
                                    onClick={() => setViewer({ slides: m.images.map((x) => ({ url: x.url, caption: `${m.senderName} · ${fmtDateTime(m.createdAt)}` })), start: k })}
                                    className="block overflow-hidden rounded-lg bg-black/5"
                                  >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img src={sized(img.url, "c_limit,w_480,h_480")} alt="Shared image" loading="lazy" className="max-h-60 w-full object-cover" />
                                  </button>
                                ))}
                              </div>
                            )}
                            {m.body && renderText(m.body, mine, m.mentions)}
                            {m.edited && <span className={`ml-1 text-[10.5px] ${mine ? "text-white/70" : "text-slate-400"}`}>(edited)</span>}
                          </div>
                        )}
                        {!m.deleted && (
                          <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100 has-[[aria-expanded=true]]:opacity-100">
                            <button type="button" className="btn btn-ghost btn-sm btn-icon text-slate-400" onClick={() => startReply(m)} aria-label="Reply" title="Reply">
                              <Reply />
                            </button>
                            <EmojiPicker
                              onPick={(e) => react(m._id, e)}
                              quick={QUICK_REACTIONS}
                              closeOnPick
                              label="React"
                              icon={<SmilePlus />}
                              buttonClassName="btn btn-ghost btn-sm btn-icon shrink-0 text-slate-400"
                            />
                            <ActionMenu items={actionsFor(m)} label="More" />
                          </div>
                        )}
                      </div>
                      {urls.length > 0 && (
                        <div className={`mt-1 flex w-full max-w-sm flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                          {urls.map((u) => (
                            <LinkCard key={u} url={u} info={thread.links[u]} onGenerate={canGenerate ? () => router.push(`/dashboard?url=${encodeURIComponent(u)}`) : undefined} />
                          ))}
                        </div>
                      )}
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
                  {seenAt.get(m._id) && <SeenBy readers={seenAt.get(m._id)!} />}
                </Fragment>
              );
            })}
          </>
        )}
      </div>

      {typing.length > 0 && (
        <div className="shrink-0 px-4 pb-1 text-[11.5px] text-slate-500" aria-live="polite">
          <span className="inline-flex gap-0.5 align-middle">
            <span className="size-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.2s]" />
            <span className="size-1 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.1s]" />
            <span className="size-1 animate-bounce rounded-full bg-slate-400" />
          </span>{" "}
          {typing.length === 1 ? `${typing[0]} is typing…` : typing.length === 2 ? `${typing[0]} and ${typing[1]} are typing…` : "Several people are typing…"}
        </div>
      )}

      <form
        className="relative shrink-0 border-t border-slate-200 p-2.5 sm:p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        {(replyTo || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-indigo-500 bg-slate-50 px-2.5 py-1.5 text-xs">
            {editing ? <Pencil className="size-3.5 shrink-0 text-indigo-600" /> : <Reply className="size-3.5 shrink-0 text-indigo-600" />}
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {editing ? (
                <span className="font-medium text-slate-900">Editing your message</span>
              ) : (
                <>
                  Replying to <span className="font-medium text-slate-900">{replyTo!.senderName}</span>: {replyTo!.body || (replyTo!.images.length ? "📷 Photo" : "")}
                </>
              )}
            </span>
            <button type="button" className="btn btn-ghost btn-sm btn-icon size-6" onClick={resetComposer} aria-label="Cancel">
              <X className="size-3.5" />
            </button>
          </div>
        )}
        {(pending.length > 0 || uploading > 0) && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <span key={p.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sized(p.url, "c_fill,w_128,h_128")} alt="" className="size-16 rounded-lg border border-slate-200 object-cover" />
                <button
                  type="button"
                  className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-slate-900 text-white"
                  onClick={() => setPending((x) => x.filter((y) => y.url !== p.url))}
                  aria-label="Remove image"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
            {Array.from({ length: uploading }, (_, k) => (
              <span key={k} className="grid size-16 place-items-center rounded-lg border border-dashed border-slate-300">
                <Spinner className="size-4" />
              </span>
            ))}
          </div>
        )}
        {mention && mentionOptions.length > 0 && (
          <ul className="popover absolute bottom-full left-3 z-30 mb-1 w-72 overflow-hidden py-1" role="listbox" aria-label="Mention someone">
            {mentionOptions.map((o, k) => (
              <li key={o.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={k === mentionIdx}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pickMention(o)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${k === mentionIdx ? "bg-indigo-50" : "hover:bg-slate-50"}`}
                >
                  {o.id === "admins" ? (
                    <span className="grid size-6 place-items-center rounded-full bg-indigo-600 text-white">
                      <AtSign className="size-3.5" />
                    </span>
                  ) : (
                    <Avatar avatar={o.avatar} name={o.name} size={24} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-slate-900">{o.id === "admins" ? "@admins" : o.name}</span>
                  <span className="text-[11px] text-slate-400">{o.hint}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              addImages(Array.from(e.target.files ?? []));
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon h-10 shrink-0"
            onClick={() => fileInput.current?.click()}
            disabled={!thread || !!editing || pending.length >= MAX_IMAGES}
            aria-label="Add images"
            title="Add images (or paste a screenshot with Ctrl+V)"
          >
            <ImagePlus />
          </button>
          <textarea
            ref={input}
            className="input max-h-40 min-h-10 flex-1 resize-none py-2"
            rows={1}
            placeholder={
              c?.kind === "team" ? "Message the team · @ to mention" : c?.kind === "reports" ? "Comment for the other admins" : c?.other ? `Message ${c.other.name}` : "Write a message"
            }
            value={draft}
            maxLength={MAX_MESSAGE}
            disabled={!thread}
            onChange={(e) => onDraftChange(e.target.value, e.target.selectionStart)}
            onBlur={() => setMention(null)}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.some((f) => f.type.startsWith("image/"))) {
                e.preventDefault();
                addImages(files);
              }
            }}
            onKeyDown={(e) => {
              if (mention && mentionOptions.length) {
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  setMentionIdx((k) => (k + (e.key === "ArrowDown" ? 1 : mentionOptions.length - 1)) % mentionOptions.length);
                  return;
                }
                if (e.key === "Enter" || e.key === "Tab") {
                  e.preventDefault();
                  pickMention(mentionOptions[mentionIdx] ?? mentionOptions[0]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setMention(null);
                  return;
                }
              }
              if (e.key === "Escape" && (replyTo || editing)) {
                e.preventDefault();
                resetComposer();
                return;
              }
              // Up arrow in an empty box edits your last message (within 15 minutes).
              if (e.key === "ArrowUp" && !draft && !editing) {
                const mineLast = [...messages].reverse().find((m) => m.sender === me && !m.deleted && m.body);
                if (mineLast && Date.now() - new Date(mineLast.createdAt).getTime() < EDIT_WINDOW_MS) {
                  e.preventDefault();
                  startEdit(mineLast);
                  return;
                }
              }
              // Enter sends; Shift+Enter adds a line (and IME composition is left alone).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            autoFocus
          />
          <EmojiPicker onPick={insertEmoji} disabled={!thread} />
          <button type="submit" className="btn btn-primary h-10" disabled={(!draft.trim() && !pending.length) || sending || uploading > 0 || !thread} aria-label={editing ? "Save" : "Send"}>
            {sending ? <Spinner className="size-4" /> : editing ? <Pencil /> : <SendHorizontal />}
            <span className="hidden sm:inline">{editing ? "Save" : "Send"}</span>
          </button>
        </div>
      </form>

      {viewer && <Lightbox slides={viewer.slides} start={viewer.start} onClose={() => setViewer(null)} />}
    </>
  );
}

/** Message text: http(s) links clickable, @mentions highlighted. */
function renderText(text: string, mine: boolean, mentions: { _id: string; name: string }[]): ReactNode[] {
  const names = [...new Set(["admins", ...mentions.map((m) => m.name)])].sort((a, b) => b.length - a.length);
  const mentionRe = new RegExp(`(@(?:${names.map(esc).join("|")}))(?![\\w])`, "gi");
  return text.split(URL_RE).flatMap((part, i) =>
    i % 2
      ? [
          <a key={`u${i}`} href={part} target="_blank" rel="noreferrer" className={`underline underline-offset-2 ${mine ? "text-white" : "text-indigo-600"}`}>
            {part}
          </a>,
        ]
      : part.split(mentionRe).map((seg, j) =>
          j % 2 ? (
            <span key={`m${i}-${j}`} className={`rounded px-0.5 font-semibold ${mine ? "bg-white/20" : "bg-indigo-100 text-indigo-700"}`}>
              {seg}
            </span>
          ) : (
            seg
          )
        )
  );
}

/** Under a message with a job link: the role and company when someone already generated from it, and Generate. */
function LinkCard({ url, info, onGenerate }: { url: string; info?: { company: string; jobTitle: string }; onGenerate?: () => void }) {
  let host = url;
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname.replace(/\/$/, "");
  } catch {
    /* not a URL */
  }
  const title = info ? [info.jobTitle, info.company].filter(Boolean).join(" · ") : host;
  return (
    <div className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
      <Briefcase className="size-3.5 shrink-0 text-slate-400" />
      <a href={url} target="_blank" rel="noreferrer" className="min-w-0 flex-1" title={url}>
        <span className="block truncate font-medium text-slate-800">{title}</span>
        <span className="block truncate text-[11px] text-slate-400">{info ? host : path || url}</span>
      </a>
      {onGenerate && (
        <button type="button" className="btn btn-secondary btn-sm h-7 shrink-0 px-2 text-xs" onClick={onGenerate} title="Open Generate with this link">
          <Sparkles className="size-3.5" /> Generate
        </button>
      )}
    </div>
  );
}

/** Search box under the header: matches in this conversation's text and senders; picking one jumps to it. */
function SearchPanel({ convId, onPick }: { convId: string; onPick: (messageId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Msg[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setBusy(true);
    const t = setTimeout(() => {
      api<{ results: Msg[] }>(`/api/chat/${convId}/search?q=${encodeURIComponent(term)}`)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, convId]);
  const re = q.trim().length >= 2 ? new RegExp(`(${esc(q.trim())})`, "ig") : null;
  return (
    <div className="popover absolute top-full right-2 left-2 z-30 mt-1 overflow-hidden sm:left-auto sm:w-96">
      <div className="relative border-b border-slate-200 p-2">
        <Search className="pointer-events-none absolute top-1/2 left-4.5 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input h-8 pl-8" placeholder="Search messages, names or links" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {busy && !results && (
          <li className="flex justify-center py-4">
            <Spinner />
          </li>
        )}
        {results?.length === 0 && <li className="px-3 py-4 text-center text-xs text-slate-400">No messages match.</li>}
        {results?.map((m) => (
          <li key={m._id}>
            <button type="button" onClick={() => onPick(m._id)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
              <span className="flex justify-between gap-2 text-[11px] text-slate-500">
                <span className="font-medium text-slate-700">{m.senderName}</span>
                {fmtDateTime(m.createdAt)}
              </span>
              <span className="line-clamp-2 text-[13px] text-slate-800">
                {re
                  ? (m.body || (m.images.length ? "📷 Photo" : "")).split(re).map((s, k) => (k % 2 ? <mark key={k} className="rounded bg-amber-200 px-0.5 text-slate-900">{s}</mark> : s))
                  : m.body}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!results && !busy && <p className="px-3 pb-3 text-xs text-slate-400">Type at least 2 characters.</p>}
    </div>
  );
}

const when = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** A member's daily report (Daily reports chat): work time, applications per profile, interviews, links and chat. */
function ReportCard({ r, highlight }: { r: WorkReport; highlight: boolean }) {
  const [y, mo, d] = r.day.split("-").map(Number);
  const dayLabel = new Date(y, mo - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const iv = r.interviews;
  const outcomes = (Object.keys(OUTCOME_LABEL) as (keyof typeof OUTCOME_LABEL)[]).filter((k) => iv.outcomes[k]).map((k) => `${iv.outcomes[k]} ${OUTCOME_LABEL[k]}`);
  const stats: { label: string; value: number; hint?: string; detail?: string }[] = [];
  if (r.role !== "caller" || r.apps.generated || r.apps.submitted) stats.push({ label: "Generated", value: r.apps.generated }, { label: "Submitted", value: r.apps.submitted });
  if (r.apps.failed) stats.push({ label: "Not generated", value: r.apps.failed, hint: "The job description couldn't be read" });
  if (r.role === "caller" || iv.held) stats.push({ label: "Interviews held", value: iv.held });
  if (r.role === "caller" || iv.reported) stats.push({ label: "Results reported", value: iv.reported, detail: outcomes.join(", ") || undefined });
  if (iv.requested) stats.push({ label: "Interviews requested", value: iv.requested });
  if (r.linksCopied) stats.push({ label: "Links copied", value: r.linksCopied });
  if (r.chatMessages) stats.push({ label: "Chat messages", value: r.chatMessages });

  return (
    <div className={`w-[22rem] max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-[var(--surface)] text-[13px] ${highlight ? "ring-2 ring-amber-400/70" : ""}`}>
      <div className="flex items-center gap-2 border-b border-slate-200 bg-emerald-50/60 px-3 py-2">
        <ClipboardList className="size-4 shrink-0 text-emerald-600" />
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-900">Daily report · {dayLabel}</span>
        <span className="shrink-0 text-[11px] text-slate-500">{ROLE_LABEL[r.role] ?? r.role}</span>
      </div>
      {isEmptyReport(r) ? (
        <p className="px-3 py-2.5 text-slate-500">No activity recorded.</p>
      ) : (
        <div className="space-y-2.5 px-3 py-2.5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-2">
            <span className="text-slate-500">Work time</span>
            <span className="text-slate-900">
              <span className="font-semibold tabular-nums">{r.work.minutes ? fmtMinutes(r.work.minutes) : "—"}</span>
              {r.work.first && r.work.last && (
                <span className="ml-1.5 text-xs text-slate-500">
                  {clock(r.work.first)} – {clock(r.work.last)}
                </span>
              )}
            </span>
          </div>
          {stats.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {stats.map((s) => (
                <div key={s.label} className="rounded-lg bg-slate-50 px-2.5 py-1.5" title={s.hint}>
                  <div className="text-lg leading-tight font-semibold text-slate-900 tabular-nums">{s.value}</div>
                  <div className="truncate text-[11px] text-slate-500">{s.label}</div>
                  {s.detail && <div className="text-[11px] text-slate-500">{s.detail}</div>}
                </div>
              ))}
            </div>
          )}
          {r.apps.byProfile.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium text-slate-400">By profile</div>
              <ul className="space-y-0.5">
                {r.apps.byProfile.map((p) => (
                  <li key={p.label} className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <span className="min-w-0 truncate text-slate-700">{p.label}</span>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {p.generated} generated · {p.submitted} submitted
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="border-t border-slate-200 px-3 py-1.5 text-[11px] text-slate-400">
        Automatic · {when(r.from)} – {when(r.to)}
      </div>
    </div>
  );
}

/** Small avatars under the newest message each person has read (direct and team chats alike); hover for who and when. */
function SeenBy({ readers }: { readers: Reader[] }) {
  const MAX = 6;
  const title = "Seen by " + readers.map((r) => `${r.name} (${fmtDateTime(r.at).slice(11)})`).join(", ");
  return (
    <div className="mt-1 flex items-center justify-end gap-1 pr-1 text-[11px] text-slate-400" title={title}>
      <span className="flex -space-x-1">
        {readers.slice(0, MAX).map((r) => (
          <Avatar key={r.user} avatar={r.avatar} name={r.name} size={16} className="ring-2 ring-[var(--surface)]" />
        ))}
      </span>
      {readers.length > MAX && <span>+{readers.length - MAX}</span>}
    </div>
  );
}
