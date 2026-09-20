// Next.js standalone -> Amplify's framework-independent deployment specification.
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { resolve, dirname, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, ".amplify-hosting");
const api = process.env.NEXT_PUBLIC_API_URL;
if (!api || !/^https:\/\/[^/]+\/?$/.test(api) || new URL(api).hostname === "localhost") {
  throw new Error("Set NEXT_PUBLIC_API_URL to the HTTPS API Gateway origin before building for Amplify.");
}
const build = spawnSync(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "build"], { cwd: root, stdio: "inherit" });
if (build.status !== 0) process.exit(build.status ?? 1);
// Only replace the fixed build-output directory below this frontend workspace.
if (dirname(target) !== root || relative(root, target) !== ".amplify-hosting") throw new Error("Invalid build output path");
await rm(target, { recursive: true, force: true });
const compute = resolve(target, "compute/default");
await mkdir(compute, { recursive: true });
const safe = source => !relative(root, source).split(sep).some(part => part.startsWith(".env") || part === ".aws");
const standalone = resolve(root, ".next/standalone");
console.log(`Standalone source: ${standalone}`);
await cp(standalone, compute, { recursive: true, dereference: true, filter: safe });

async function findServer(directory) {
  const candidate = resolve(directory, "server.js");
  try {
    if ((await stat(candidate)).isFile()) return candidate;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "node_modules") continue;
    const found = await findServer(resolve(directory, entry.name));
    if (found) return found;
  }
  return null;
}

const server = await findServer(compute);
if (!server) throw new Error(`No application server.js found under ${compute} (node_modules excluded). Standalone source: ${standalone}`);
const appRoot = dirname(server);
const serverRelative = `./${relative(compute, server).split(sep).join("/")}`;
console.log(`Discovered standalone server: ${server}`);
await mkdir(resolve(target, "static/_next"), { recursive: true });
await cp(resolve(root, ".next/static"), resolve(target, "static/_next/static"), { recursive: true });
await cp(resolve(root, "public"), resolve(target, "static"), { recursive: true, filter: safe });
// Next standalone serves assets relative to its application server directory.
await cp(resolve(root, ".next/static"), resolve(appRoot, ".next/static"), { recursive: true });
await cp(resolve(root, "public"), resolve(appRoot, "public"), { recursive: true, filter: safe });
const entrypoint = resolve(compute, "amplify-entry.cjs");
await writeFile(entrypoint, `process.env.PORT = "3000";\nprocess.env.HOSTNAME = "0.0.0.0";\nrequire(${JSON.stringify(serverRelative)});\n`);
console.log(`Compute entrypoint: ${entrypoint}`);
const next = JSON.parse(await readFile(resolve(root, "node_modules/next/package.json"), "utf8"));
await writeFile(resolve(target, "deploy-manifest.json"), JSON.stringify({
  version: 1,
  framework: { name: "next", version: next.version },
  routes: [
    { path: "/_next/static/*", target: { kind: "Static", cacheControl: "public, max-age=31536000, immutable" } },
    { path: "/*.*", target: { kind: "Static" }, fallback: { kind: "Compute", src: "default" } },
    { path: "/*", target: { kind: "Compute", src: "default" } },
  ],
  computeResources: [{ name: "default", runtime: "nodejs22.x", entrypoint: "amplify-entry.cjs" }],
}, null, 2));
console.log("Amplify deployment bundle prepared. No deployment performed.");
