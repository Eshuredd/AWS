export type RecentRideReference = {
  id: string;
  seenAt: string;
};

const STORAGE_KEY = "ridewatch.recent-rides.v1";
const MAX_RECENT_RIDES = 20;

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const store = window.localStorage;
    const probe = `${STORAGE_KEY}.probe`;
    store.setItem(probe, "1");
    store.removeItem(probe);
    return store;
  } catch {
    return null;
  }
}

function validReference(value: unknown): value is RecentRideReference {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && item.id.length > 0 && typeof item.seenAt === "string";
}

export function getRecentRideReferences(): RecentRideReference[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed: unknown = JSON.parse(store.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(validReference).slice(0, MAX_RECENT_RIDES);
  } catch {
    return [];
  }
}

export function rememberRecentRide(id: string) {
  const store = storage();
  if (!store || !id) return;
  const existing = getRecentRideReferences().filter(item => item.id !== id);
  const next: RecentRideReference[] = [
    { id, seenAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_RECENT_RIDES);
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // History is a convenience feature; ride safety must not depend on storage.
  }
}

export function forgetRecentRide(id: string) {
  const store = storage();
  if (!store) return;
  try {
    const next = getRecentRideReferences().filter(item => item.id !== id);
    store.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures and keep the ride experience usable.
  }
}
