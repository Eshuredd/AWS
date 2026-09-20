# RideWatch frontend

Next.js 16 App Router, React 19 and Tailwind 4. The visual specification lives in [DESIGN.md](../DESIGN.md); implementation evidence is in [UI-QA.md](../UI-QA.md).

## Development

Use Node 22. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_API_URL` to your backend origin. Run `npm ci`, then `npm run dev`. Start the existing backend separately using the project README. No backend credentials belong in the frontend.

## Architecture

- `/`: progressive pickup, destination selection, route/fare review, optional vehicle and ride creation.
- `/ride/[rideId]`: saved ride loading, live monitoring, deliberate ending, completion and optional fare contribution.
- Existing route/fare hooks and `lib/api.ts` retain API contracts and quote validation flow.
- `lib/live-tracking.ts` owns the existing GPS lifecycle and throttle; `monitoring-presentation.ts` resolves display priority without changing server signals.
- `app/globals.css` defines the small shared visual system. System fonts and inline SVG icons require no external font or UI service.
- `route-preview.tsx` draws actual returned geometry as a labeled schematic, not a basemap, live marker or progress tracker.
- `confirm-dialog.tsx` supplies native modal/inert behavior, deliberate initial focus, keyboard containment and focus restoration.
- `ui.tsx` supplies the small icon set, loading skeleton and error notice.

## Verification

Run `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build`. Browser tests mock API responses and GPS; no AWS calls are made. Test data stays in `tests/fixtures.ts`, never in application components.

Playwright uses port 3100 and an isolated `.next-test` directory. It captures viewport/full-page PNGs under `test-results/`. The visual suite checks 390×844, 430×932, 768×1024 and 1440×900, with additional narrow/short viewport and reduced-motion checks. Test artifacts are ignored by Git.

For Amplify, use `npm run build:amplify` with the HTTPS API origin configured at build time. See [DEPLOYMENT.md](../DEPLOYMENT.md); no deployment is performed by the frontend build.
