import { HttpError } from "./auth";
import { encrypt, maskKey } from "./crypto";

const num = (v: unknown, name: string) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${name} must be a non-negative number`);
  return n;
};

/** Validates an admin API-key payload; only keys present in the body are returned. */
export function apiKeyUpdate(body: Record<string, unknown>, creating = false) {
  const out: Record<string, unknown> = {};
  if ("label" in body) {
    out.label = String(body.label ?? "").trim();
    if (!out.label) throw new HttpError(400, "Label is required");
  }
  if (typeof body.key === "string" && body.key.trim()) {
    const key = body.key.trim();
    if (!/^sk-[\w-]{20,}$/.test(key)) throw new HttpError(400, "That does not look like an OpenAI API key (sk-…)");
    out.keyEnc = encrypt(key);
    out.keyMask = maskKey(key);
  } else if (creating) throw new HttpError(400, "API key is required");
  if ("model" in body) out.model = String(body.model ?? "").trim() || "gpt-4o-mini";
  if ("notes" in body) out.notes = String(body.notes ?? "");
  if ("active" in body) out.active = !!body.active;
  if ("isDefault" in body) out.isDefault = !!body.isDefault;
  if ("monthlyTokenLimit" in body) {
    const n = num(body.monthlyTokenLimit, "Monthly token limit");
    if (!Number.isInteger(n)) throw new HttpError(400, "Monthly token limit must be a whole number");
    out.monthlyTokenLimit = n;
  }
  if ("inputPricePerM" in body) out.inputPricePerM = num(body.inputPricePerM, "Input price");
  if ("outputPricePerM" in body) out.outputPricePerM = num(body.outputPricePerM, "Output price");
  return out;
}
