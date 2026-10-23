import { Types } from "mongoose";
import { Application } from "./models/Application";
import { InterviewRequest } from "./models/InterviewRequest";
import { User } from "./models/User";
import { DESIGN_NAMES, isDesignId } from "./designs";

type AppRow = {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  profile: Types.ObjectId;
  profileLabel?: string;
  status: string;
  companyKey?: string;
  resumeDesign?: string;
  createdAt: Date;
  submittedAt?: Date;
  usage?: { costUsd?: number };
};
type IvRow = {
  _id: Types.ObjectId;
  profile: Types.ObjectId;
  profileLabel?: string;
  requestedBy: Types.ObjectId;
  application?: Types.ObjectId | null;
  companyKey?: string;
  step: number;
  report?: { outcome?: string } | null;
  createdAt: Date;
};

const DAY = 86_400_000;
/** Monday 00:00 UTC of the week containing `d` ("YYYY-MM-DD"). */
const weekOf = (d: Date) => {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
};
const rate = (n: number, of: number) => (of ? n / of : 0);

/** Funnel, breakdowns, weekly trend and AI cost for applications created between from and to (profiles in scope; null = all). */
export async function computeAnalytics(scope: Types.ObjectId[] | null, from: Date, to: Date) {
  const scoped = scope ? { profile: { $in: scope } } : {};
  const range = { $gte: from, $lte: to };

  const [apps, interviews] = await Promise.all([
    Application.find({ ...scoped, createdAt: range, status: { $ne: "not_generated" } })
      .select("user profile profileLabel status companyKey resumeDesign createdAt submittedAt usage.costUsd")
      .lean<AppRow[]>(),
    InterviewRequest.find({ ...scoped, createdAt: range, deletedAt: null, status: { $ne: "cancelled" } })
      .select("profile profileLabel requestedBy application companyKey step report.outcome createdAt")
      .lean<IvRow[]>(),
  ]);

  // Tie each interview to the application it came from: the linked one, else the same profile + company.
  const appById = new Map(apps.map((a) => [String(a._id), a]));
  const appByChain = new Map<string, AppRow>();
  for (const a of apps) if (a.companyKey) appByChain.set(`${a.profile}|${a.companyKey}`, a);
  const chainKey = (i: IvRow) => (i.application ? `app:${i.application}` : `${i.profile}|${i.companyKey ?? ""}`);
  const appOf = (i: IvRow) => (i.application && appById.get(String(i.application))) || appByChain.get(`${i.profile}|${i.companyKey ?? ""}`);

  // One "interview chain" per application (or profile + company): did it reach step 1, a follow-up, a pass?
  type Chain = { profile: string; profileLabel: string; bidder: string; design: string; followUp: boolean; passed: boolean };
  const chains = new Map<string, Chain>();
  for (const i of interviews) {
    const k = chainKey(i);
    const app = appOf(i);
    const c = chains.get(k) ?? {
      profile: String(i.profile),
      profileLabel: i.profileLabel || app?.profileLabel || "",
      // The bidder whose application led to the interview (admins often file the request on their behalf).
      bidder: String(app?.user ?? i.requestedBy),
      design: isDesignId(app?.resumeDesign) ? app!.resumeDesign! : "standard",
      followUp: false,
      passed: false,
    };
    if (i.step >= 2) c.followUp = true;
    if (i.report?.outcome === "passed") c.passed = true;
    chains.set(k, c);
  }
  const chainList = [...chains.values()];

  const submitted = apps.filter((a) => a.status === "submitted");
  const cost = apps.reduce((s, a) => s + (a.usage?.costUsd ?? 0), 0);
  const funnel = [
    { key: "generated", label: "Generated", value: apps.length },
    { key: "submitted", label: "Submitted", value: submitted.length },
    { key: "interviewed", label: "Got an interview", value: chainList.length },
    { key: "followUp", label: "Reached a follow-up", value: chainList.filter((c) => c.followUp).length },
  ];

  // Breakdowns -------------------------------------------------------------
  type Row = { id: string; name: string; generated: number; submitted: number; interviews: number; followUps: number; cost: number };
  const blank = (id: string, name: string): Row => ({ id, name, generated: 0, submitted: 0, interviews: 0, followUps: 0, cost: 0 });
  const group = (keyOfApp: (a: AppRow) => [string, string], keyOfChain: (c: Chain) => [string, string]) => {
    const m = new Map<string, Row>();
    for (const a of apps) {
      const [id, name] = keyOfApp(a);
      const r = m.get(id) ?? blank(id, name);
      r.generated++;
      if (a.status === "submitted") r.submitted++;
      r.cost += a.usage?.costUsd ?? 0;
      m.set(id, r);
    }
    for (const c of chainList) {
      const [id, name] = keyOfChain(c);
      const r = m.get(id) ?? blank(id, name);
      r.interviews++;
      if (c.followUp) r.followUps++;
      m.set(id, r);
    }
    return [...m.values()]
      .map((r) => ({ ...r, cost: Math.round(r.cost * 10000) / 10000, interviewRate: rate(r.interviews, r.submitted) }))
      .sort((a, b) => b.submitted - a.submitted || b.interviews - a.interviews);
  };

  const userIds = [...new Set([...apps.map((a) => String(a.user)), ...chainList.map((c) => c.bidder)])];
  const users = new Map((await User.find({ _id: { $in: userIds } }).select("name").lean()).map((u) => [String(u._id), u.name]));
  const designName = (id: string) => (isDesignId(id) ? DESIGN_NAMES[id] : "Standard");

  const byProfile = group(
    (a) => [String(a.profile), a.profileLabel || "(deleted profile)"],
    (c) => [c.profile, c.profileLabel || "(deleted profile)"]
  );
  const byBidder = group(
    (a) => [String(a.user), users.get(String(a.user)) ?? "(deleted user)"],
    (c) => [c.bidder, users.get(c.bidder) ?? "(deleted user)"]
  );
  const byDesign = group(
    (a) => {
      const d = isDesignId(a.resumeDesign) ? a.resumeDesign : "standard";
      return [d, designName(d)];
    },
    (c) => [c.design, designName(c.design)]
  );

  // Weekly trend (weeks start Monday, UTC) --------------------------------
  const weeks = new Map<string, { week: string; generated: number; submitted: number; interviews: number }>();
  for (let t = new Date(weekOf(from)); t <= to; t = new Date(t.getTime() + 7 * DAY)) {
    const k = t.toISOString().slice(0, 10);
    weeks.set(k, { week: k, generated: 0, submitted: 0, interviews: 0 });
  }
  const bump = (d: Date | undefined, field: "generated" | "submitted" | "interviews") => {
    const w = d && weeks.get(weekOf(new Date(d)));
    if (w) w[field]++;
  };
  for (const a of apps) {
    bump(a.createdAt, "generated");
    if (a.status === "submitted") bump(a.submittedAt ?? a.createdAt, "submitted");
  }
  for (const i of interviews) if (i.step === 1) bump(i.createdAt, "interviews");

  return {
    range: { from: from.toISOString(), to: to.toISOString() },
    totals: {
      generated: apps.length,
      submitted: submitted.length,
      interviews: chainList.length,
      followUps: chainList.filter((c) => c.followUp).length,
      passed: chainList.filter((c) => c.passed).length,
      cost: Math.round(cost * 100) / 100,
      costPerApplication: apps.length ? Math.round((cost / apps.length) * 10000) / 10000 : 0,
    },
    funnel,
    byProfile,
    byBidder,
    byDesign,
    weekly: [...weeks.values()],
  };
}

export type Analytics = Awaited<ReturnType<typeof computeAnalytics>>;
