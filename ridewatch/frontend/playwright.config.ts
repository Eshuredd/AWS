import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: { baseURL: "http://localhost:3100", headless: true },
  webServer: {
    command: process.env.TEST_AMPLIFY_BUNDLE === "1"
      ? "node .amplify-hosting/compute/default/server.js"
      : "npm run dev -- --port 3100",
    env: { PORT: "3100", HOSTNAME: "127.0.0.1", RIDEWATCH_TEST_BUILD: "1" },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
