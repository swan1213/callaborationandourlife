// One-time role rename: "user" → "bidder", then "manager" → "user".
// Guarded by a flag on the settings document so it can never run twice (which would demote real users).
// Usage: node --env-file=.env.local scripts/migrate-roles.mjs
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "tailorbid" });
const db = mongoose.connection.db;
const settings = db.collection("settings");
const flag = await settings.findOne({ key: "global", rolesMigratedV2: true });
if (flag) {
  console.log("Roles already migrated; nothing to do.");
} else {
  const users = db.collection("users");
  const bidders = await users.updateMany({ role: "user" }, { $set: { role: "bidder" } });
  const managers = await users.updateMany({ role: "manager" }, { $set: { role: "user" } });
  await settings.updateOne({ key: "global" }, { $set: { rolesMigratedV2: true } }, { upsert: true });
  console.log(`Migrated: ${bidders.modifiedCount} user→bidder, ${managers.modifiedCount} manager→user`);
}
await mongoose.disconnect();
