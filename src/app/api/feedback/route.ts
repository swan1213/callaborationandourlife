import { after, NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Feedback } from "@/lib/models/Feedback";
import { User } from "@/lib/models/User";
import { isOurCloudinaryUrl, SCREENSHOT_FOLDER } from "@/lib/cloudinary";
import { appUrl, sendEmail } from "@/lib/email";
import { feedbackEmail } from "@/lib/messageEmails";
import { notify } from "@/lib/inbox";

const CATEGORIES = ["bug", "idea", "question", "other"];

/** Admins: all feedback (?status=), or only their own with ?mine=1. Everyone else: their own. */
export const GET = handler(async (req: Request) => {
  const user = await requireUser();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status");
  const filter: Record<string, unknown> = user.role === "admin" && sp.get("mine") !== "1" ? {} : { user: user._id };
  if (status) filter.status = status;
  const items = await Feedback.find(filter).populate("user", "name email role avatar").sort({ createdAt: -1 }).limit(1000).lean();
  const unseen = user.role === "admin" ? await Feedback.countDocuments({ seenAt: null }) : 0;
  return NextResponse.json({ items, unseen });
});

/** POST { category, subject, message, screenshots: [{url, publicId}] } */
export const POST = handler(async (req: Request) => {
  const user = await requireUser();
  const b = await req.json();
  const subject = String(b.subject ?? "").trim().slice(0, 200);
  const message = String(b.message ?? "").trim().slice(0, 10000);
  if (!subject) throw new HttpError(400, "Enter a subject");
  const category = CATEGORIES.includes(b.category) ? b.category : "other";

  const folder = `${SCREENSHOT_FOLDER}/${user._id}/`;
  const screenshots = ((b.screenshots as { url?: string; publicId?: string }[]) ?? []).map((s) => ({ url: String(s?.url ?? ""), publicId: String(s?.publicId ?? "") }));
  if (screenshots.length > 10) throw new HttpError(400, "Attach at most 10 screenshots");
  if (screenshots.some((s) => !isOurCloudinaryUrl(s.url) || !s.publicId.startsWith(folder) || !s.url.includes(`/${s.publicId}`))) throw new HttpError(400, "Invalid screenshot");

  const fb = await Feedback.create({ user: user._id, userName: user.name, userEmail: user.email, role: user.role, category, subject, message, screenshots });
  after(async () => {
    const admins = await User.find({ role: "admin", status: "approved", _id: { $ne: user._id } }).select("name email").lean();
    const url = `${appUrl()}/admin/feedback?id=${fb._id}`;
    await notify(admins, { kind: "feedback-new", title: `New ${category}: ${subject}`, body: `${user.name}: ${message.slice(0, 200)}`, url: `/admin/feedback?id=${fb._id}` });
    await Promise.all(
      admins.map((a) =>
        sendEmail(
          a.email,
          feedbackEmail({ name: a.name, from: user.name, fromEmail: user.email, role: user.role, category, subject, message, images: screenshots.map((s) => s.url), url })
        )
      )
    );
  });
  return NextResponse.json({ id: String(fb._id) });
});
