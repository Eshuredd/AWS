"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { rememberRecentRide } from "@/lib/recent-rides";

export default function RecentRideRecorder() {
  const pathname = usePathname();

  useEffect(() => {
    const match = pathname.match(/^\/ride\/([^/]+)$/);
    if (!match) return;
    const rideId = decodeURIComponent(match[1]);
    rememberRecentRide(rideId);
  }, [pathname]);

  return null;
}
