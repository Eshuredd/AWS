"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDistance, formatDuration, getRide, type Ride } from "@/lib/api";
import { forgetRecentRide, getRecentRideReferences } from "@/lib/recent-rides";
import { Icon, Notice, Skeleton } from "./ui";

type RideEntry = {
  ride: Ride;
  seenAt: string;
};

const money = (value: number) => `₹${value.toLocaleString("en-IN")}`;

function fareLabel(ride: Ride) {
  const reported = ride.fare_estimate?.typical_reported;
  if (reported) return `${money(reported.minimum)}–${money(reported.maximum)} typical`;
  const official = ride.fare_estimate?.official_meter;
  if (official) return `${money(official.minimum)} meter estimate`;
  return "Fare not recorded";
}

function rideDate(ride: Ride) {
  const date = new Date(ride.started_at);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function RecentRides() {
  const [rides, setRides] = useState<RideEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const references = getRecentRideReferences();
    if (!references.length) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    Promise.all(references.map(async reference => {
      try {
        const ride = await getRide(reference.id, controller.signal);
        return { ride, seenAt: reference.seenAt } satisfies RideEntry;
      } catch (caught) {
        if (caught instanceof Error && caught.message.includes("could not be found")) forgetRecentRide(reference.id);
        return null;
      }
    })).then(results => {
      if (controller.signal.aborted) return;
      const available = results.filter((entry): entry is RideEntry => entry !== null);
      available.sort((a, b) => Date.parse(b.ride.started_at) - Date.parse(a.ride.started_at));
      setRides(available);
      setLoading(false);
      if (!available.length && references.length) setError("Your saved ride links could not be loaded right now.");
    }).catch(() => {
      if (!controller.signal.aborted) {
        setError("Recent rides could not be loaded right now.");
        setLoading(false);
      }
    });

    return () => controller.abort();
  }, []);

  if (loading) {
    return <section className="sheet recent-rides-panel" aria-label="Recent rides"><Skeleton label="Loading recent rides…" /></section>;
  }

  if (!rides.length) {
    return (
      <section className="sheet recent-rides-panel rides-empty" aria-label="Recent rides">
        {error && <Notice>{error}</Notice>}
        <span className="rides-empty-icon" aria-hidden="true"><Icon name="route" /></span>
        <div>
          <h2>No recent rides yet</h2>
          <p className="support">Rides you start or open after this update will appear here on this device.</p>
        </div>
        <Link href="/" className="primary">Plan a ride</Link>
        <p className="fine rides-storage-note">Ride history is stored as ride links in this browser. Clearing browser storage removes this list.</p>
      </section>
    );
  }

  return (
    <section className="recent-rides-panel" aria-label="Recent rides">
      {error && <Notice>{error}</Notice>}
      <ol className="recent-rides-list">
        {rides.map(({ ride }) => (
          <li key={ride.id} className="recent-ride-card">
            <div className="recent-ride-topline">
              <span className={`ride-status-chip ${ride.status === "ACTIVE" ? "active" : "completed"}`}>
                <span aria-hidden="true" />{ride.status === "ACTIVE" ? "Active ride" : "Completed"}
              </span>
              <time dateTime={ride.started_at}>{rideDate(ride)}</time>
            </div>

            <div className="recent-ride-destination">
              <span className="recent-ride-pin" aria-hidden="true"><Icon name="location" /></span>
              <div>
                <p className="fine">Destination</p>
                <h2>{ride.destination}</h2>
              </div>
            </div>

            <dl className="recent-ride-metrics">
              <div>
                <dt>Distance</dt>
                <dd>{ride.expected_distance_km != null ? `${formatDistance(ride.expected_distance_km)} km` : "Not recorded"}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>{ride.expected_duration_minutes != null ? formatDuration(ride.expected_duration_minutes) : "Not recorded"}</dd>
              </div>
              <div>
                <dt>Fare</dt>
                <dd>{fareLabel(ride)}</dd>
              </div>
            </dl>

            <div className="recent-ride-footer">
              <p className="help">{ride.vehicle_number ? `Vehicle ${ride.vehicle_number}` : "Vehicle number not added"}</p>
              <Link className="recent-ride-link" href={`/ride/${encodeURIComponent(ride.id)}`}>
                {ride.status === "ACTIVE" ? "Resume ride" : "View ride"}<span aria-hidden="true">→</span>
              </Link>
            </div>
          </li>
        ))}
      </ol>
      <p className="fine rides-storage-note">Recent rides are remembered only on this device. RideWatch does not expose a public list of stored rides.</p>
    </section>
  );
}
