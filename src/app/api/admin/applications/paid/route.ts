import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { Application } from "@/lib/models/Application";
import { oid } from "@/lib/query";

/** Admin: mark applications' fees as paid / not paid. Only submitted applications carry a fee. */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const body = await req.json();
  const ids = [...new Set(((body.ids as string[]) ?? []).map((id) => String(oid(id, "application"))))];
  if (!ids.length) throw new HttpError(400, "Select at least one application");
  if (ids.length > 5000) throw new HttpError(400, "Too many applications at once");
  const paid = body.paid !== false;

  const res = await Application.updateMany(
    { _id: { $in: ids }, status: "submitted" },
    paid ? { $set: { paid: true, paidAt: new Date(), paidBy: admin._id } } : { $set: { paid: false, paidBy: null }, $unset: { paidAt: 1 } }
  );
  const skipped = ids.length - res.matchedCount;
  return NextResponse.json({ ok: true, updated: res.modifiedCount, matched: res.matchedCount, skipped });
});
