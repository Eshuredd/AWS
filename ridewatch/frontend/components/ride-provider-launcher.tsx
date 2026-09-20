"use client";

import { useMemo } from "react";
import type { Place } from "@/lib/api";
import styles from "./ride-provider-launcher.module.css";

type Coordinates = { latitude: number; longitude: number };

function uberLink(start: Coordinates, destination: Place) {
  const clientId = process.env.NEXT_PUBLIC_UBER_CLIENT_ID?.trim();

  if (clientId) {
    const url = new URL("https://m.uber.com/looking");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("pickup", JSON.stringify({
      latitude: start.latitude,
      longitude: start.longitude,
      addressLine1: "RideWatch pickup",
      addressLine2: "Current location",
    }));
    url.searchParams.set("drop[0]", JSON.stringify({
      latitude: destination.latitude,
      longitude: destination.longitude,
      addressLine1: destination.label,
      addressLine2: destination.label,
    }));
    return url.toString();
  }

  const params = new URLSearchParams({
    "pickup[latitude]": String(start.latitude),
    "pickup[longitude]": String(start.longitude),
    "pickup[nickname]": "RideWatch pickup",
    "pickup[formatted_address]": "Current location",
    "dropoff[latitude]": String(destination.latitude),
    "dropoff[longitude]": String(destination.longitude),
    "dropoff[nickname]": destination.label,
    "dropoff[formatted_address]": destination.label,
  });

  return `uber://riderequest?${params.toString()}`;
}

function olaLink(start: Coordinates, destination: Place) {
  const token = process.env.NEXT_PUBLIC_OLA_XAPP_TOKEN?.trim();

  if (!token) {
    return { href: "https://book.olacabs.com/", routePrefilled: false };
  }

  const url = new URL("https://olawebcdn.com/assets/ola-universal-link.html");
  url.searchParams.set("utm_source", token);
  url.searchParams.set("lat", String(start.latitude));
  url.searchParams.set("lng", String(start.longitude));
  url.searchParams.set("drop_lat", String(destination.latitude));
  url.searchParams.set("drop_lng", String(destination.longitude));
  url.searchParams.set("address", "Current location");
  url.searchParams.set("drop_address", destination.label);
  url.searchParams.set("landing_page", "bk");
  url.searchParams.set("bk_act", "rn");

  return { href: url.toString(), routePrefilled: true };
}

export default function RideProviderLauncher({
  start,
  destination,
}: {
  start: Coordinates;
  destination: Place;
}) {
  const providers = useMemo(() => {
    const ola = olaLink(start, destination);

    return [
      {
        name: "Uber",
        badge: "U",
        href: uberLink(start, destination),
        description: "Pickup and destination passed from RideWatch.",
        routePrefilled: true,
      },
      {
        name: "Ola",
        badge: "O",
        href: ola.href,
        description: ola.routePrefilled
          ? "Pickup and destination passed from RideWatch."
          : "Opens Ola. Route prefill needs Ola partner access.",
        routePrefilled: ola.routePrefilled,
      },
      {
        name: "Rapido",
        badge: "R",
        href: "https://www.rapido.bike/",
        description: "Opens Rapido. Re-enter the route there.",
        routePrefilled: false,
      },
    ];
  }, [start.latitude, start.longitude, destination.latitude, destination.longitude, destination.label]);

  return (
    <details className={styles.launcher}>
      <summary className={styles.summary}>
        <span>
          <strong>Continue in a ride app</strong>
          <small>Use this RideWatch route as your booking handoff.</small>
        </span>
        <span className={styles.arrow} aria-hidden="true">→</span>
      </summary>

      <div className={styles.panel}>
        <p className={styles.route}>
          <span>Pickup</span>
          <strong>Current location</strong>
          <span>Destination</span>
          <strong>{destination.label}</strong>
        </p>

        <div className={styles.providers}>
          {providers.map(provider => (
            <a
              key={provider.name}
              className={styles.provider}
              href={provider.href}
              target={provider.href.startsWith("http") ? "_blank" : undefined}
              rel={provider.href.startsWith("http") ? "noreferrer" : undefined}
            >
              <span className={styles.badge} aria-hidden="true">{provider.badge}</span>
              <span className={styles.copy}>
                <strong>Open {provider.name}</strong>
                <small>{provider.description}</small>
              </span>
              <span
                className={provider.routePrefilled ? styles.ready : styles.manual}
                aria-label={provider.routePrefilled ? "Route prefilled" : "Manual route entry"}
              >
                {provider.routePrefilled ? "Route ready" : "Open only"}
              </span>
            </a>
          ))}
        </div>

        <p className={styles.note}>
          RideWatch does not book the ride or fetch live provider fares. Review the route and price inside the provider before confirming.
        </p>
      </div>
    </details>
  );
}
