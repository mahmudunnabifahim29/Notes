import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { verifyFirebaseToken } from "./firebase-token";

export function authMode() { return env.AUTH_MODE === "sites" ? "sites" : "firebase"; }

export async function currentUser(): Promise<ChatGPTUser | null> {
  // Legacy hosted Sites must explicitly opt in. Independent deployments never
  // trust client-supplied oai-authenticated-user-* headers.
  if (authMode() === "sites") return getChatGPTUser();
  const h = await headers();
  const token = h.get("cookie")?.split(";").map(v => v.trim())
    .find(v => v.startsWith("na_auth="))?.slice("na_auth=".length);
  if (!token || token.length > 12000) return null;
  try { return await verifyFirebaseToken(token); } catch { return null; }
}

export async function isResearchOwner(user: ChatGPTUser | null) {
  if (!user) return false;
  if (authMode() === "firebase") {
    const email = env.RESEARCH_OWNER_EMAIL?.trim().toLowerCase();
    return !!email && user.email.toLowerCase() === email;
  }
  if (!env.DB) return false;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key='research_owner'").first<{value: string}>();
  return row?.value === user.userId;
}

export function authCookie(req: Request, token = "", expiresAt = 0) {
  const maxAge = Math.max(0, Math.min(3600, expiresAt - Math.floor(Date.now() / 1000)));
  return `na_auth=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
