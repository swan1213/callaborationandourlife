import { PageSkeleton } from "@/components/ui";

/** Instant placeholder while a workspace page loads (shown inside the app shell, so the menu stays put). */
export default function Loading() {
  return <PageSkeleton />;
}
