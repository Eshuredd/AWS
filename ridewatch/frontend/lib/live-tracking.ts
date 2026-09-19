import type { Coordinates, Monitoring } from "./api";

// One watcher and at most one request in flight. Dependencies permit offline tests.
export function startTracking(options: {
  geolocation?: Geolocation;
  send: (sample: Coordinates & { accuracy_m: number }, signal: AbortSignal) => Promise<Monitoring>;
  onState: (state: Monitoring) => void;
  onError: (message: string) => void;
  now?: () => number;
}) {
  const { geolocation, send, onState, onError } = options;
  const now = options.now ?? (() => performance.now());
  const controller = new AbortController();
  let lastSent = -Infinity;
  let pending = false;
  let watcher: number | undefined;
  if (!geolocation) onError("Live monitoring unavailable: this browser has no geolocation support.");
  else {
    try {
      watcher = geolocation.watchPosition(async ({ coords }) => {
        if (controller.signal.aborted || pending || now() - lastSent < 5000) return;
        lastSent = now(); pending = true;
        try {
          const state = await send({ latitude: coords.latitude, longitude: coords.longitude, accuracy_m: coords.accuracy }, controller.signal);
          if (!controller.signal.aborted) { onError(""); onState(state); }
        } catch {
          if (!controller.signal.aborted) onError("Live monitoring unavailable: could not update RideWatch. Retrying with the next GPS reading.");
        } finally { pending = false; }
      }, error => {
        if (!controller.signal.aborted) onError(error.code === 1
          ? "Permission denied. Enable location access in browser settings, then restart monitoring."
          : error.code === 3 ? "Live monitoring unavailable: GPS timed out. Waiting for a new reading."
          : "Live monitoring unavailable: check device location settings.");
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 });
    } catch { onError("Live monitoring unavailable. Check browser location settings."); }
  }
  return () => {
    controller.abort();
    if (watcher !== undefined) geolocation?.clearWatch(watcher);
  };
}
