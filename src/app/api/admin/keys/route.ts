import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { ApiKey } from "@/lib/models/ApiKey";
import { Profile } from "@/lib/models/Profile";
import { apiKeyUpdate } from "@/lib/apiKeyInput";
import { keyMonthUsage } from "@/lib/openaiKeys";

export const GET = handler(async () => {
  await requireUser("admin");
  const keys = await ApiKey.find().sort({ isDefault: -1, active: -1, label: 1 }).lean();
  const [usage, profiles] = await Promise.all([
    keyMonthUsage(keys.map((k) => k._id)),
    Profile.find({ apiKey: { $ne: null } }).select("label apiKey").lean(),
  ]);
  return NextResponse.json({
    envFallback: !!process.env.OPENAI_API_KEY,
    keys: keys.map((k) => ({
      ...k,
      usage: usage.get(String(k._id)) ?? { tokens: 0, cost: 0, generations: 0 },
      profiles: profiles.filter((p) => String(p.apiKey) === String(k._id)).map((p) => ({ id: String(p._id), label: p.label })),
    })),
  });
});

export const POST = handler(async (req: Request) => {
  await requireUser("admin");
  const data = apiKeyUpdate(await req.json(), true);
  const isFirst = !(await ApiKey.exists({}));
  if (data.isDefault || isFirst) {
    await ApiKey.updateMany({}, { isDefault: false });
    data.isDefault = true;
  }
  const key = await ApiKey.create(data);
  return NextResponse.json({ id: String(key._id) });
});
