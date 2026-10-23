import { cookies } from "next/headers";
import { after, NextResponse } from "next/server";
import type { Types } from "mongoose";
import { connectDB } from "./db";
import { User, type UserDoc } from "./models/User";
import { SESSION_COOKIE, verifySession, type Role } from "./session";
import { canCallApi, governsApi } from "./pageAccess";
import { getDisabledPages } from "./pageAccessStore";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Loads the current user from the session cookie, re-checking status in the DB. */
export async function currentUser(): Promise<UserDoc | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (!session) return null;
  await connectDB();
  const user = await User.findById(session.uid);
  if (!user || user.status !== "approved") return null;
  return user;
}

export async function requireUser(role?: Role): Promise<UserDoc> {
  const user = await currentUser();
  if (!user) throw new HttpError(401, "Not signed in");
  if (role && user.role !== role) throw new HttpError(403, "Forbidden");
  return user;
}

/** Interview Requests: every non-caller role, except bidders whose access an admin switched off. */
export function canRequestInterviews(user: { role: string; interviewAccess?: boolean | null }) {
  return user.role !== "caller" && (user.role !== "bidder" || user.interviewAccess !== false);
}

/** Admin or user (the profile-manager role). */
export async function requireStaff(): Promise<UserDoc> {
  const user = await requireUser();
  if (user.role !== "admin" && user.role !== "user") throw new HttpError(403, "Forbidden");
  return user;
}

/** Profile ids a staff member may manage; null means every profile (admin). */
export function profileScope(user: UserDoc): Types.ObjectId[] | null {
  return user.role === "admin" ? null : ((user.managedProfiles ?? []) as Types.ObjectId[]);
}

export function canManageProfile(user: UserDoc, profileId: unknown) {
  const scope = profileScope(user);
  return scope === null || scope.some((p) => String(p) === String(profileId));
}

/** APIs behind pages an admin turned off for this role (Admin → Page Access) answer 403. */
async function assertApiAccess(req: Request) {
  const { pathname } = new URL(req.url);
  if (!governsApi(pathname, req.method)) return;
  const user = await currentUser();
  if (!user || canCallApi(user.role, pathname, req.method, await getDisabledPages())) return;
  throw new HttpError(403, "This page is turned off for your role. Ask an administrator for access.");
}

/**
 * Wraps a route handler so thrown HttpErrors become JSON responses,
 * and records the request in the activity log (lib/activity.ts) after the response.
 */
export function handler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    const req = args[0] instanceof Request ? args[0] : null;
    const started = Date.now();
    const body =
      req && req.method !== "GET" && req.headers.get("content-type")?.includes("application/json")
        ? await req
            .clone()
            .json()
            .catch(() => null)
        : null;
    let res: Response;
    let error: unknown;
    try {
      if (req) await assertApiAccess(req);
      res = await fn(...args);
    } catch (e) {
      error = e;
      if (e instanceof HttpError) res = NextResponse.json({ error: e.message }, { status: e.status });
      else {
        console.error(e);
        res = NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
      }
    }
    if (req) {
      const status = res;
      after(() => import("./activity").then((m) => m.logRequest(req, status, started, body, error)));
    }
    return res;
  };
}

/**
 * Like handler() but not recorded in the activity log: for requests that repeat every few seconds or minutes
 * (presence heartbeats, the Interview Assistant saving a recording), which would flood the log.
 */
export function quietHandler<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      return NextResponse.json({ error: e instanceof Error ? e.message : "Server error" }, { status: 500 });
    }
  };
}

/** `maxAge` in seconds; `null` makes a browser-session cookie that is cleared when the browser closes. */
export function setSessionCookie(res: NextResponse, token: string, maxAge: number | null = 60 * 60 * 24 * 7) {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    ...(maxAge !== null ? { maxAge } : {}),
  });
}
