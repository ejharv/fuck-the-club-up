/** A timestamp, shown as its date in Ann Arbor. */
export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Detroit",
  });
}

/** A bare YYYY-MM-DD date, shown as-is (no time-zone shift to the day before). */
export function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** True when the post went up on a later day than the night it's about. */
export function isBackdated(nightOf: string | null, publishedAt: string) {
  if (!nightOf) return false;
  const posted = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Detroit", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(publishedAt));
  return nightOf < posted;
}
