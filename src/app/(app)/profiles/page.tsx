"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { Alert, api, PageHeader, CardSkeleton, EmptyState, Skeleton, useAsync } from "@/components/ui";
import ProfileDetails, { type ProfileDetail } from "@/components/ProfileDetails";
import { useRole } from "@/components/AppShell";

type Opt = { id: string; label: string; fullName: string };

export default function MyProfilesPage() {
  const isBidder = useRole() === "bidder";
  const list = useAsync(() => api<{ profiles: Opt[] }>("/api/profiles").then((r) => r.profiles), []);
  const [selected, setSelected] = useState("");
  useEffect(() => {
    if (!selected && list.data?.length) setSelected(list.data[0].id);
  }, [list.data, selected]);
  const detail = useAsync(
    () => (selected ? api<{ profile: ProfileDetail }>(`/api/profiles/${selected}`).then((r) => r.profile) : Promise.resolve(null)),
    [selected]
  );

  const p = detail.data;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title={isBidder ? "View profile's information" : "My profiles"} subtitle="Read-only details of the profiles assigned to you. Use them to fill in application forms." />
      {list.error && (
        <div className="mb-4">
          <Alert>{list.error}</Alert>
        </div>
      )}
      {list.loading ? (
        <div className="space-y-6">
          <Skeleton className="h-8 w-80 max-w-full rounded-lg" />
          <CardSkeleton lines={6} />
        </div>
      ) : !list.data?.length ? (
        <div className="card p-0">
          <EmptyState icon={UserRound} title="No profiles yet" description="No profiles are assigned to you yet." />
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <span className="text-[13px] font-medium text-slate-500">Profile</span>
            <div role="group" aria-label="Profile" className="segmented max-w-full flex-wrap">
              {list.data.map((o) => (
                <button key={o.id} type="button" aria-pressed={o.id === selected} onClick={() => setSelected(o.id)} title={o.fullName}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          {detail.error && (
            <div className="mb-4">
              <Alert>{detail.error}</Alert>
            </div>
          )}
          {detail.loading && !p ? <CardSkeleton lines={6} /> : p && <ProfileDetails p={p} />}
        </>
      )}
    </div>
  );
}
