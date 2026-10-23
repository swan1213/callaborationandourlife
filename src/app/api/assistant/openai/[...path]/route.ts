import https from "node:https";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { HttpError } from "@/lib/auth";
import { assistantOpenAIKey } from "@/lib/assistant";

// Long prep sheets (Prepare tab) use a slow, high-effort request.
export const maxDuration = 300;

// Only the OpenAI calls the assistant makes.
const ALLOWED = [/^responses$/, /^chat\/completions$/, /^models\/[\w.:-]+$/];

// One pool of kept-open connections to OpenAI for the whole server (on globalThis, so `next dev` reloads keep it).
// Node's fetch drops an idle connection after 4 seconds, and opening a new one can cost over a second
// (measured: replies started after 2.2 s instead of 0.7 s after a pause). The assistant pings every 45 seconds
// while it is open, so a live answer always finds an open connection.
const g = globalThis as unknown as { _openaiAgent?: https.Agent };
const agent = (g._openaiAgent ??= new https.Agent({ keepAlive: true, maxSockets: 64 }));

function openai(path: string, method: string, headers: Record<string, string>, body: string | undefined, signal: AbortSignal) {
  return new Promise<IncomingMessage>((resolve, reject) => {
    const r = https.request({ host: "api.openai.com", path: `/v1/${path}`, method, headers, agent, signal }, resolve);
    r.on("error", reject);
    r.end(body);
  });
}

/** OpenAI-shaped error, so the assistant's OpenAI SDK reads the message (code "tailorbid" marks it as ours). */
const fail = (status: number, message: string) =>
  Response.json({ error: { message, type: "tailorbid", code: "tailorbid" } }, { status, headers: { "Cache-Control": "no-store" } });

/**
 * /api/assistant/openai/* — passes the local Interview Assistant's OpenAI requests through with TailorBid's key
 * (see lib/assistant.ts). Streamed replies are passed on as they arrive; closing the request cancels OpenAI's.
 * Not wrapped in handler(): the activity log would store every prompt, resume included.
 */
async function forward(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  if (!ALLOWED.some((r) => r.test(path))) return fail(404, `Not available through TailorBid: ${path}`);
  try {
    const started = Date.now();
    const apiKey = await assistantOpenAIKey(req);
    const checkMs = Date.now() - started;
    const upstream = await openai(
      path,
      req.method,
      { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: req.headers.get("accept") ?? "application/json" },
      req.method === "POST" ? await req.text() : undefined,
      req.signal
    );
    return new Response(Readable.toWeb(upstream) as ReadableStream, {
      status: upstream.statusCode ?? 502,
      headers: {
        "Content-Type": String(upstream.headers["content-type"] ?? "application/json"),
        "Cache-Control": "no-store",
        // How long TailorBid's own checks took, and OpenAI until its reply started.
        "Server-Timing": `tailorbid;dur=${checkMs}, openai;dur=${Date.now() - started - checkMs}`,
      },
    });
  } catch (e) {
    // The assistant cancelled (an early draft replaced, a new question): not an error.
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (e instanceof HttpError) return fail(e.status, e.message);
    console.error(e);
    return fail(502, "TailorBid could not reach OpenAI. Try again.");
  }
}

export { forward as GET, forward as POST };
