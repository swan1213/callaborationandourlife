import { NextResponse } from "next/server";
import OpenAI from "openai";
import { handler, HttpError, requireUser } from "@/lib/auth";
import { ApiKey } from "@/lib/models/ApiKey";
import { Profile } from "@/lib/models/Profile";
import { apiKeyUpdate } from "@/lib/apiKeyInput";
import { decrypt } from "@/lib/crypto";
import { oid } from "@/lib/query";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = handler(async (req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const id = oid((await params).id);
  const data = apiKeyUpdate(await req.json());
  if (data.isDefault) await ApiKey.updateMany({ _id: { $ne: id } }, { isDefault: false });
  const key = await ApiKey.findByIdAndUpdate(id, data, { new: true });
  if (!key) throw new HttpError(404, "API key not found");
  return NextResponse.json({ ok: true });
});

/** POST = test the stored key against OpenAI. */
export const POST = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const key = await ApiKey.findById(oid((await params).id)).select("+keyEnc");
  if (!key) throw new HttpError(404, "API key not found");
  try {
    const client = new OpenAI({ apiKey: decrypt(key.keyEnc) });
    await client.models.retrieve(key.model || "gpt-4o-mini");
    key.lastError = "";
    await key.save();
    return NextResponse.json({ ok: true, message: `Key works and can access ${key.model}.` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Request failed";
    key.lastError = msg.slice(0, 300);
    await key.save();
    return NextResponse.json({ ok: false, message: msg });
  }
});

export const DELETE = handler(async (_req: Request, { params }: Ctx) => {
  await requireUser("admin");
  const id = oid((await params).id);
  const inUse = await Profile.countDocuments({ apiKey: id });
  if (inUse) throw new HttpError(409, `This key is used by ${inUse} profile(s). Reassign them or deactivate the key instead.`);
  await ApiKey.deleteOne({ _id: id });
  return NextResponse.json({ ok: true });
});
