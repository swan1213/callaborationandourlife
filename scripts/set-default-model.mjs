// Sets every API key's model (and its prices) to gpt-4.1-mini and clears every profile's own model, so all
// resumes and cover letters are generated with gpt-4.1-mini. Already generated applications are not touched.
// Usage: node --env-file=.env.local scripts/set-default-model.mjs
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "tailorbid" });
const db = mongoose.connection.db;
const keys = await db
  .collection("apikeys")
  .updateMany({}, { $set: { model: "gpt-4.1-mini", inputPricePerM: 0.4, outputPricePerM: 1.6 } });
console.log(`API keys: ${keys.matchedCount} found, ${keys.modifiedCount} updated to gpt-4.1-mini`);
const profiles = await db
  .collection("profiles")
  .updateMany({ openaiModel: { $nin: ["", null] } }, { $set: { openaiModel: "" } });
console.log(`Profiles: ${profiles.matchedCount} had their own model, ${profiles.modifiedCount} cleared`);
await mongoose.disconnect();
