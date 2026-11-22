/**
 * Public URL for an R2 object. In production media is served from its own
 * origin (MEDIA_PUBLIC_URL, e.g. https://media.fucktheclubup.com) so uploads
 * can never run as the main site. Locally it falls back to the /media route.
 */
export function mediaUrl(key: string, base: string | undefined): string {
  const safe = key.split("/").map(encodeURIComponent).join("/");
  return base ? `${base.replace(/\/$/, "")}/${safe}` : `/media/${safe}`;
}
