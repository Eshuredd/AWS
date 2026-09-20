"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  calculateRoute,
  estimateFare,
  createRide,
  normalizeVehicle,
  validVehicle,
  type Place,
} from "@/lib/api";
import RoutePreview from "@/components/route-preview";
import { Icon, Notice, Skeleton } from "@/components/ui";
import DestinationSearch from "@/components/destination-search";
import RouteEstimateCard from "@/components/route-estimate-card";
import { useFareEstimate } from "@/lib/use-fare-estimate";
import { useRouteEstimate } from "@/lib/use-route-estimate";
import TrustedContacts from "@/components/trusted-contacts";
import RideProviderLauncher from "@/components/ride-provider-launcher";

export default function Home() {
  const router = useRouter();
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const route = useRouteEstimate(location, destination);
  const fare = useFareEstimate(location, destination, route.estimate);
  const [vehicle, setVehicle] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [vehicleOpen, setVehicleOpen] = useState(false);
  const [progress, setProgress] = useState("Starting ride\u2026");
  const submitting = useRef(false);
  const [error, setError] = useState("");

  const ready = !!location && !!destination && !!route.estimate && !!fare.estimate;
  const vehicleValid = validVehicle(normalizeVehicle(vehicle));
  const reviewing = !!destination && !editing;

  function locate() {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is unavailable in this browser. Try a browser with location support.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      failure => {
        setLocating(false);
        setLocationError(
          failure.code === 1
            ? "Location permission was denied. Enable location access in your browser settings, then try again."
            : failure.code === 3
              ? "Finding your location took too long. Please try again."
              : "Your location is unavailable. Check your device location settings and try again."
        );
      },
      { enableHighAccuracy: false, timeout: 25000, maximumAge: 60000 }
    );
  }

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!location || !destination || !route.estimate || !fare.estimate || !ready || !vehicleValid || submitting.current) return;

    submitting.current = true;
    setBusy(true);
    setError("");

    try {
      let routeQuote = route.estimate;
      let fareQuote = fare.estimate;

      if (Date.now() >= Date.parse(routeQuote.expires_at) - 10000) {
        setProgress("Updating estimate\u2026");
        const signal = new AbortController().signal;
        routeQuote = await calculateRoute(location, destination, signal);
        fareQuote = await estimateFare(location, destination, routeQuote, signal);
      }

      setProgress("Starting ride\u2026");
      const ride = await createRide({
        start_lat: location.latitude,
        start_lng: location.longitude,
        destination: destination.label,
        destination_lat: destination.latitude,
        destination_lng: destination.longitude,
        expected_distance_km: routeQuote.distance_km,
        expected_duration_minutes: routeQuote.duration_minutes,
        route_estimate_id: routeQuote.route_estimate_id,
        fare_estimate_id: fareQuote.estimate_id,
        vehicle_number: normalizeVehicle(vehicle) || null,
      });
      router.push(`/ride/${ride.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start ride.");
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <main id="main" className="workspace" tabIndex={-1}>
      <div className={`context ${reviewing ? "review-context" : "intro"}`}>
        <div className="context-heading">
          <div>
            <p className="eyebrow">{reviewing ? "Before you go" : "Plan your ride"}</p>
            <h1>{reviewing ? "Review your ride" : "Where are you heading?"}</h1>
          </div>
          <nav className="flow-steps" aria-label="Ride setup progress">
            <span className={!reviewing ? "flow-step current" : "flow-step done"} aria-current={!reviewing ? "step" : undefined}>
              <b>1</b><span>Plan</span>
            </span>
            <span className={reviewing ? "flow-step current" : "flow-step"} aria-current={reviewing ? "step" : undefined}>
              <b>2</b><span>Review</span>
            </span>
            <span className="flow-step"><b>3</b><span>Ride</span></span>
          </nav>
        </div>

        {reviewing ? (
          route.estimate ? <RoutePreview route={route.estimate} /> : <Skeleton label={route.error ? "Your route needs another try." : "Finding the way\u2026"} />
        ) : (
          <>
            <p className="support intro-copy">Confirm your location, then choose a destination.</p>
            <div className="trust-note">
              <span className="trust-note-icon"><Icon name="shield" /></span>
              <p><strong>Simple by design.</strong><span>Route checks begin when you start the ride.</span></p>
            </div>
          </>
        )}
      </div>

      <form onSubmit={start} className="sheet stack" aria-label="Prepare your ride">
        <span className="sheet-handle" aria-hidden="true" />

        {reviewing && (
          <div className="selection-summary enter">
            <div className="selected-journey">
              <span className="selected-journey-marker" aria-hidden="true"><Icon name="location" /></span>
              <div>
                <p className="support">From your current location</p>
                <h2>{destination.label}</h2>
              </div>
            </div>
            <button type="button" className="text-button compact" disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          </div>
        )}

        <div hidden={reviewing}>
          <div className="journey-fields">
            <div className="journey-stop">
              <p className="field-label">Current location</p>
              {location ? (
                <div className="pickup-row">
                  <p className="pickup-value" role="status"><span className="pickup-check"><Icon name="check" /></span>Location confirmed</p>
                  <button type="button" className="text-button compact" onClick={locate} disabled={locating || busy}>{locating ? "Finding..." : "Refresh"}</button>
                </div>
              ) : (
                <>
                  <p className="support">Find destinations near your pickup.</p>
                  <button type="button" onClick={locate} disabled={locating || busy} className="primary wide location-button">
                    <Icon name="location" />{locating ? "Finding location..." : "Use my location"}
                  </button>
                </>
              )}
              {locationError && <div className="help"><Notice>{locationError}</Notice></div>}
            </div>

            <div className="journey-stop">
              <DestinationSearch
                location={location}
                selected={destination}
                onSelect={place => {
                  setDestination(place);
                  if (place) {
                    setEditing(false);
                    document.getElementById("destination")?.blur();
                  }
                }}
                disabled={busy || locating}
              />
            </div>
          </div>
          {editing && destination && <button type="button" className="text-button wide" onClick={() => setEditing(false)}>Back to estimate</button>}
        </div>

        {reviewing && (
          <div className="review-panel">
            <RouteEstimateCard fare={fare} estimate={route.estimate} loading={route.loading} error={route.error} retry={route.retry} />

            {location && destination && route.estimate && fare.estimate && (
              <RideProviderLauncher start={location} destination={destination} />
            )}

            {route.estimate && (
              <details className="vehicle-details" open={vehicleOpen || !vehicleValid} onToggle={event => setVehicleOpen(event.currentTarget.open)}>
                <summary>
                  <span className="summary-label"><span className="summary-icon"><Icon name="car" /></span>{vehicle && vehicleValid ? "Vehicle number added" : "Add vehicle number"}</span>
                  <span className="summary-meta">Optional</span>
                </summary>
                <div className="disclosure-content vehicle-content">
                  <div>
                    <label htmlFor="vehicle">Vehicle number</label>
                    <input
                      id="vehicle"
                      placeholder="TS 09 AB 1234"
                      value={vehicle}
                      onChange={event => setVehicle(event.target.value.toUpperCase())}
                      onBlur={() => setVehicle(normalizeVehicle(vehicle))}
                      maxLength={30}
                      aria-invalid={!vehicleValid}
                      aria-describedby="vehicle-help"
                      disabled={busy}
                    />
                    <p id="vehicle-help" className={`help ${vehicleValid ? "" : "error-text"}`}>
                      {!vehicleValid
                        ? "Check the number, e.g. TS 09 AB 1234 or 22 BH 1234 AA."
                        : vehicle
                          ? <span className="accepted"><Icon name="check" />Number ready</span>
                          : "Add the number plate if you have it handy."}
                    </p>
                  </div>
                </div>
              </details>
            )}

            {route.estimate && <details className="vehicle-details trusted-details">
              <summary><span className="summary-label"><span className="summary-icon"><Icon name="shield" /></span>Trusted contacts</span><span className="summary-meta">Optional</span></summary>
              <div className="disclosure-content"><TrustedContacts /><Link className="text-button manage-contacts-link" href="/trusted-contacts">Manage trusted contacts</Link></div>
            </details>}

            {error && (
              <Notice>
                <p>{error}</p>
                <button type="button" className="secondary" onClick={() => { setError(""); route.retry(); }}>Refresh route and fare</button>
              </Notice>
            )}

            <div className="action-dock">
              <button className="primary start-button" disabled={!ready || !vehicleValid || busy || locating}>
                <span>{busy ? progress : "Start ride"}</span>
                {!busy && <span className="button-arrow" aria-hidden="true">-&gt;</span>}
              </button>
              <p className="help" role="status">
                {busy
                  ? "Keep this page open."
                  : !vehicleValid
                    ? "Check the vehicle number to continue."
                    : !ready
                      ? "Waiting for route and fare estimates."
                      : "Starting location saved when you start."}
              </p>
            </div>
          </div>
        )}

        {!reviewing && <p className="support sheet-footnote">Location checks begin when you start your ride.</p>}
      </form>
    </main>
  );
}
