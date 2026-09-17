import { formatDistance, formatDuration, type RouteEstimate } from "@/lib/api";
export default function RouteEstimateCard({ estimate, loading, error, retry }: {
  estimate: RouteEstimate | null; loading: boolean; error: string; retry: () => void;
}) {
  return <section className="card" aria-live="polite">
    <div className="mb-5 flex items-center justify-between gap-2"><h2 className="text-lg font-bold">Before you go</h2><span className="rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800">Route estimate</span></div>
    {loading && <p role="status" className="py-6 text-sm text-stone-500">Calculating your road route…</p>}
    {error && <div role="alert" className="mb-5 text-sm text-red-700"><p>{error}</p><button type="button" className="secondary mt-3" onClick={retry}>Retry estimate</button></div>}
    {estimate && <><dl className="mb-5 grid grid-cols-2 gap-5"><div><dt className="text-sm text-stone-500">Expected distance</dt><dd className="mt-2 text-2xl font-bold">{formatDistance(estimate.distance_km)} <span className="text-base font-normal">km</span></dd></div><div><dt className="text-sm text-stone-500">Expected duration</dt><dd className="mt-2 text-2xl font-bold">{formatDuration(estimate.duration_minutes)}</dd></div></dl><p className="mb-5 text-xs leading-5 text-stone-500">Via Amazon Location Service. Car routing estimates may differ from an auto-rickshaw’s route. Travel time and distance are estimates, not guarantees.</p></>}
    {!estimate && !loading && !error && <div className="mb-5 rounded-2xl border border-dashed border-stone-300 px-5 py-9 text-center"><p className="text-3xl text-teal-700" aria-hidden="true">↗</p><p className="mt-3 font-semibold">A little clarity before you leave</p><p className="mt-2 text-sm leading-6 text-stone-500">Add your starting location and select a destination to see your route estimate.</p></div>}
    <dl className="rounded-2xl bg-teal-50 p-4"><dt className="text-sm text-teal-800">Estimated local auto fare</dt><dd className="mt-1 text-xl font-bold">Coming next</dd></dl>
  </section>;
}
