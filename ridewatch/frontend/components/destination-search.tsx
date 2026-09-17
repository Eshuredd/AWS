"use client";
import { useEffect, useState } from "react";
import { searchPlaces, type Coordinates, type Place } from "@/lib/api";

type SearchState = { key: string; results: Place[]; error: string; done: boolean };
export default function DestinationSearch({ location, selected, onSelect, disabled }: {
  location: Coordinates | null; selected: Place | null;
  onSelect: (place: Place | null) => void; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState | null>(null);
  const query = text.trim();
  const key = JSON.stringify([query, location, attempt]);
  const searching = query.length >= 3 && !selected && !disabled;
  const current = state?.key === key ? state : null;
  useEffect(() => {
    if (!searching) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchPlaces(query, location, controller.signal).then(({ results }) => {
        if (!controller.signal.aborted) setState({ key, results: results.slice(0, 5), error: "", done: true });
      }).catch((error: Error) => {
        if (!controller.signal.aborted) setState({ key, results: [], error: error.message, done: true });
      });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, location, key, searching]);
  return <div>
    <label htmlFor="destination" className="mb-2 block text-sm font-bold">Where are you going?</label>
    <input id="destination" placeholder="e.g. Secunderabad Railway Station" value={text}
      onChange={event => { setText(event.target.value); setState(null); onSelect(null); }}
      maxLength={200} required disabled={disabled} autoComplete="off" aria-describedby="destination-help"/>
    <p id="destination-help" className="mt-2 text-xs text-stone-500">{selected ? "Destination selected. Edit to choose a different place." : "Type at least 3 characters, then select a destination."}</p>
    {searching && <div className="mt-2" aria-live="polite">
      {!current?.done && <p className="py-3 text-sm text-stone-500" role="status">Searching destinations…</p>}
      {current?.error && <div role="alert" className="text-sm text-red-700"><p>{current.error}</p><button type="button" className="secondary mt-2" onClick={() => setAttempt(value => value + 1)}>Retry search</button></div>}
      {current?.done && !current.error && !current.results.length && <p className="py-3 text-sm text-stone-500">No destinations found. Try a nearby landmark or a more specific name.</p>}
      {!!current?.results.length && <ul aria-label="Destination suggestions" className="overflow-hidden rounded-xl border border-stone-200 divide-y divide-stone-200">
        {current.results.map((place, index) => <li key={`${place.id}-${index}`}><button type="button" disabled={disabled}
          className="min-h-14 w-full px-4 py-3 text-left text-sm leading-6 hover:bg-teal-50 focus-visible:bg-teal-50"
          onClick={() => { setText(place.label); onSelect(place); }}>{place.label}</button></li>)}
      </ul>}
    </div>}
  </div>;
}
