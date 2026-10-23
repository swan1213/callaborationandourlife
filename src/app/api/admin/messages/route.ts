import { after, NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Message, MessageRead } from "@/lib/models/Message";
import { User } from "@/lib/models/User";
import { isOurCloudinaryUrl, SCREENSHOT_FOLDER } from "@/lib/cloudinary";
import { oid } from "@/lib/query";
import { appUrl, sendEmail } from "@/lib/email";
import { messageEmail } from "@/lib/messageEmails";

const ROLES = ["admin", "user", "bidder", "caller"];

/** Sent notifications with delivery / read counts (admin). */
export const GET = handler(async () => {
  await requireUser("admin");
  const messages = await Message.find().sort({ createdAt: -1 }).limit(500).lean();
  const reads = await MessageRead.aggregate([{ $match: { message: { $in: messages.map((m) => m._id) } } }, { $group: { _id: "$message", n: { $sum: 1 } } }]);
  const readCount = new Map(reads.map((r) => [String(r._id), r.n as number]));
  const audienceUsers = await User.find({ _id: { $in: messages.flatMap((m) => m.audience?.users ?? []) } }).select("name").lean();
  const names = new Map(audienceUsers.map((u) => [String(u._id), u.name]));
  return NextResponse.json({
    messages: messages.map((m) => ({
      _id: String(m._id),
      title: m.title,
      body: m.body,
      images: m.images,
      email: m.email,
      emailedCount: m.emailedCount,
      senderName: m.senderName,
      createdAt: m.createdAt,
      audience: { roles: m.audience?.roles ?? [], users: (m.audience?.users ?? []).map((u) => ({ _id: String(u), name: names.get(String(u)) ?? "Deleted account" })) },
      recipients: m.recipients.length,
      reads: readCount.get(String(m._id)) ?? 0,
    })),
  });
});

/** POST { title, body, roles: string[], users: string[], email: boolean, images: [{url, publicId}] } */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const b = await req.json();
  const title = String(b.title ?? "").trim().slice(0, 200);
  const body = String(b.body ?? "").trim().slice(0, 10000);
  if (!title) throw new HttpError(400, "Enter a title");
  if (!body && !(b.images ?? []).length) throw new HttpError(400, "Write a message or attach an image");

  const roles = [...new Set(((b.roles as string[]) ?? []).filter((r) => ROLES.includes(r)))];
  const userIds = [...new Set(((b.users as string[]) ?? []).map((id) => String(oid(id, "user"))))];
  if (!roles.length && !userIds.length) throw new HttpError(400, "Choose at least one group or person");

  const folder = `${SCREENSHOT_FOLDER}/${admin._id}/`;
  const images = ((b.images as { url?: string; publicId?: string }[]) ?? []).map((i) => ({ url: String(i?.url ?? ""), publicId: String(i?.publicId ?? "") }));
  if (images.length > 10) throw new HttpError(400, "Attach at most 10 images");
  if (images.some((i) => !isOurCloudinaryUrl(i.url) || !i.publicId.startsWith(folder) || !i.url.includes(`/${i.publicId}`))) throw new HttpError(400, "Invalid image");

  // Active accounts in the chosen groups plus the chosen people.
  const who: Record<string, unknown> = { status: "approved", $or: [{ role: { $in: roles } }, { _id: { $in: userIds } }] };
  const recipients = await User.find(who)
    .select("name email")
    .lean();
  if (!recipients.length) throw new HttpError(400, "No active accounts match these recipients");

  const message = await Message.create({
    title,
    body,
    images,
    audience: { roles, users: userIds },
    recipients: recipients.map((r) => r._id),
    email: !!b.email,
    sender: admin._id,
    senderName: admin.name,
  });

  if (b.email) {
    after(async () => {
      const url = `${appUrl()}/notifications?id=${message._id}`;
      const results = await Promise.all(
        recipients.map((r) => sendEmail(r.email, messageEmail({ name: r.name, title, body, images: images.map((i) => i.url), sender: admin.name, url })))
      );
      await Message.updateOne({ _id: message._id }, { $set: { emailedCount: results.filter(Boolean).length } });
    });
  }
  return NextResponse.json({ id: String(message._id), recipients: recipients.length });
});
