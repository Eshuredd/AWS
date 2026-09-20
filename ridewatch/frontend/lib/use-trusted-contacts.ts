"use client";

import { useCallback, useEffect, useState } from "react";

export type TrustedContact = { id: string; name: string; phone: string };
const KEY = "ridewatch.trusted-contacts.v1";
const MAX_CONTACTS = 3;

export function validContactName(value: string) {
  return value.trim().length >= 1 && value.trim().length <= 60;
}

export function normalizePhone(value: string) {
  const trimmed = value.trim();
  if (!/^[+\d][\d\s().-]{7,20}$/.test(trimmed)) return null;
  const compact = trimmed.replace(/[\s().-]/g, "").replace(/^00/, "+");
  if (!/^\+?\d{8,15}$/.test(compact)) return null;
  const local = compact.replace(/^\+91/, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  if ((compact.startsWith("+91") || /^91\d{10}$/.test(compact) || /^0?\d{10}$/.test(compact)) && !/^[6-9]\d{9}$/.test(local)) return null;
  return compact;
}

function readContacts(): TrustedContact[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.contacts)) return [];
    return parsed.contacts.filter((item: unknown): item is TrustedContact => {
      if (!item || typeof item !== "object") return false;
      const contact = item as Record<string, unknown>;
      return typeof contact.id === "string" && typeof contact.name === "string" &&
        validContactName(contact.name) && typeof contact.phone === "string" && normalizePhone(contact.phone) === contact.phone;
    }).slice(0, MAX_CONTACTS);
  } catch { return []; }
}

export function useTrustedContacts() {
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    const refresh = () => setContacts(readContacts());
    refresh(); window.addEventListener("ridewatch-contacts", refresh);
    return () => window.removeEventListener("ridewatch-contacts", refresh);
  }, []);
  const save = useCallback((next: TrustedContact[]) => {
    setContacts(next);
    try { localStorage.setItem(KEY, JSON.stringify({ version: 1, contacts: next })); setStorageAvailable(true); window.dispatchEvent(new Event("ridewatch-contacts")); }
    catch { setStorageAvailable(false); }
  }, []);
  const upsert = useCallback((value: Omit<TrustedContact, "id"> & { id?: string }) => {
    const name = value.name.trim();
    const phone = normalizePhone(value.phone);
    if (!validContactName(name) || !phone) return false;
    const id = value.id || crypto.randomUUID();
    const next = value.id ? contacts.map(item => item.id === id ? { id, name, phone } : item)
      : contacts.length < MAX_CONTACTS ? [...contacts, { id, name, phone }] : contacts;
    if (!value.id && next === contacts) return false;
    save(next); return true;
  }, [contacts, save]);
  const remove = useCallback((id: string) => save(contacts.filter(item => item.id !== id)), [contacts, save]);
  return { contacts, upsert, remove, storageAvailable, maxContacts: MAX_CONTACTS };
}
