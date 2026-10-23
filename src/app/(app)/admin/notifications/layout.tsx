import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";

export default async function AdminOnlyLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (user?.role !== "admin") redirect("/admin");
  return <>{children}</>;
}
