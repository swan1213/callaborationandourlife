// Creates (or resets) the admin account from SEED_ADMIN_* env vars.
// Usage: npm run seed   (reads .env.local)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const { MONGODB_URI, MONGODB_DB, SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD, SEED_ADMIN_NAME } = process.env;
if (!MONGODB_URI || !SEED_ADMIN_EMAIL || !SEED_ADMIN_PASSWORD) {
  console.error("MONGODB_URI, SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set");
  process.exit(1);
}

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB || "tailorbid" });
const email = SEED_ADMIN_EMAIL.toLowerCase().trim();
const users = mongoose.connection.collection("users");
const now = new Date();
await users.updateOne(
  { email },
  {
    $set: {
      name: SEED_ADMIN_NAME || "Administrator",
      email,
      passwordHash: await bcrypt.hash(SEED_ADMIN_PASSWORD, 10),
      role: "admin",
      status: "approved",
      updatedAt: now,
    },
    $setOnInsert: { feePerApplication: 0, assignedProfiles: [], createdAt: now },
  },
  { upsert: true }
);
console.log(`Admin ready: ${email} (db: ${mongoose.connection.db.databaseName})`);
await mongoose.disconnect();
