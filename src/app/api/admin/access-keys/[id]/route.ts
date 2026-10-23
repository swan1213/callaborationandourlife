import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { AccessToken } from "@/lib/models/AccessToken";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { name } — rename a key. Admin only. */
export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const b = await req.json();
  const name = String(b.name ?? "").trim().slice(0, 100);
  if (!name) throw new HttpError(400, "Enter a name");
  const r = await AccessToken.updateOne({ _id: oid((await params).id) }, { $set: { name } });
  if (!r.matchedCount) throw new HttpError(404, "Key not found");
  return NextResponse.json({ ok: true });
});

/** DELETE — revoke a key (it stops working at once; the record stays for the audit trail). ?purge=1 removes a revoked key. */
export const DELETE = handler(async (req: Request, { params }: Ctx) => {
  const admin = await requireUser("admin");
  const token = await AccessToken.findById(oid((await params).id));
  if (!token) throw new HttpError(404, "Key not found");
  if (new URL(req.url).searchParams.get("purge") === "1") {
    if (!token.revokedAt) throw new HttpError(400, "Revoke the key before removing it");
    await token.deleteOne();
    return NextResponse.json({ ok: true, removed: true });
  }
  if (token.revokedAt) throw new HttpError(400, "Already revoked");
  token.set({ revokedAt: new Date(), revokedByName: admin.name });
  await token.save();
  return NextResponse.json({ ok: true });
});
