"use client";
import { useEffect, useRef, useState } from "react";
import { searchPlaces, type Coordinates, type Place } from "@/lib/api";
import { Notice } from "./ui";
type SearchState = { key: string; results: Place[]; error: string; done: boolean };
export default function DestinationSearch({ location, selected, onSelect, disabled }: {
  location: Coordinates | null; selected: Place | null; onSelect: (place: Place | null) => void; disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SearchState | null>(null);
  const [active, setActive] = useState(-1);
  const [open, setOpen] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const hadLocation = useRef(false);
  const query = text.trim();
  const key = JSON.stringify([query, location, attempt]);
  const searching = !!location && query.length >= 3 && !selected && !disabled;
  const current = state?.key === key ? state : null;
  const results = current?.results ?? [];
  const expanded = searching && open && results.length > 0;
  useEffect(() => {
    if (location && !hadLocation.current) input.current?.focus();
    hadLocation.current = !!location;
  }, [location]);
  useEffect(() => {
    if (!searching || !location) return;
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
  function choose(place: Place) { setText(place.label); setOpen(false); setActive(-1); onSelect(place); }
  return <div>
    <label htmlFor="destination">Where are you going?</label>
    <input ref={input} id="destination" role="combobox" aria-autocomplete="list" aria-expanded={expanded} aria-controls={expanded ? "destination-results" : undefined} aria-activedescendant={expanded && active >= 0 && results[active] ? `place-${active}` : undefined}
      placeholder="Search a place or landmark" value={text} maxLength={200} required disabled={disabled || !location} autoComplete="off" aria-describedby="destination-help"
      onFocus={() => setOpen(true)} onBlur={() => { setOpen(false); setActive(-1); }}
      onChange={e => { setText(e.target.value); setState(null); setActive(-1); setOpen(true); onSelect(null); }}
      onKeyDown={e => {
        if (e.key === "Escape") { e.preventDefault(); setOpen(false); setActive(-1); }
        if ((e.key === "ArrowDown" || e.key === "ArrowUp") && results.length) { e.preventDefault(); setOpen(true); setActive(i => e.key === "ArrowDown" ? (i + 1) % results.length : (i <= 0 ? results.length - 1 : i - 1)); }
        if (e.key === "Enter") { e.preventDefault(); if (expanded && active >= 0 && results[active]) choose(results[active]); }
      }}/>
    <p id="destination-help" className="help">{!location ? "Add your current location before searching for a destination." : selected ? "Destination selected. Edit to choose a different place." : "Type at least 3 characters, then choose a place."}</p>
    {searching && <><p className="sr-only" role="status">{current?.done ? `${results.length} destinations found.` : "Searching destinations…"}</p>
      {!current?.done && <p className="help">Searching destinations…</p>}
      {current?.error && <Notice><p>{current.error}</p><button type="button" className="secondary" onClick={() => setAttempt(v => v + 1)}>Retry search</button></Notice>}
      {current?.done && !current.error && !results.length && <p className="help">No destinations found. Try a nearby landmark or a more specific name.</p>}
      {expanded && <ul id="destination-results" role="listbox" aria-label="Destination suggestions" className="search-results">
        {results.map((place, index) => <li id={`place-${index}`} key={`${place.id}-${index}`} role="option" aria-selected={index === active} onPointerDown={e => { e.preventDefault(); choose(place); }}>{place.label}</li>)}
      </ul>}
    </>}
  </div>;
}
