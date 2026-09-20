"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createShare, revokeShare, sendSos, type Monitoring, type Ride } from "@/lib/api";
import { useTrustedContacts } from "@/lib/use-trusted-contacts";
import TrustedContacts from "./trusted-contacts";
import ConfirmDialog from "./confirm-dialog";

const shareKey = (rideId: string) => `ridewatch.share.v1.${rideId}`;

function messageFor(ride: Ride, shareUrl: string | null, state: Monitoring | null) {
  const lines = ["I may need help. I'm currently on a RideWatch trip.", "", `Destination:\n${ride.destination}`,
    "", `Vehicle:\n${ride.vehicle_number || "Not provided"}`, "",
    `Ride started:\n${new Date(ride.started_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}`];
  if (shareUrl) lines.push("", `Live trip:\n${shareUrl}`, "", "Please check my live trip status.");
  else if (state?.latest_location) lines.push("", `Current location:\nhttps://www.google.com/maps/search/?api=1&query=${state.latest_location.latitude},${state.latest_location.longitude}`);
  return lines.join("\n");
}

export function useRideShare(ride: Ride | null) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!ride) return; try { setToken(localStorage.getItem(shareKey(ride.id))); } catch {} }, [ride]);
  const ensure = async () => {
    if (token) return token;
    if (!ride) throw new Error("Ride unavailable");
    setBusy(true); setError("");
    try {
      const created = await createShare(ride.id);
      try { localStorage.setItem(shareKey(ride.id), created.token); } catch {}
      setToken(created.token); return created.token;
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start live sharing."); throw caught; }
    finally { setBusy(false); }
  };
  const stop = async () => {
    if (!token || busy || !ride) return;
    setBusy(true); setError("");
    try { await revokeShare(token); try { localStorage.removeItem(shareKey(ride.id)); } catch {} setToken(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to stop sharing."); }
    finally { setBusy(false); }
  };
  const adopt = (createdToken: string) => {
    if (!ride) return;
    try { localStorage.setItem(shareKey(ride.id), createdToken); } catch {}
    setToken(createdToken);
  };
  return { token, busy, error, ensure, stop, adopt };
}

export default function EmergencyAssistance({ ride, monitoring, open, onClose, sharing }: {
  ride: Ride; monitoring: Monitoring | null; open: boolean; onClose: () => void;
  sharing: ReturnType<typeof useRideShare>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const { contacts } = useTrustedContacts();
  const [manage, setManage] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmSos, setConfirmSos] = useState(false);
  const [sendingSos, setSendingSos] = useState(false);
  const sendingSosRef = useRef(false);
  const requestId = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal(); closeButton.current?.focus();
    return () => { dialog.current?.close(); previous?.focus(); };
  }, [open]);
  if (!open) return null;
  const sharedUrl = (token: string) => `${window.location.origin}/share/${encodeURIComponent(token)}`;
  const prepare = async () => {
    try { const token = await sharing.ensure(); const url = sharedUrl(token); return { text: messageFor(ride, url, monitoring), url }; }
    catch { if (monitoring?.latest_location) return { text: messageFor(ride, null, monitoring), url: null }; throw new Error("No live location is available"); }
  };
  const share = async () => {
    try {
      const prepared = await prepare();
      if (navigator.share) await navigator.share({ title: "RideWatch live trip", text: prepared.text, ...(prepared.url ? { url: prepared.url } : {}) });
      else { await navigator.clipboard.writeText(prepared.text); setNotice("Emergency details copied."); }
    } catch (caught) { if ((caught as DOMException)?.name !== "AbortError") setNotice("Unable to share. Try copying the emergency details."); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText((await prepare()).text); setNotice("Emergency details copied."); } catch { setNotice("Unable to copy emergency details."); } };
  const contact = async (phone: string) => {
    try {
      const text = (await prepare()).text;
      window.open(`https://wa.me/${phone.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    } catch { setNotice("Unable to prepare the message."); }
  };
  const broadcastSos = async () => {
    if (sendingSosRef.current || contacts.length === 0) return;
    sendingSosRef.current = true;
    setConfirmSos(false); setSendingSos(true); setNotice("");
    const id = requestId.current || crypto.randomUUID();
    requestId.current = id;
    try {
      const result = await sendSos(ride.id, id, contacts.map(item => item.phone));
      sharing.adopt(result.token);
      setNotice(result.failed === 0
        ? `SOS sent to all ${result.sent} trusted contact${result.sent === 1 ? "" : "s"}.`
        : `SOS sent to ${result.sent} of ${result.requested} trusted contacts.`);
      requestId.current = null;
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : "Unable to send SOS. Please try again.");
    } finally { sendingSosRef.current = false; setSendingSos(false); }
  };
  return <dialog ref={dialog} className="emergency-dialog" aria-labelledby="emergency-title" aria-describedby="emergency-description" onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={event => {
    if (event.key !== "Tab") return;
    const items = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled)');
    const first = items?.[0], last = items?.[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="emergency-dialog-head"><div><p className="eyebrow">Get help</p><h2 id="emergency-title">Emergency assistance</h2></div><button ref={closeButton} type="button" className="text-button" onClick={onClose}>Close</button></div>
    <p id="emergency-description" className="support">If you are in immediate danger, contact emergency services.</p>
    {contacts.length > 0 && <button type="button" className="primary wide sos-send" disabled={sendingSos} onClick={() => setConfirmSos(true)}>{sendingSos ? "Sending SOS…" : "SEND SOS"}</button>}
    <a className={`primary emergency-call${notice.startsWith("SOS sent") ? " emergency-call-promoted" : ""}`} href="tel:112">{notice.startsWith("SOS sent") ? "Need immediate help? Call 112" : "Call 112"}</a>
    <button type="button" className="secondary wide" disabled={sharing.busy} onClick={share}>{sharing.busy ? "Preparing link…" : "Share live trip"}</button>
    <p className="help">Live sharing exposes your current trip status and location to anyone with this private link. Stop sharing when you no longer need it.</p>
    {contacts.length > 0 && <div className="emergency-contacts"><h3>Trusted contacts</h3>{contacts.map(item => {
      const prepared = sharing.token ? messageFor(ride, sharedUrl(sharing.token), monitoring) : null;
      return <div className="emergency-contact" key={item.id}><span>{item.name}</span><span>{prepared ?
        <a className="secondary" target="_blank" rel="noreferrer" href={`https://wa.me/${item.phone.replace(/^\+/, "")}?text=${encodeURIComponent(prepared)}`}>Open WhatsApp</a>
        : <button type="button" className="secondary" onClick={() => contact(item.phone)}>Open WhatsApp</button>}</span></div>;
    })}</div>}
    {contacts.length === 0 && <div className="emergency-empty-contacts"><p>No trusted contacts added.</p><Link className="secondary wide" href="/trusted-contacts">Add trusted contact</Link></div>}
    <button type="button" className="secondary wide" onClick={copy}>Copy emergency details</button>
    <button type="button" className="text-button" onClick={() => setManage(value => !value)}>{manage ? "Hide contact manager" : "Manage trusted contacts"}</button>
    {manage && <TrustedContacts compact />}
    {(notice || sharing.error) && <p role="status" className="help">{notice || sharing.error}</p>}
    <p className="fine emergency-disclaimer">RideWatch does not automatically contact police or emergency services.</p>
    {confirmSos && <ConfirmDialog title="Send emergency SOS?" description={`RideWatch will send your live trip to ${contacts.length} trusted contact${contacts.length === 1 ? "" : "s"}. Standard messaging charges may apply.`} confirm="Send SOS" cancel="Cancel" onConfirm={broadcastSos} onClose={() => setConfirmSos(false)} />}
  </dialog>;
}
