import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { User } from "@/lib/models/User";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** One sent notification with every recipient's read status (admin). */
export const GET = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const m = await Message.findById(oid((await params).id)).lean();
  if (!m) throw new HttpError(404, "Notification not found");
  const [users, reads] = await Promise.all([
    User.find({ _id: { $in: m.recipients } }).select("name email role").lean(),
    MessageRead.find({ message: m._id }).lean(),
  ]);
  const readAt = new Map(reads.map((r) => [String(r.user), r.at]));
  const recipients = m.recipients.map((id) => {
    const u = users.find((x) => String(x._id) === String(id));
    return { _id: String(id), name: u?.name ?? "Deleted account", email: u?.email ?? "", role: u?.role ?? "", readAt: readAt.get(String(id)) ?? null };
  });
  recipients.sort((a, b) => Number(!!b.readAt) - Number(!!a.readAt) || a.name.localeCompare(b.name));
  return NextResponse.json({ message: { ...m, _id: String(m._id) }, recipients });
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const id = oid((await params).id);
  await Promise.all([Message.deleteOne({ _id: id }), MessageRead.deleteMany({ message: id })]);
  return NextResponse.json({ ok: true });
});
