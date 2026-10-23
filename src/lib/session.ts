// Edge-safe session helpers (used by proxy.ts and server code).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "tb_session";
/** admin = full access · user = manages assigned profiles (was "manager") · bidder = generates applications · caller = conducts interviews. */
export type Role = "admin" | "user" | "bidder" | "caller";
export type SessionPayload = { uid: string; role: Role; name: string };

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET is not set");
  return new TextEncoder().encode(s);
}

export async function signSession(p: SessionPayload, expiresIn = "7d") {
  return new SignJWT(p)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(secret());
}

export async function verifySession(token?: string): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}
