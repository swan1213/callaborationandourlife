// Sets every existing profile's resume and cover letter design to ATS Clean ("ats"), the default design.
// Already generated applications keep the design they were made with.
// Usage: node --env-file=.env.local scripts/set-default-design.mjs
import mongoose from "mongoose";

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || "tailorbid" });
const res = await mongoose.connection.db
  .collection("profiles")
  .updateMany({}, { $set: { resumeDesign: "ats", coverLetterDesign: "ats" } });
console.log(`Profiles: ${res.matchedCount} found, ${res.modifiedCount} updated to ATS Clean`);
await mongoose.disconnect();
