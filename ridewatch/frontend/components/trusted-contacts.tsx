"use client";

import { useState } from "react";
import { normalizePhone, useTrustedContacts, validContactName, type TrustedContact } from "@/lib/use-trusted-contacts";

export default function TrustedContacts({ compact = false, page = false }: { compact?: boolean; page?: boolean }) {
  const { contacts, upsert, remove, storageAvailable, maxContacts } = useTrustedContacts();
  const [editing, setEditing] = useState<TrustedContact | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const begin = (contact?: TrustedContact) => {
    setEditing(contact || null); setAdding(true); setName(contact?.name || ""); setPhone(contact?.phone || ""); setError("");
  };
  const submit = () => {
    if (!validContactName(name) || !normalizePhone(phone)) { setError("Enter a name and a valid mobile number, such as +91 98765 43210."); return; }
    if (!upsert({ id: editing?.id, name, phone })) { setError("Unable to save this contact."); return; }
    setAdding(false); setEditing(null);
  };
  return <div className={`trusted-contacts ${compact ? "trusted-contacts-compact" : ""}`}>
    {!page && <p className="help">Trusted contacts are stored in this browser on this device. When you send an SOS, selected phone numbers are sent securely to RideWatch only to deliver the emergency SMS. RideWatch does not store them.</p>}
    {!storageAvailable && <p className="error-text" role="status">Browser storage is unavailable. Contacts cannot be saved.</p>}
    {page && contacts.length === 0 && !adding && <div className="contacts-empty"><h2>No trusted contacts yet.</h2><p className="support">Add someone you may want to share a live trip with.</p></div>}
    {contacts.length > 0 && <ul className="contact-list">{contacts.map(contact => <li key={contact.id}>
      <span><strong>{contact.name}</strong><small>{contact.phone}</small></span>
      <span className="contact-actions"><button type="button" className="text-button compact" onClick={() => begin(contact)}>Edit</button><button type="button" className="text-button compact" onClick={() => remove(contact.id)}>Remove</button></span>
    </li>)}</ul>}
    {adding ? <div className="contact-form" aria-label={editing ? `Edit ${editing.name}` : "Add trusted contact"}>
      <label>Name<input value={name} maxLength={60} onChange={event => setName(event.target.value)} autoComplete="name" /></label>
      <label>Phone number<input value={phone} maxLength={21} onChange={event => setPhone(event.target.value)} inputMode="tel" autoComplete="tel" /></label>
      {error && <p className="help error-text" role="alert">{error}</p>}
      <div className="dialog-actions"><button type="button" className="secondary" onClick={() => setAdding(false)}>Cancel</button><button type="button" className="primary" onClick={submit}>Save contact</button></div>
    </div> : contacts.length < maxContacts && <button type="button" className="secondary add-contact-button" onClick={() => begin()}>{page ? "+ Add trusted contact" : "Add trusted contact"}</button>}
    {page && contacts.length === maxContacts && <p className="help" role="status">Maximum of 3 trusted contacts reached.</p>}
    {page && <p className="contacts-privacy">Trusted contacts are stored in this browser on this device.<br />When you send an SOS, selected phone numbers are sent securely to RideWatch only to deliver the emergency SMS. RideWatch does not store them.</p>}
  </div>;
}
