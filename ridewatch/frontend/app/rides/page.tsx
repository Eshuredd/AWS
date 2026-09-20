import RecentRides from "@/components/recent-rides";

export default function RecentRidesPage() {
  return (
    <main id="main" className="rides-workspace" tabIndex={-1}>
      <div className="rides-heading">
        <div>
          <p className="eyebrow">RideWatch</p>
          <h1>Recent rides</h1>
          <p className="support">Journeys opened on this device, with the route and estimates saved by RideWatch.</p>
        </div>
        <span className="device-history-badge">This device</span>
      </div>
      <RecentRides />
    </main>
  );
}
