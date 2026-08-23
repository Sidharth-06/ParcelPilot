import { NextResponse } from "next/server";
import { SESSION_COOKIE, serializeSession } from "@/lib/auth/session";
import { ROLE_LABELS, type Role } from "@/lib/auth/rbac";

const ROLES = Object.keys(ROLE_LABELS) as Role[];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { role?: string };
  const role = body.role as Role | undefined;
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }
  const payload = {
    userId: `${role}@parcelpilot.internal`,
    role,
    displayName: ROLE_LABELS[role],
    issuedAt: Date.now(),
  };
  const res = NextResponse.json({ ok: true, displayName: payload.displayName });
  // Secure only when actually served over TLS (Vercel/prod) so plain-http
  // localhost sessions still work during development and smoke tests.
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  res.cookies.set(SESSION_COOKIE, serializeSession(payload), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 12 * 60 * 60,
    secure: proto === "https",
  });
  return res;
}
