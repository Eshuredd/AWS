import RideSession from "@/components/ride-session";
export default async function RidePage({ params }: { params: Promise<{ rideId: string }> }) {
  const { rideId } = await params;
  return <RideSession rideId={rideId}/>;
}
