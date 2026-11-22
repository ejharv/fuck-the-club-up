/** Only same-site paths: "/x" is fine, "//evil.com" and "/\\evil.com" are not. */
export function safePath(next: unknown, fallback = "/"): string {
  if (typeof next !== "string") return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\") || /[\u0000-\u001f]/.test(next)) return fallback;
  return next;
}
