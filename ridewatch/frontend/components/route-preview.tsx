import type { RouteEstimate } from "@/lib/api";

export default function RoutePreview({ route, uncertain = false }: { route: RouteEstimate | null; uncertain?: boolean }) {
  const geometry = route?.route_geometry ?? [];
  const valid = geometry.length > 1 && geometry.every(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));

  // Local equirectangular projection preserves proportions for a city ride.
  const latitude = valid ? geometry.reduce((sum, point) => sum + point.latitude, 0) / geometry.length : 0;
  const points = valid
    ? geometry.map(point => [point.longitude * Math.cos(latitude * Math.PI / 180), -point.latitude])
    : [];

  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const dx = Math.max(...xs) - minX;
  const dy = Math.max(...ys) - minY;
  const scale = Math.min(360 / (dx || 1e-9), 118 / (dy || 1e-9));
  const fitted = points.map(([x, y]) => [
    60 + (360 - dx * scale) / 2 + (x - minX) * scale,
    45 + (118 - dy * scale) / 2 + (y - minY) * scale,
  ]);
  const first = fitted[0];
  const last = fitted.at(-1);
  const polyline = fitted.map(point => point.join(",")).join(" ");

  return (
    <figure className={`route-preview ${uncertain ? "uncertain" : ""}`}>
      <div className="route-preview-head">
        <figcaption>
          <span className="route-preview-title">Expected route</span>
          <span className="route-preview-subtitle">Schematic, not live navigation</span>
        </figcaption>
        <span className="route-preview-badge">
          <span className="route-preview-badge-dot" aria-hidden="true" />
          Route plan
        </span>
      </div>

      <div className="route-canvas">
        {valid && (dx > 0 || dy > 0) && first && last ? (
          <svg viewBox="0 0 480 208" role="img" aria-label="Expected route from start to destination. Not a live position or navigation map.">
            <polyline
              className="route-track"
              points={polyline}
              fill="none"
              stroke="currentColor"
              strokeWidth="12"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <polyline
              className="route-line"
              points={polyline}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              vectorEffect="non-scaling-stroke"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={uncertain ? "8 8" : undefined}
            />
            <circle className="route-start-ring" cx={first[0]} cy={first[1]} r="12" vectorEffect="non-scaling-stroke" />
            <circle className="route-start" cx={first[0]} cy={first[1]} r="6" vectorEffect="non-scaling-stroke" />
            <circle className="route-end-ring" cx={last[0]} cy={last[1]} r="12" vectorEffect="non-scaling-stroke" />
            <circle className="route-end" cx={last[0]} cy={last[1]} r="6" vectorEffect="non-scaling-stroke" />
          </svg>
        ) : (
          <p className="route-fallback">Route drawing unavailable.<br />Your journey details are still available below.</p>
        )}
      </div>

      <div className="route-endpoints" aria-hidden="true">
        <span><i className="endpoint-start" />Start</span>
        <span><i className="endpoint-end" />Destination</span>
      </div>
    </figure>
  );
}
