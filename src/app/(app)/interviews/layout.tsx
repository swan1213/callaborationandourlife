import { redirect } from "next/navigation";
import { canRequestInterviews, currentUser } from "@/lib/auth";

/** Bidders whose Interview Requests page an admin switched off are sent back to Generate Resume. */
export default async function InterviewsLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user?.role === "bidder" && !canRequestInterviews(user)) redirect("/dashboard/import");
  return children;
}
