import OpenAI from "openai";
import type { Types } from "mongoose";
import { HttpError } from "./auth";
import { decrypt } from "./crypto";
import { ApiKey } from "./models/ApiKey";
import { Application } from "./models/Application";
import { monthStart } from "./query";

export type ResolvedOpenAI = {
  client: OpenAI;
  model: string;
  apiKeyId: Types.ObjectId | null;
  inputPricePerM: number;
  outputPricePerM: number;
};

const ENV_PRICES = { inputPricePerM: 0.4, outputPricePerM: 1.6 };

/** Tokens / estimated cost / generations per API key for the current month. */
export async function keyMonthUsage(ids?: Types.ObjectId[]) {
  const rows = await Application.aggregate<{ _id: Types.ObjectId; tokens: number; cost: number; generations: number }>([
    { $match: { createdAt: { $gte: monthStart() }, "usage.apiKey": ids ? { $in: ids } : { $ne: null } } },
    {
      $group: {
        _id: "$usage.apiKey",
        tokens: { $sum: { $add: [{ $ifNull: ["$usage.promptTokens", 0] }, { $ifNull: ["$usage.completionTokens", 0] }] } },
        cost: { $sum: { $ifNull: ["$usage.costUsd", 0] } },
        generations: { $sum: 1 },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

/**
 * Picks the OpenAI key for a profile: the profile's own key → the default key → OPENAI_API_KEY env
 * (bootstrap fallback). Stored keys always win over the env key. Enforces the key's monthly token limit.
 */
export async function resolveOpenAI(profile: { apiKey?: unknown; openaiModel?: string | null }): Promise<ResolvedOpenAI> {
  let key = profile.apiKey ? await ApiKey.findById(profile.apiKey).select("+keyEnc") : null;
  if (profile.apiKey && (!key || !key.active))
    throw new HttpError(400, "The OpenAI key assigned to this profile is disabled or missing. Ask an administrator.");
  if (!key) key = await ApiKey.findOne({ isDefault: true, active: true }).select("+keyEnc");

  if (key) {
    if (key.monthlyTokenLimit > 0) {
      const used = (await keyMonthUsage([key._id])).get(String(key._id))?.tokens ?? 0;
      if (used >= key.monthlyTokenLimit)
        throw new HttpError(429, `The OpenAI key "${key.label}" has used its monthly token limit. Ask an administrator.`);
    }
    return {
      client: new OpenAI({ apiKey: decrypt(key.keyEnc) }),
      model: profile.openaiModel || key.model || "gpt-4.1-mini",
      apiKeyId: key._id,
      inputPricePerM: key.inputPricePerM,
      outputPricePerM: key.outputPricePerM,
    };
  }

  if (process.env.OPENAI_API_KEY)
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: profile.openaiModel || "gpt-4.1-mini",
      apiKeyId: null,
      ...ENV_PRICES,
    };
  throw new HttpError(400, "No OpenAI API key is configured. Ask an administrator to add one on the API Keys page.");
}

/**
 * Sampling options for a chat request. Reasoning models (o-series, gpt-5 and later, except "-chat" models) reject a
 * temperature, so they get a low reasoning effort instead (also keeps generation inside the 60 s limit).
 */
export function samplingFor(model: string, temperature: number) {
  return /^(o\d|gpt-([5-9]|\d{2}))/i.test(model) && !/chat/i.test(model) ? { reasoning_effort: "low" as const } : { temperature };
}

export function estimateCost(r: Pick<ResolvedOpenAI, "inputPricePerM" | "outputPricePerM">, promptTokens: number, completionTokens: number) {
  return (promptTokens * r.inputPricePerM + completionTokens * r.outputPricePerM) / 1_000_000;
}

export async function recordKeyResult(id: Types.ObjectId | null, error?: string) {
  if (!id) return;
  await ApiKey.updateOne({ _id: id }, error ? { lastError: error.slice(0, 300) } : { lastUsedAt: new Date(), lastError: "" });
}
