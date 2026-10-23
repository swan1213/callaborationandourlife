import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { homeFor } from "@/lib/pageAccess";
import { getDisabledPages } from "@/lib/pageAccessStore";

export default async function Home() {
  const user = await currentUser().catch(() => null);
  if (!user) redirect("/login");
  redirect(homeFor(user.role, user.role === "admin" ? {} : await getDisabledPages().catch(() => ({}))));
}
