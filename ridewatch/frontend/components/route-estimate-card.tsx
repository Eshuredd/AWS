import FareSummary from "./fare-summary";
import { Skeleton, Notice } from "./ui";
import { type FareEstimate, formatDistance, formatDuration, type RouteEstimate } from "@/lib/api";
export default function RouteEstimateCard({ estimate, loading, error, retry, fare }: {
  fare: { estimate: FareEstimate | null; loading: boolean; error: string; retry: () => void };
  estimate: RouteEstimate | null; loading: boolean; error: string; retry: () => void;
}) {
  return <section aria-label="Journey estimate">
    {loading && <Skeleton label="Calculating your road route…"/>}
    {error && <Notice><p>{error}</p><button type="button" className="secondary" onClick={retry}>Retry estimate</button></Notice>}
    {estimate && <div className="enter"><dl className="metric-pair"><div><dt>Expected distance</dt><dd>{formatDistance(estimate.distance_km)} km</dd></div><div><dt>{estimate.traffic_aware ? "Traffic-aware duration" : "Expected duration"}</dt><dd>{formatDuration(estimate.duration_minutes)}</dd></div></dl></div>}
    {fare.loading ? <Skeleton label="Calculating fare estimate…"/> : fare.error ? <Notice><p>{fare.error}</p><button type="button" className="secondary" onClick={fare.retry}>Retry fare estimate</button></Notice> : fare.estimate ? <FareSummary estimate={fare.estimate}/> : null}
  </section>;
}
