import { formatDate, formatDay } from "@/lib/format";

/** The dashed maize "wristband" of quick facts that opens every post. */
export function Wristband({
  postedAt,
  nightOf,
  night,
  damage,
  rideHome,
}: {
  postedAt: string;
  nightOf: string | null;
  night: string | null;
  damage: string | null;
  rideHome: string | null;
}) {
  const facts = [
    ...(nightOf ? [["Night of", formatDay(nightOf)]] : []),
    ["Posted", formatDate(postedAt)],
    ["The night", night],
    ["Damage", damage],
    ["Ride home", rideHome],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-x-5 gap-y-3 rounded-md border-2 border-dashed border-maize px-4 py-3.5 sm:gap-x-8 sm:px-5 sm:py-4">
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="mono text-maize">{label}</dt>
          <dd className="mt-0.5 text-[0.95rem] leading-snug text-ink sm:mt-1 sm:text-base">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
