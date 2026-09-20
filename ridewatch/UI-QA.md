# RideWatch redesign verification

Implemented 20 September 2026 from DESIGN.md. The existing Next.js routes, backend, API contracts, quote refresh, GPS accuracy/cadence, persistence and drop-location fallback remain in place. No UI library, map service, OCR, emergency feature, deployment, commit or push was added.

## What changed

- One progressive preparation flow: pickup → keyboard-accessible destination selection → actual route geometry and fare review → optional vehicle → Start ride.
- Reusable tokens, inline icons, route schematic, status presentation, notices, skeletons and accessible confirmations.
- Live monitoring leads the session; original route metrics and saved ride details remain accessible. Unknown, poor and stale readings never become current reassurance.
- End/leave confirmations explain consequences, keep monitoring active until ending is confirmed, and restore focus on cancellation. Failed ending preserves the recoverable session UI.
- Completion prioritizes closure and optional fare contribution. Official and reported fares retain their separate meanings and supporting details.
- Fixed mobile action dock, safe-area spacing, normal-flow controls while editing/expanding details, and deliberate desktop route/side-panel composition.

## Visual inspection and revisions

Captured every main journey state at 390×844, 430×932, 768×1024 and 1440×900. Inspected initial pickup, destination results, review, vehicle entry, waiting, reliable monitoring, weak/unavailable GPS, deviation with stop/delay, end/leave dialogs, pending operations, completed ride and fare confirmation. Additional captures cover empty search, field errors, route failure, unsupported fares, 320/360px widths and a short viewport representing 200% desktop-zoom reflow.

The screenshot loop led to concrete fixes:

1. Enlarged mobile route labels and adjusted their desktop/tablet scale.
2. Improved fare label/value wrapping; unavailable fare text no longer looks like a price.
3. Removed transform from entry animation so the mobile fixed dock stays attached to the viewport.
4. Returned the dock to normal flow when fields/details are open, avoiding overlap with vehicle input and errors.
5. Removed the repeated mobile completion drawing to bring the contribution form forward; desktop retains route context.
6. Preserved expected-route context during ending, with an explicit monitoring-paused message.
7. Added explicit dialog Tab/Shift+Tab containment after the keyboard test exposed a focus gap.

Final captures were regenerated after these fixes. Local review artifacts are in `dist/ui-review/index.html`; PNGs include full-page and viewport versions. These ignored artifacts use synthetic test data, not real riders or live AWS responses.

## Checks

| Check | Result |
|---|---|
| Playwright | 19 passed, including the original six regression behaviors |
| Lint | Passed |
| Typecheck | Passed |
| Production build | Passed; `/` static and `/ride/[rideId]` dynamic |
| Required viewport sizes | All four exercised; no horizontal overflow |
| Keyboard | Combobox selection/Escape, dialog focus containment/restoration and disabled/retry flows verified |
| Reduced motion | Animation disabled under the preference |
| Narrow/short reflow | 320px, 360px and 384×512 verified |
| Text contrast | Ink/muted/accent/caution/danger exceed 4.5:1 on both page surfaces |

Measured minimum ratios on the canvas: ink 13.26:1, muted 5.47:1, accent 6.56:1, caution 5.92:1, danger 6.00:1. White on the primary accent is 7.12:1. These token checks are not a full accessibility certification.

Backend tests were not rerun because no backend files changed. Frontend tests remain offline and preserve quote-expiry refresh, duplicate-submit protection, watcher throttle/cleanup, permission handling, end flow and fare submission. New coverage adds simultaneous signal priority, pending states, failure recovery, confirmations, keyboard search, optional vehicle validation and responsive screenshots.

## Boundaries

The subsequent competition polish pass is documented in [FINAL-UI-AUDIT.md](FINAL-UI-AUDIT.md). Its current screenshot gallery is `dist/final-ui-audit/after/index.html`; the earlier captures are preserved under `dist/final-ui-audit/before`.

- The drawing intentionally shows expected geometry only. No basemap, turn-by-turn navigation, live marker, arrival guarantee or journey percentage is implied.
- Vehicle entry is manual; OCR/scanning remains outside the approved design scope.
- Browser automation ran in Chromium with simulated GPS/API responses. Real iOS/Android keyboards, background behavior, physical-device GPS and screen-reader software still need a device walkthrough.
- Leaving through the in-app control is confirmed; browser unload warnings remain subject to browser policies. Keeping the ride page open is still required for monitoring.
- No known horizontal overflow or blocking visual defect remained in the inspected states. Production AWS hosting was not exercised in this redesign task.
