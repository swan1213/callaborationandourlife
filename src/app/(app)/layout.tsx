import { redirect } from "next/navigation";
import { after } from "next/server";
import { maybeRunInterviewSweep } from "@/lib/interviews";
import { canRequestInterviews, currentUser } from "@/lib/auth";
import AppShell from "@/components/AppShell";
import { APP_TZ, isValidTimeZone } from "@/lib/tz";
import { getDisabledPages } from "@/lib/pageAccessStore";
import type { DisabledPages, EditableRole } from "@/lib/pageAccess";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/login");
  // Interview reminders / overdue notices also run from normal traffic (throttled to once a minute).
  after(maybeRunInterviewSweep);
  const disabledPages = user.role === "admin" ? [] : ((await getDisabledPages().catch((): DisabledPages => ({})))[user.role as EditableRole] ?? []);
  return (
    <AppShell
      role={user.role}
      name={user.name}
      email={user.email}
      avatar={user.avatar ?? ""}
      mustChangePassword={!!user.mustChangePassword}
      interviewAccess={canRequestInterviews(user)}
      disabledPages={disabledPages}
      // Callers see times in their own zone (set by an admin); everyone else in the default GMT-04:00.
      timezone={user.role === "caller" && user.timezone && isValidTimeZone(user.timezone) ? user.timezone : APP_TZ}
      // Admins, users and callers pick their own zone on My Page; the interview pages open in it.
      interviewTimezone={user.role !== "bidder" && user.timezone && isValidTimeZone(user.timezone) ? user.timezone : APP_TZ}
    >
      {children}
    </AppShell>
  );
}
