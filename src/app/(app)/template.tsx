import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { canOpen, homeFor, pageFor } from "@/lib/pageAccess";
import { getDisabledPages } from "@/lib/pageAccessStore";

export default async function AppTemplate({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");

  const pathname = (await headers()).get("x-tailorbid-pathname");
  // Protected app pages must pass through the proxy before rendering.
  if (!pathname) redirect("/");
  const page = pageFor(pathname);
  const disabled = user.role === "admin" ? {} : await getDisabledPages();
  if (page && !canOpen(user.role, page.key, disabled)) {
    redirect(homeFor(user.role, disabled));
  }

  return children;
}
