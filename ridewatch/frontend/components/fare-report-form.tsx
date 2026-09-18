"use client";
import { useRef, useState, type FormEvent } from "react";
import { reportFare } from "@/lib/api";

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
  if (status === "skipped") return null;
  return <section className="card mt-4" aria-live="polite">{status === "sent" ? <p>Thanks — your fare report will help improve estimates for similar rides.</p> : <form onSubmit={submit}>
    <label htmlFor="fare-paid" className="mb-3 block font-bold">How much did you pay?</label>
    <div className="flex items-center gap-3"><span aria-hidden="true">₹</span><input id="fare-paid" type="number" inputMode="decimal" min="0.01" max="10000" step="0.01" required value={paid} onChange={e => setPaid(e.target.value)} disabled={status === "busy"} aria-describedby="fare-help"/></div>
    <p id="fare-help" className="mt-2 text-xs text-stone-500">Optional. Report the total fare you actually paid in rupees.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    <button className="primary mt-4" disabled={status === "busy"}>{status === "busy" ? "SUBMITTING…" : "SUBMIT FARE"}</button>
    <button type="button" className="secondary mt-3 w-full" disabled={status === "busy"} onClick={() => setStatus("skipped")}>Skip</button>
  </form>}</section>;
}
