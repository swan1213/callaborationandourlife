import mongoose, { type Model, type Schema } from "mongoose";

/**
 * Registers a model once per process. In development, Next.js hot reload re-runs model files while
 * mongoose keeps the old compiled model, so schema changes (e.g. new enum values) would be ignored
 * until a restart. Recompile in dev; reuse in production.
 */
export function defineModel<T>(name: string, schema: Schema): Model<T> {
  if (process.env.NODE_ENV !== "production" && mongoose.models[name]) mongoose.deleteModel(name);
  return (mongoose.models[name] as Model<T>) || mongoose.model<T>(name, schema);
}
