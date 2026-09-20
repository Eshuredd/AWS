import type { RouteEstimate } from "@/lib/api";
export default function RoutePreview({ route, uncertain = false }: { route: RouteEstimate | null; uncertain?: boolean }) {
  const geometry = route?.route_geometry ?? [];
  const valid = geometry.length > 1 && geometry.every(p => Number.isFinite(p.latitude) && Number.isFinite(p.longitude));
  // Local equirectangular projection preserves proportions for a city ride.
  const latitude = valid ? geometry.reduce((sum, p) => sum + p.latitude, 0) / geometry.length : 0;
  const points = valid ? geometry.map(p => [p.longitude * Math.cos(latitude * Math.PI / 180), -p.latitude]) : [];
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const dx = Math.max(...xs) - minX, dy = Math.max(...ys) - minY;
  const scale = Math.min(360 / (dx || 1e-9), 120 / (dy || 1e-9));
  const fitted = points.map(([x, y]) => [60 + (360 - dx * scale) / 2 + (x - minX) * scale, 44 + (120 - dy * scale) / 2 + (y - minY) * scale]);
  const first = fitted[0], last = fitted.at(-1);
  return <figure className={`route-preview ${uncertain ? "uncertain" : ""}`}>
    <figcaption>Expected route <span>· schematic</span></figcaption>
    {valid && (dx > 0 || dy > 0) && first && last ? <svg viewBox="0 0 480 208" role="img" aria-label="Expected route from start to destination. Not a live position or navigation map.">
      <polyline points={fitted.map(p => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="4" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={uncertain ? "8 8" : undefined}/>
      <circle cx={first[0]} cy={first[1]} r="8" fill="var(--surface)" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      <circle cx={last[0]} cy={last[1]} r="8" fill="currentColor"/>
      <text x={first[0]} y={first[1] + 28} textAnchor="middle">Start</text><text x={last[0]} y={last[1] - 20} textAnchor="middle">Destination</text>
    </svg> : <p className="route-fallback">Route drawing unavailable.<br/>Your journey details are still available below.</p>}
  </figure>;
}
