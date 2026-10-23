import { NextResponse } from "next/server";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { AccessToken } from "@/lib/models/AccessToken";
import { newAccessKey } from "@/lib/apiAccess";

/** GET — every external API key (never the key itself). Admin only. */
export const GET = handler(async () => {
  await requireUser("admin");
  const keys = await AccessToken.find().sort({ revokedAt: 1, createdAt: -1 }).lean();
  return NextResponse.json({ keys });
});

/** POST { name, expiresInDays? } — create a key. The key is returned once; only its hash is stored. */
export const POST = handler(async (req: Request) => {
  const admin = await requireUser("admin");
  const b = await req.json();
  const name = String(b.name ?? "").trim().slice(0, 100);
  if (!name) throw new HttpError(400, "Give the key a name (e.g. what will use it)");
  const days = b.expiresInDays === undefined || b.expiresInDays === "" || b.expiresInDays === null ? 0 : Math.round(Number(b.expiresInDays));
  if (!Number.isFinite(days) || days < 0 || days > 3650) throw new HttpError(400, "Expiry must be between 0 (never) and 3650 days");
  const { key, prefix, hash } = newAccessKey();
  const doc = await AccessToken.create({
    name,
    prefix,
    hash,
    createdBy: admin._id,
    createdByName: admin.name,
    expiresAt: days ? new Date(Date.now() + days * 86400_000) : null,
  });
  return NextResponse.json({ id: String(doc._id), key, prefix, name });
});
