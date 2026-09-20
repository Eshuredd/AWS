import type { Monitoring } from "./api";
export function monitoringPresentation(state: Monitoring | null, error: string, now: number) {
  const timestamp = state?.last_updated_at ? Date.parse(state.last_updated_at) : NaN;
  const fresh = Number.isFinite(timestamp) && now - timestamp <= 30000;
  const unavailable = !!error || state?.gps_status === "STALE" || state?.gps_status === "UNAVAILABLE" || (!!state?.last_updated_at && !fresh);
  const reliable = !unavailable && fresh && state?.gps_status === "GOOD";
  let headline = "Waiting for a reliable location";
  let tone = "neutral";
  if (unavailable) { headline = "Monitoring unavailable"; tone = "caution"; }
  else if (state?.gps_status === "POOR") { headline = "Location signal is weak"; tone = "caution"; }
  else if (reliable) {
    if (state?.route_status === "DEVIATED") { headline = "Away from expected route"; tone = "danger"; }
    else if (state?.route_status === "POSSIBLE_DEVIATION") { headline = "Checking a route change"; tone = "caution"; }
    else if (state?.stop_status === "PROLONGED_STOP") { headline = "Longer stop detected"; tone = "caution"; }
    else if (state?.delay_status === "DELAYED") { headline = "Taking longer than expected"; tone = "caution"; }
    else if (state?.route_status === "ON_ROUTE") { headline = "On expected route"; tone = "good"; }
  }
  const routeLabels = { UNKNOWN: "Waiting for readings", ON_ROUTE: "On expected route", POSSIBLE_DEVIATION: "Checking a route change", DEVIATED: "Away from expected route" };
  return { headline, tone, reliable, unavailable,
    route: reliable ? routeLabels[state?.route_status ?? "UNKNOWN"] : "Waiting for reliable readings",
    movement: reliable ? state?.stop_status === "PROLONGED_STOP" ? "Prolonged stop detected" : state?.stop_status === "MOVING" ? "No prolonged stop detected" : "Waiting for readings" : "Waiting for reliable readings",
    timing: error ? "Waiting for an update" : state?.delay_status === "DELAYED" ? "Significant delay detected" : state?.delay_status === "ON_TIME" ? "Within expected time" : "Waiting for readings",
  };
}
