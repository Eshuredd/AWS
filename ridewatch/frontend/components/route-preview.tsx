"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { RouteEstimate } from "@/lib/api";

type LngLat = [number, number];
type BoundsInstance = { extend: (coordinate: LngLat) => BoundsInstance };
type MapInstance = {
  on: (event: "load" | "error", listener: () => void) => void;
  addSource: (id: string, source: unknown) => void;
  addLayer: (layer: unknown) => void;
  fitBounds: (bounds: BoundsInstance, options: { padding: number; maxZoom: number; duration: number }) => void;
  remove: () => void;
};
type MarkerInstance = {
  setLngLat: (coordinate: LngLat) => MarkerInstance;
  addTo: (map: MapInstance) => MarkerInstance;
  remove: () => void;
};
type MapLibreNamespace = {
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: LngLat;
    zoom: number;
    attributionControl: boolean;
    dragRotate: boolean;
    pitchWithRotate: boolean;
    scrollZoom: boolean;
    cooperativeGestures: boolean;
  }) => MapInstance;
  Marker: new (options: { element: HTMLElement; anchor: "center" }) => MarkerInstance;
  LngLatBounds: new (southWest: LngLat, northEast: LngLat) => BoundsInstance;
};

declare global {
  interface Window {
    maplibregl?: MapLibreNamespace;
  }
}

const MAPLIBRE_VERSION = "5.7.1";
const MAPLIBRE_SCRIPT = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://unpkg.com/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";
let mapLibrePromise: Promise<MapLibreNamespace> | null = null;

function loadMapLibre(): Promise<MapLibreNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Map is only available in the browser."));
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (mapLibrePromise) return mapLibrePromise;

  mapLibrePromise = new Promise<MapLibreNamespace>((resolve, reject) => {
    if (!document.querySelector(`link[href="${MAPLIBRE_CSS}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = MAPLIBRE_CSS;
      link.dataset.ridewatchMap = "true";
      document.head.appendChild(link);
    }

    const finish = () => {
      if (window.maplibregl) resolve(window.maplibregl);
      else reject(new Error("Map library did not load."));
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${MAPLIBRE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Map library failed to load.")), { once: true });
      window.setTimeout(finish, 0);
      return;
    }

    const script = document.createElement("script");
    script.src = MAPLIBRE_SCRIPT;
    script.async = true;
    script.dataset.ridewatchMap = "true";
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Map library failed to load.")), { once: true });
    document.head.appendChild(script);
  }).catch(error => {
    mapLibrePromise = null;
    throw error;
  });

  return mapLibrePromise;
}

function marker(className: string) {
  const element = document.createElement("span");
  element.className = `route-map-marker ${className}`;
  element.setAttribute("aria-hidden", "true");
  return element;
}

function FallbackSketch({ coordinates, uncertain }: { coordinates: LngLat[]; uncertain: boolean }) {
  if (coordinates.length < 2) return <p className="route-fallback">Route drawing unavailable.<br />Your journey details are still available below.</p>;

  const latitude = coordinates.reduce((sum, coordinate) => sum + coordinate[1], 0) / coordinates.length;
  const projected = coordinates.map(([longitude, pointLatitude]) => [longitude * Math.cos(latitude * Math.PI / 180), -pointLatitude]);
  const xs = projected.map(point => point[0]);
  const ys = projected.map(point => point[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const dx = Math.max(...xs) - minX;
  const dy = Math.max(...ys) - minY;
  const scale = Math.min(360 / (dx || 1e-9), 118 / (dy || 1e-9));
  const fitted = projected.map(([x, y]) => [
    60 + (360 - dx * scale) / 2 + (x - minX) * scale,
    45 + (118 - dy * scale) / 2 + (y - minY) * scale,
  ]);
  const first = fitted[0];
  const last = fitted.at(-1);

  if (!first || !last) return null;

  return <div className="route-map-fallback" role="img" aria-label="Expected route shape. The street map could not be loaded.">
    <svg viewBox="0 0 480 208" aria-hidden="true">
      <polyline
        points={fitted.map(point => point.join(",")).join(" ")}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={uncertain ? "8 8" : undefined}
      />
      <circle cx={first[0]} cy={first[1]} r="9" fill="white" stroke="currentColor" strokeWidth="3" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="9" fill="currentColor" />
    </svg>
    <p>Street map unavailable. Showing the expected route shape instead.</p>
  </div>;
}

export default function RoutePreview({ route, uncertain = false }: { route: RouteEstimate | null; uncertain?: boolean }) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [mapState, setMapState] = useState<"loading" | "ready" | "fallback">("loading");
  const coordinates = useMemo<LngLat[]>(() => {
    return (route?.route_geometry ?? [])
      .filter(point => Number.isFinite(point.latitude) && Number.isFinite(point.longitude))
      .map(point => [point.longitude, point.latitude]);
  }, [route?.route_geometry]);

  const coordinateKey = coordinates.map(point => point.join(",")).join(";");

  useEffect(() => {
    if (coordinates.length < 2 || !mapContainer.current) {
      setMapState("fallback");
      return;
    }

    let cancelled = false;
    let loaded = false;
    let map: MapInstance | null = null;
    let startMarker: MarkerInstance | null = null;
    let endMarker: MarkerInstance | null = null;
    setMapState("loading");

    loadMapLibre().then(maplibre => {
      if (cancelled || !mapContainer.current) return;
      const first = coordinates[0];
      const last = coordinates.at(-1);
      if (!first || !last) {
        setMapState("fallback");
        return;
      }

      map = new maplibre.Map({
        container: mapContainer.current,
        style: MAP_STYLE,
        center: first,
        zoom: 13,
        attributionControl: true,
        dragRotate: false,
        pitchWithRotate: false,
        scrollZoom: false,
        cooperativeGestures: true,
      });

      map.on("load", () => {
        if (cancelled || !map) return;
        loaded = true;
        map.addSource("ridewatch-route", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates },
          },
        });
        map.addLayer({
          id: "ridewatch-route-halo",
          type: "line",
          source: "ridewatch-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": "#ffffff", "line-width": 9, "line-opacity": 0.92 },
        });
        map.addLayer({
          id: "ridewatch-route-line",
          type: "line",
          source: "ridewatch-route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": uncertain ? "#71807a" : "#0d6b57",
            "line-width": 5,
            "line-opacity": uncertain ? 0.82 : 1,
            ...(uncertain ? { "line-dasharray": [2, 2] } : {}),
          },
        });

        startMarker = new maplibre.Marker({ element: marker("route-map-marker-start"), anchor: "center" })
          .setLngLat(first)
          .addTo(map);
        endMarker = new maplibre.Marker({ element: marker("route-map-marker-end"), anchor: "center" })
          .setLngLat(last)
          .addTo(map);

        const bounds = coordinates.slice(1).reduce(
          (current, coordinate) => current.extend(coordinate),
          new maplibre.LngLatBounds(first, first)
        );
        map.fitBounds(bounds, { padding: 46, maxZoom: 15, duration: 0 });
        setMapState("ready");
      });

      map.on("error", () => {
        if (!cancelled && !loaded) setMapState("fallback");
      });
    }).catch(() => {
      if (!cancelled) setMapState("fallback");
    });

    return () => {
      cancelled = true;
      startMarker?.remove();
      endMarker?.remove();
      map?.remove();
    };
  }, [coordinateKey, coordinates, uncertain]);

  return (
    <figure className={`route-preview route-preview-map ${uncertain ? "uncertain" : ""}`}>
      <div className="route-preview-head">
        <figcaption>
          <span className="route-preview-title">Expected route</span>
          <span className="route-preview-subtitle">Map preview · not turn-by-turn navigation</span>
        </figcaption>
        <span className="route-preview-badge">
          <span className="route-preview-badge-dot" aria-hidden="true" />
          AWS route
        </span>
      </div>

      <div className="route-map-shell">
        <div ref={mapContainer} className="route-map" role="region" aria-label="Map showing the expected route from start to destination" />
        {mapState === "loading" && <div className="route-map-loading" role="status">Loading street map…</div>}
        {mapState === "fallback" && <FallbackSketch coordinates={coordinates} uncertain={uncertain} />}
      </div>

      <div className="route-endpoints" aria-hidden="true">
        <span><i className="endpoint-start" />Start</span>
        <span><i className="endpoint-end" />Destination</span>
      </div>
    </figure>
  );
}
