"use client";

// Group chats on the chat page: the group avatar, "New group" (admins) and the members dialog (admins rename the group,
// add and remove members, or delete it; everyone else sees who is in it).
import { useState } from "react";
import { LogOut, Search, Trash2, UserMinus, UserPlus, Users } from "lucide-react";
import { useConfirm, useToast } from "@/components/Alerts";
import { PresenceAvatar, usePresence } from "@/components/Presence";
import { api, Modal, Spinner } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", caller: "Caller", bidder: "Bidder" };
const MAX_NAME = 60;

export type GroupMember = { _id: string; name: string; avatar: string; role: string };

export function GroupAvatar({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-violet-600 text-white" style={{ width: size, height: size }}>
      <Users style={{ width: size / 2, height: size / 2 }} />
    </span>
  );
}

/** Searchable list of people with checkboxes (everyone approved except `exclude`). */
function PeopleChecklist({ picked, onToggle, exclude }: { picked: Set<string>; onToggle: (id: string) => void; exclude: Set<string> }) {
  const { people } = usePresence();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = people
    .filter((p) => !exclude.has(p._id) && (!needle || p.name.toLowerCase().includes(needle) || (ROLE_LABEL[p.role] ?? p.role).toLowerCase().includes(needle)))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input className="input pl-9" placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <ul className="-mx-1 max-h-64 overflow-y-auto px-1" aria-label="People">
        {list.map((p) => (
          <li key={p._id}>
            <label className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 ${picked.has(p._id) ? "bg-indigo-50" : "hover:bg-slate-50"}`}>
              <input type="checkbox" className="size-4 rounded" checked={picked.has(p._id)} onChange={() => onToggle(p._id)} />
              <PresenceAvatar userId={p._id} avatar={p.avatar} name={p.name} size={28} />
              <span className="min-w-0 flex-1 truncate text-[13px] text-slate-900">{p.name}</span>
              <span className="shrink-0 text-[11px] text-slate-400">{ROLE_LABEL[p.role] ?? p.role}</span>
            </label>
          </li>
        ))}
        {!list.length && <li className="px-2 py-3 text-xs text-slate-400">{people.length ? "No one matches." : "Loading…"}</li>}
      </ul>
    </div>
  );
}

const toggleIn = (s: Set<string>, id: string) => {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
};

/** Admins: name the group and pick its members. */
export function CreateGroupDialog({ me, onClose, onCreated }: { me: string; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !picked.size) return;
    setBusy(true);
    try {
      const r = await api<{ _id: string }>("/api/chat/groups", { method: "POST", json: { name, members: [...picked] } });
      toast.success(`Group "${name.trim()}" created`);
      onCreated(r._id);
    } catch (err) {
      toast.error("Couldn't create the group", (err as Error).message);
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="New group">
      <form className="space-y-3" onSubmit={create}>
        <div>
          <label className="label" htmlFor="group-name">
            Group name
          </label>
          <input id="group-name" className="input" value={name} maxLength={MAX_NAME} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cameron bidders" autoFocus />
        </div>
        <div>
          <span className="label">Members</span>
          <PeopleChecklist picked={picked} onToggle={(id) => setPicked((s) => toggleIn(s, id))} exclude={new Set([me])} />
        </div>
        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-end">
          <span className="text-xs text-slate-500 sm:mr-auto">{picked.size ? `${picked.size} selected, plus you` : "Pick the members"}</span>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !name.trim() || !picked.size}>
            {busy ? <Spinner /> : <Users />} Create group
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** The members of a group; admins can rename it, add and remove members, leave or delete it. */
export function GroupDialog({
  convId,
  name,
  members,
  me,
  isAdmin,
  onClose,
  onChanged,
  onDeleted,
}: {
  convId: string;
  name: string;
  members: GroupMember[];
  me: string;
  isAdmin: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState(name);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");

  async function patch(json: object, done: string, key: string) {
    setBusy(key);
    try {
      await api(`/api/chat/${convId}/group`, { method: "PATCH", json });
      toast.success(done);
      onChanged();
      return true;
    } catch (e) {
      toast.error("Couldn't update the group", (e as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function remove(m: GroupMember) {
    const self = m._id === me;
    if (
      !(await confirm({
        title: self ? "Leave this group?" : `Remove ${m.name}?`,
        message: self ? "You won't see the group any more unless an admin adds you again." : `${m.name} won't see this group any more.`,
        confirmLabel: self ? "Leave" : "Remove",
        danger: true,
      }))
    )
      return;
    if ((await patch({ remove: [m._id] }, self ? "You left the group" : `${m.name} removed`, m._id)) && self) onDeleted();
  }

  async function deleteGroup() {
    if (!(await confirm({ title: `Delete "${name}"?`, message: "The group and all its messages are deleted for everyone. This can't be undone.", confirmLabel: "Delete group", danger: true }))) return;
    setBusy("delete");
    try {
      await api(`/api/chat/${convId}/group`, { method: "DELETE" });
      toast.success("Group deleted");
      onDeleted();
    } catch (e) {
      toast.error("Couldn't delete the group", (e as Error).message);
      setBusy("");
    }
  }

  return (
    <Modal open onClose={onClose} title={isAdmin ? "Manage group" : "Group members"}>
      <div className="space-y-4">
        {isAdmin && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== name) patch({ name: title }, "Group renamed", "name");
            }}
          >
            <input className="input flex-1" aria-label="Group name" value={title} maxLength={MAX_NAME} onChange={(e) => setTitle(e.target.value)} />
            <button className="btn btn-secondary shrink-0" disabled={!title.trim() || title.trim() === name || busy === "name"}>
              {busy === "name" && <Spinner />} Rename
            </button>
          </form>
        )}

        {adding ? (
          <div className="space-y-2">
            <PeopleChecklist picked={picked} onToggle={(id) => setPicked((s) => toggleIn(s, id))} exclude={new Set(members.map((m) => m._id))} />
            <div className="flex justify-end gap-2">
              <button type="button" className="btn btn-secondary" onClick={() => (setAdding(false), setPicked(new Set()))}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!picked.size || busy === "add"}
                onClick={async () => {
                  if (await patch({ add: [...picked] }, picked.size === 1 ? "Member added" : `${picked.size} members added`, "add")) {
                    setAdding(false);
                    setPicked(new Set());
                  }
                }}
              >
                {busy === "add" ? <Spinner /> : <UserPlus />} Add {picked.size || ""}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-500">{members.length} members</span>
              {isAdmin && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAdding(true)}>
                  <UserPlus /> Add members
                </button>
              )}
            </div>
            <ul className="-mx-1 max-h-72 overflow-y-auto px-1">
              {members.map((m) => (
                <li key={m._id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                  <PresenceAvatar userId={m._id} avatar={m.avatar} name={m.name} size={28} />
                  <span className="min-w-0 flex-1 truncate text-[13px] text-slate-900">
                    {m.name}
                    {m._id === me && <span className="text-slate-400"> (you)</span>}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">{ROLE_LABEL[m.role] ?? m.role}</span>
                  {isAdmin && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm btn-icon shrink-0 text-slate-400"
                      onClick={() => remove(m)}
                      disabled={busy === m._id}
                      aria-label={m._id === me ? "Leave the group" : `Remove ${m.name}`}
                      title={m._id === me ? "Leave the group" : "Remove from the group"}
                    >
                      {busy === m._id ? <Spinner className="size-3.5" /> : m._id === me ? <LogOut /> : <UserMinus />}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isAdmin && !adding && (
          <div className="flex justify-between border-t border-slate-200 pt-3">
            <button type="button" className="btn btn-ghost text-rose-600" onClick={deleteGroup} disabled={busy === "delete"}>
              {busy === "delete" ? <Spinner /> : <Trash2 />} Delete group
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Done
            </button>
          </div>
        )}
        {!isAdmin && <p className="text-xs text-slate-500">Only admins can add or remove members.</p>}
      </div>
    </Modal>
  );
}
