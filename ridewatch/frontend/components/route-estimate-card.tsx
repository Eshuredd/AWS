import FareSummary from "./fare-summary";
import { Skeleton, Notice, Icon } from "./ui";
import { type FareEstimate, formatDistance, formatDuration, type RouteEstimate } from "@/lib/api";

export default function RouteEstimateCard({ estimate, loading, error, retry, fare }: {
  fare: { estimate: FareEstimate | null; loading: boolean; error: string; retry: () => void };
  estimate: RouteEstimate | null; loading: boolean; error: string; retry: () => void;
}) {
  return (
    <section className="journey-estimate" aria-label="Journey estimate">
      {loading && <Skeleton label={"Calculating your road route\u2026"} />}
      {error && <Notice><p>{error}</p><button type="button" className="secondary" onClick={retry}>Retry estimate</button></Notice>}

      {estimate && (
        <div className="enter">
          <div className="estimate-heading">
            <div>
              <p className="section-kicker">Trip snapshot</p>
              <h3>What to expect</h3>
            </div>
            <span className="estimate-ready"><Icon name="check" />Ready</span>
          </div>

          <dl className="metric-pair">
            <div className="metric-item">
              <span className="metric-icon"><Icon name="route" /></span>
              <div>
                <dt>Expected distance</dt>
                <dd>{formatDistance(estimate.distance_km)} km</dd>
              </div>
            </div>
            <div className="metric-item">
              <span className="metric-icon"><Icon name="clock" /></span>
              <div>
                <dt>{estimate.traffic_aware ? "Traffic-aware duration" : "Expected duration"}</dt>
                <dd>{formatDuration(estimate.duration_minutes)}</dd>
              </div>
            </div>
          </dl>
        </div>
      )}

      {fare.loading ? (
        <Skeleton label={"Calculating fare estimate\u2026"} />
      ) : fare.error ? (
        <Notice><p>{fare.error}</p><button type="button" className="secondary" onClick={fare.retry}>Retry fare estimate</button></Notice>
      ) : fare.estimate ? (
        <FareSummary estimate={fare.estimate} />
      ) : null}
    </section>
  );
}
