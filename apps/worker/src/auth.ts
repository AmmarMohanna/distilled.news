import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env, Repository } from "./types";

const SESSION_COOKIE = "ln_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
type AppEnv = { Bindings: Env; Variables: { repo: Repository } };

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return toBase64Url(new Uint8Array(digest));
}

export async function createSession(secret: string, now = new Date()): Promise<string> {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        sub: "admin",
        exp: Math.floor(now.getTime() / 1000) + SESSION_TTL_SECONDS
      })
    )
  );
  const signature = await sign(payload, secret);
  return `${payload}.${signature}`;
}

export async function verifySession(token: string | undefined, secret: string, now = new Date()): Promise<boolean> {
  if (!token || !secret) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if ((await sign(payload, secret)) !== signature) return false;

  const decoded = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as { sub: string; exp: number };
  return decoded.sub === "admin" && decoded.exp > Math.floor(now.getTime() / 1000);
}

export function setSessionCookie(c: Context<AppEnv>, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: new URL(c.req.url).protocol === "https:",
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  });
}

export function clearSessionCookie(c: Context<AppEnv>): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

export function adminAuth(repoForContext: (c: Context<AppEnv>) => Repository): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const secret = c.env.ADMIN_SESSION_SECRET;
    if (!secret) {
      return c.json({ error: "ADMIN_SESSION_SECRET is not configured" }, 500);
    }

    const token = getCookie(c, SESSION_COOKIE);
    const authenticated = await verifySession(token, secret);
    if (!authenticated) {
      const headerSecret = c.req.header("x-lownoise-admin");
      if (headerSecret !== secret) return c.json({ error: "unauthorized" }, 401);
    }

    c.set("repo", repoForContext(c));
    await next();
  };
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
