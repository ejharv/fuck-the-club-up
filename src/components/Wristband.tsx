import { formatDate } from "@/lib/format";

/** The dashed maize "wristband" of quick facts that opens every post. */
export function Wristband({
  postedAt,
  night,
  damage,
  rideHome,
}: {
  postedAt: string;
  night: string | null;
  damage: string | null;
  rideHome: string | null;
}) {
  const facts = [
    ["Posted", formatDate(postedAt)],
    ["The night", night],
    ["Damage", damage],
    ["Ride home", rideHome],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <dl className="grid gap-x-8 gap-y-3 rounded-md border-2 border-dashed border-maize px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt className="mono text-maize">{label}</dt>
          <dd className="mt-1 text-ink">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
