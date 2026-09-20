import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir:
    process.env.RIDEWATCH_TEST_BUILD === "1"
      ? ".next-test"
      : process.env.NODE_ENV === "development"
        ? ".next-dev"
        : ".next",
};

export default nextConfig;