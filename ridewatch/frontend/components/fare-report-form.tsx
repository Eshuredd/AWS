"use client";
import { useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { reportFare } from "@/lib/api";
import { Icon, Notice } from "./ui";
export default function FareReportForm({ rideId }: { rideId: string }) {
  const [paid, setPaid] = useState("");
  const [status, setStatus] = useState<"ready" | "busy" | "sent" | "skipped">("ready");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const amount = Number(paid);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000) { setError("Enter a fare greater than ₹0 and at most ₹10,000."); return; }
    submitting.current = true; setStatus("busy"); setError("");
    try { await reportFare(rideId, amount); setStatus("sent"); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to submit fare."); setStatus("ready"); }
    finally { submitting.current = false; }
  }
  if (status === "sent" || status === "skipped") return <div className="confirmation-message enter"><div role="status">{status === "sent" ? <><span className="completion-mark"><Icon name="check"/></span><h2>Thanks for sharing.</h2><p className="support">Your fare report will help improve estimates for similar rides.</p></> : <><h2>You’re all done.</h2><p className="support">Your ride details are saved here.</p></>}</div><Link href="/" className="primary">Start another ride</Link></div>;
  return <form onSubmit={submit} className="fare-form">
    <div><p className="eyebrow">One small contribution · Optional</p><h2>How much did you pay?</h2><p className="help">Help the next rider know what to expect.</p></div>
    <div><label htmlFor="fare-paid">Total fare paid</label><div className="fare-input"><span aria-hidden="true">₹</span><input id="fare-paid" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required value={paid} onChange={e => setPaid(e.target.value)} disabled={status === "busy"} aria-invalid={!!error} aria-describedby="fare-help"/></div><p id="fare-help" className="help">Total paid in rupees, up to ₹10,000.</p></div>
    {error && <Notice>{error}</Notice>}
    <div><button className="primary" disabled={status === "busy"}>{status === "busy" ? "Submitting…" : "Submit fare"}</button><button type="button" className="text-button" disabled={status === "busy"} onClick={() => setStatus("skipped")}>Skip</button></div>
  </form>;
}
