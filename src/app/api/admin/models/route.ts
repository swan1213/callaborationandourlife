import { NextResponse } from "next/server";
import { handler, requireUser } from "@/lib/auth";
import { resolveOpenAI } from "@/lib/openaiKeys";

const FALLBACK = ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1", "o4-mini"];

/** Chat-capable models available to the default key (suggestions for the model pickers). */
export const GET = handler(async () => {
  await requireUser("admin");
  try {
    const { client } = await resolveOpenAI({});
    const models: string[] = [];
    for await (const m of client.models.list()) models.push(m.id);
    const chat = models
      .filter((id) => /^(gpt-|o\d|chatgpt-)/.test(id))
      .filter((id) => !/(audio|realtime|transcribe|tts|image|search|embedding|instruct)/.test(id))
      .sort();
    return NextResponse.json({ models: chat.length ? chat : FALLBACK, live: chat.length > 0 });
  } catch {
    return NextResponse.json({ models: FALLBACK, live: false });
  }
});
