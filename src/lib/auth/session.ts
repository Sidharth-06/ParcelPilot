import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Role } from "./rbac";

export const SESSION_COOKIE = "pp_session";
const TTL_MS = 12 * 60 * 60 * 1000;

export interface SessionPayload {
  userId: string;
  role: Role;
  displayName: string;
  issuedAt: number;
}

function sign(data: string): string {
  return createHmac("sha256", env().APP_SECRET).update(data).digest("base64url");
}

export function serializeSession(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    if (Date.now() - payload.issuedAt > TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Read the current session in a server component / route handler. */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return parseSession(jar.get(SESSION_COOKIE)?.value);
}
