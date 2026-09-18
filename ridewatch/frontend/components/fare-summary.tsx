import { type FareEstimate } from "@/lib/api";
const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;
export default function FareSummary({ estimate, snapshot = false }: { estimate: FareEstimate | null; snapshot?: boolean }) {
  const official = estimate?.official_meter;
  const typical = estimate?.typical_reported;
  return <div className="rounded-2xl bg-teal-50 p-4">
    <dl className="space-y-4">
      <div><dt className="text-sm text-teal-800">Official meter estimate</dt><dd className="mt-1 text-xl font-bold">{official ? money(official.minimum) : estimate && !estimate.supported ? "Outside supported area" : snapshot ? "Not recorded" : "Select a route first"}</dd></div>
      <div><dt className="text-sm text-teal-800">Typical reported fare</dt><dd className="mt-1 font-bold">{typical ? `${money(typical.minimum)}–${money(typical.maximum)}` : estimate && !estimate.supported ? "Hyderabad / Secunderabad only" : snapshot ? "Not enough data at ride start" : "Not enough local data yet"}</dd></div>
      {typical && <><div><dt className="text-sm text-teal-800">Median reported fare</dt><dd className="mt-1 font-bold">{money(typical.median)}</dd></div><div className="text-xs leading-5 text-teal-900">Based on {typical.sample_count} nearby completed rides<br/>{typical.pickup_radius_m} m matching radius · {typical.confidence.toLowerCase()} confidence</div></>}
    </dl>
    <p className="mt-4 text-xs leading-5 text-stone-600">Official estimate uses Telangana meter rules for Hyderabad / Secunderabad. Excludes waiting and luggage charges.{official?.night_applied ? " Includes the 1.5× night rate (11 pm–5 am India time)." : ""}</p>
    <p className="mt-2 text-xs leading-5 text-stone-600">Typical fare is based on fares reported by RideWatch users who travelled between nearby pickup and drop areas. It is not an official fare or a guaranteed quote.</p>
  </div>;
}
