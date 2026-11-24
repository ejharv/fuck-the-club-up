import "server-only";
import { headers } from "next/headers";

/** This request's origin, so link-preview images work on workers.dev, the real domain and localhost alike. */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "fucktheclubup.com";
  return `${/^(localhost|127\.)/.test(host) ? "http" : "https"}://${host}`;
}
