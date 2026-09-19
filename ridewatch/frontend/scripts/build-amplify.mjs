// Next.js standalone -> Amplify's framework-independent deployment specification.
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
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
await cp(resolve(root, ".next/standalone"), compute, { recursive: true, dereference: true, filter: safe });
await stat(resolve(compute, "server.js"));
await mkdir(resolve(target, "static/_next"), { recursive: true });
await cp(resolve(root, ".next/static"), resolve(target, "static/_next/static"), { recursive: true });
await cp(resolve(root, "public"), resolve(target, "static"), { recursive: true, filter: safe });
// Also include assets in compute for a standalone local smoke test.
await cp(resolve(root, ".next/static"), resolve(compute, ".next/static"), { recursive: true });
await cp(resolve(root, "public"), resolve(compute, "public"), { recursive: true, filter: safe });
await writeFile(resolve(compute, "amplify-entry.cjs"), 'process.env.PORT = "3000";\nprocess.env.HOSTNAME = "0.0.0.0";\nrequire("./server.js");\n');
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
