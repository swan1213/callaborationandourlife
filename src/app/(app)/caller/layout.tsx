import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function CallerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user?.role !== "caller") redirect("/");
  return children;
}
