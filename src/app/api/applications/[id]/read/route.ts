import { NextResponse } from "next/server";
import { canManageProfile, handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { markUnviewed, markViewed } from "@/lib/appViews";
import { oid } from "@/lib/query";

/** POST { read: boolean } — toggle the current viewer's read state for an application. */
export const POST = handler(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const app = await Application.findById(oid((await params).id)).select("user profile deletedByUser").lean();
  const isOwner = app && String(app.user) === String(user._id) && !app.deletedByUser;
  const isManager = app && user.role === "user" && canManageProfile(user, app.profile);
  if (!app || (!isOwner && !isManager && user.role !== "admin")) throw new HttpError(404, "Application not found");
  const { read } = await req.json().catch(() => ({ read: true }));
  if (read === false) await markUnviewed(user._id, app._id);
  else await markViewed(user._id, app._id);
  return NextResponse.json({ ok: true, read: read !== false });
});
