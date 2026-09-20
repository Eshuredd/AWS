import SharedTrip from "@/components/shared-trip";

export default async function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SharedTrip token={token} />;
}
