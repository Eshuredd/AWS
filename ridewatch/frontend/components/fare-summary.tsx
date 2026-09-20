import { type FareEstimate } from "@/lib/api";

const money = (value: number) => `\u20B9${value.toLocaleString("en-IN")}`;

export default function FareSummary({ estimate, snapshot = false }: { estimate: FareEstimate | null; snapshot?: boolean }) {
  const official = estimate?.official_meter;
  const typical = estimate?.typical_reported;

  const typicalValue = typical
    ? `${money(typical.minimum)}\u2013${money(typical.maximum)}`
    : estimate && !estimate.supported
      ? "Hyderabad / Secunderabad only"
      : snapshot
        ? "Not enough reports at start"
        : "Not enough reports yet";

  return (
    <section className="fare-summary" aria-label="Fare estimate">
      <div className="fare-heading">
        <div>
          <p className="section-kicker">Fare context</p>
          <h3>Know the range before you go</h3>
        </div>
        <span className="fare-currency">INR</span>
      </div>

      <div className={`fare-spotlight ${typical ? "has-reports" : ""}`}>
        <p className="fare-spotlight-label">Typical reported fare</p>
        <p className={`fare-spotlight-value ${typical ? "" : "fare-spotlight-copy"}`}>{typicalValue}</p>
        {typical && (
          <p className="fare-spotlight-meta">
            Median {money(typical.median)} · {typical.sample_count} reports · {typical.confidence.toLowerCase()} confidence
          </p>
        )}
      </div>

      <dl className="fare-lines">
        <div className="fare-line">
          <dt>Official meter estimate</dt>
          <dd>
            {official
              ? money(official.minimum)
              : <span className="support">{estimate && !estimate.supported ? "Outside supported area" : snapshot ? "Not recorded" : "Unavailable"}</span>}
          </dd>
        </div>
      </dl>

      <p className="help">Estimate, not a guaranteed fare.{official?.night_applied ? " Includes 1.5x night rate." : ""}</p>

      <details>
        <summary>Estimate details</summary>
        <div className="disclosure-content">
          <p>Official estimate uses Telangana meter rules for Hyderabad / Secunderabad. Excludes waiting and luggage charges.{official?.night_applied ? " Night rate applies 11 pm-5 am India time." : ""}</p>
          {official && <p>Source: {official.source}. Effective {official.effective_from}. Meter range: {money(official.minimum)}-{money(official.maximum)}.</p>}
          <p>Typical fare comes from nearby completed rides reported by RideWatch users. It is not an official fare or a guaranteed quote.</p>
          {typical && <p>Median {money(typical.median)} · {typical.sample_count} reports · {typical.confidence.toLowerCase()} confidence.<br />Pickup radius {typical.pickup_radius_m} m; destination radius {typical.destination_radius_m} m. Source: {typical.source}.</p>}
          <p>Road estimates use Amazon Location car routing; an auto-rickshaw's route may differ. Distance and duration are estimates.</p>
        </div>
      </details>
    </section>
  );
}
