import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir: process.env.RIDEWATCH_TEST_BUILD === "1" ? ".next-test" : ".next",
};

export default nextConfig;
