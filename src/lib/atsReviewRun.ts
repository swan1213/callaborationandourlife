// Runs the AI ATS review (lib/atsReview.ts) with a resolved OpenAI key. Server only.
import { HttpError } from "./auth";
import { resumeToText } from "./assistant";
import { ATS_SYSTEM_PROMPT, parseAtsReview, reviewKey, type AtsReview } from "./atsReview";
import type { ResumeContent } from "./generate";
import { recordKeyResult, samplingFor, type ResolvedOpenAI } from "./openaiKeys";

export async function runAtsReview(
  openai: ResolvedOpenAI,
  job: { resume: ResumeContent; jobDescription: string; jobTitle?: string | null; company?: string | null }
): Promise<{ review: AtsReview; promptTokens: number; completionTokens: number }> {
  let res;
  try {
    res = await openai.client.chat.completions.create({
      model: openai.model,
      ...samplingFor(openai.model, 0.2),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: ATS_SYSTEM_PROMPT },
        {
          role: "user",
          content: `JOB TITLE: ${job.jobTitle || "(not stated)"}\nCOMPANY: ${job.company || "(not stated)"}\n\nJOB DESCRIPTION:\n${job.jobDescription.slice(0, 12000)}\n\nRESUME:\n${resumeToText(job.resume).slice(0, 14000)}`,
        },
      ],
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OpenAI request failed";
    await recordKeyResult(openai.apiKeyId, msg);
    throw new HttpError(502, `OpenAI error: ${msg}`);
  }
  await recordKeyResult(openai.apiKeyId);

  let raw: unknown;
  try {
    raw = JSON.parse(res.choices[0]?.message?.content ?? "");
  } catch {
    throw new HttpError(502, "The AI reply couldn't be read. Try again.");
  }
  return {
    review: parseAtsReview(raw, { model: openai.model, key: reviewKey(job.resume, job.jobDescription) }),
    promptTokens: res.usage?.prompt_tokens ?? 0,
    completionTokens: res.usage?.completion_tokens ?? 0,
  };
}
