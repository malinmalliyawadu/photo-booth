/**
 * The admin page's lock: one password, one signed cookie.
 *
 * Anybody on the booth Wi-Fi can reach the controller, and admin can
 * delete sessions and see every photo, so /admin and /api/admin sit
 * behind this. The cookie is an HMAC of a fixed label under the
 * password, so changing the password signs everyone out and nothing
 * secret is stored in the browser. Web Crypto only, because `proxy.ts`
 * runs where node:crypto may not.
 */
export const ADMIN_COOKIE = "booth_admin";

const LABEL = "booth-admin-v1";

function password(): string | null {
  const p = process.env.ADMIN_PASSWORD;
  return p && p.length > 0 && p !== "change-me" ? p : null;
}

export function adminConfigured(): boolean {
  return password() !== null;
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function expectedToken(): Promise<string | null> {
  const p = password();
  return p ? hmac(p, LABEL) : null;
}

export async function isValidToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const expected = await expectedToken();
  if (!expected || expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(attempt: string): Promise<boolean> {
  const p = password();
  if (!p) return false;
  // Compare HMACs rather than strings so length leaks nothing.
  const [a, b] = await Promise.all([hmac(p, attempt), hmac(p, p)]);
  return a === b;
}
