import TrustedContacts from "@/components/trusted-contacts";

export default function TrustedContactsPage() {
  return <main id="main" className="contacts-workspace" tabIndex={-1}>
    <div className="contacts-heading">
      <p className="eyebrow">RideWatch</p>
      <h1>Trusted contacts</h1>
      <p className="support">People you trust can receive your live trip when you choose to share it.</p>
    </div>
    <section className="sheet contacts-page-panel" aria-label="Manage trusted contacts">
      <TrustedContacts page />
    </section>
  </main>;
}
