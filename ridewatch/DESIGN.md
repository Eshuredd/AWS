# RideWatch design direction

Status: implemented 20 September 2026. See [UI-QA.md](UI-QA.md) for validation and implementation notes. The audit below records the pre-redesign frontend on 19 September 2026, including deployment preparation. Project root is `ridewatch/`; the Git repository root is its parent.

## Product decision

RideWatch should feel like a quiet companion to the journey: easy to prepare, immediately understandable while moving, and honest when it cannot observe reliably. The design must earn reassurance through visible evidence, never through an unconditional “safe” label.

The visual direction is warm white, deep evergreen, clear native typography, a restrained route drawing, and one continuous information surface. Before a ride, the destination and estimate lead. During a ride, the current monitoring state leads. After a ride, completion and the optional fare contribution lead. This is a mobility utility, not a marketing landing page or a monitoring dashboard.

## Existing frontend audit

### Scope and evidence

Read both routes, the shared layout/styles, all six components, all four library modules, package/build/TypeScript/Playwright configuration, existing browser tests, public asset inventory, and frontend documentation. Inspected actual rendered home, active, and completed screens with synthetic GPS and mocked API responses. No real ride or AWS request was created for the audit.

Home was rendered at 360, 390, 430, 768 and 1440px widths with an 844px viewport height. Active and completed flows were exercised at 390 and 1440px. Reviewed full-page screenshots of mobile home/active and desktop home. Other state findings below come from source inspection; this was not a screen-reader, real-device or comprehensive accessibility certification. The Next development indicator visible in screenshots is tooling, not product UI.

| Area | Current implementation | Design implication |
|---|---|---|
| Framework/routing | Next.js 16.3.5 App Router, React 19, Tailwind 4; `/` and `/ride/[rideId]`. Async route wrapper passes an ID to a client session. | Retain framework, URLs, direct session loading and client-side API integration. |
| Deployment | Standalone Next server and custom Amplify bundle; public API origin compiled at build time. | Do not break dynamic ride URLs, introduce server secrets, or replace deployment configuration for styling. |
| Shared shell | Centered 1024px wrapper, large header gap, preview badge, marketing footer. Session narrows further to 576px even on desktop. | Too much introductory chrome; active state needs a focused shell and useful desktop composition. |
| Styles | Global `.card`, `.primary`, `.secondary`; nested white, stone and teal containers, borders and 12/14/24px radii; utility classes throughout. | Reasonable foundation, but nearly every content group gets equal visual weight. Replace repeated containers with spacing and hierarchy. |
| Typography | Arial/Helvetica/system fallback; no font loader. Many helper/disclaimer lines at 12px; uppercase actions and tracking-heavy labels. | Prefer a native system stack and sentence case; reserve small text for secondary metadata. Frontend README's Geist claim is stale. |
| Icons/assets | Unicode arrow used as mark/decoration; no icon package. Public SVGs are unused starter assets. | Use a tiny coherent SVG set, not a new illustration library or stock dashboard iconography. |
| Home | Hero, location box, disabled destination, optional vehicle, disabled Start Ride, separate estimate/fare card. | Location-to-destination flow exists, but too much future information and optional work competes with the next action. |
| Search | 3-character minimum, 400ms debounce, five results, cancellation, loading/empty/retry feedback, actual place selection required. | Keep behavior. Improve focus/keyboard handling and result structure without accepting unselected free text. |
| Route/fare | Cancellable hooks; real route geometry and traffic estimate; official meter vs reported fares; unsupported region and insufficient-data states; source caveats. | Preserve the distinctions; disclose technical detail after the estimate, not before it exists. Geometry is available but not visualized. |
| Start | Vehicle normalization/validation, quote refresh near expiry, duplicate-submit protection, route/fare IDs, session navigation. | Preserve all gates and refreshed values; no cosmetic shortcut around validated quotes. |
| Session | Destination/vehicle/distance/duration/timestamps/full fare detail before live monitoring. Same large receipt remains after completion. | Active priority is inverted. Completion also needs its own information hierarchy. |
| Monitoring | High-accuracy watchPosition; 5s send throttle, one location request in flight; 10s aggregate polling, freshness logic, restart, cleanup. | Preserve lifecycle and truthful uncertainty. Do not mount a watcher per visual component or pause it when opening details. |
| Ending/reporting | Independent drop GPS attempt and bounded destination fallback; end request; optional fare submit/skip and thank-you state. | Keep fallback and validation. An explicit ending state is necessary because monitoring unmounts while ending. |
| Loading/errors | Text loading messages, contextual retries, permission distinctions, disabled controls, alerts/live regions. | Recovery exists; add stable layout and actionable prioritization. Broad live regions could over-announce frequent updates. |
| Navigation | Brand/home links leave the session and unmount tracking; no persistent active-session navigation. | Leaving an active screen must explain the tracking consequence. Do not imply background monitoring. |
| Responsiveness | Home switches to two columns at `md`; session stays single-column. No safe-area action dock or sheet behavior. | No home horizontal overflow in audited sizes, but content order and thumb reach remain poor. Tablet's early split is cramped. |

### Largest weaknesses, ordered by impact

1. **The live session hides its purpose.** At 390×844, monitoring began about 1,074px down the document and End Ride around 1,448px. On desktop, monitoring still began around 1,026px. A rider must scroll past receipt details to know what is happening.
2. **The first task is buried in explanation.** Home was approximately 1,920px tall at 390px; Start Ride began around 832px. Empty estimates, fare caveats and optional vehicle details appear before they can help. Mobile places the estimate after Start Ride, reversing the decision sequence.
3. **Equal-weight boxes obscure the journey.** Large cards inside cards, badges, labels and repeated green panels lack a clear focal point. Desktop stretches the form/estimate pair rather than using space for spatial context.
4. **Trust copy contradicts working behavior.** The footer says “No live tracking” despite implemented GPS monitoring. Generic API errors mention a running backend or local sessions disappearing even when production uses DynamoDB. A 503 can be labeled a location problem even when another service fails. These are future copy fixes, not backend rewrites.
5. **Status is fragmented and controls are distant.** GPS/route/movement/timing have equal emphasis. Restart is always shown. Freshness should qualify reassurance at the top. Active navigation silently stops monitoring; ending briefly removes the monitoring panel.
6. **Polish is mostly spacing, not interaction.** Loading is text-only; no stable route surface, keyboard-aware action placement, or intentional completion composition. Existing labels and focus outline are useful, but contrast, announcement frequency and keyboard navigation need dedicated verification.

### Working contracts to preserve

- Location is user-triggered; initial pickup uses low accuracy, 25s timeout and 60s maximum age. Active watch remains high accuracy, 10s timeout and 5s maximum age. Drop capture remains independent and bounded.
- Pickup is required before location-biased search. Selecting a result, not merely typing, enables route calculation. Destination edits invalidate dependent estimates; aborted/stale requests cannot restore old results.
- Route and fare remain server-derived. Refresh expiring route/fare quotes before starting and retain duplicate-submit protections.
- Supported official fare, typical reported fare, median, sample count, matching radii, confidence, night surcharge, exclusions and unsupported/missing data remain accessible. Never combine official and reported values into one promised price.
- Preserve API methods, IDs, coordinate handling, persistence, local/production URL behavior and sanitized errors. No backend migration or new service is required for this design.
- Preserve all monitoring states and cleanup, direct ride reload, completed snapshots, end failure recovery, GPS drop fallback, fare submit/skip, and unavailable legacy-route behavior.
- No new SOS, contact sharing, calling, navigation, authentication or background-tracking claims. Do not draw controls for features that do not exist.

## Final experience and information architecture

### Prepare: one next step at a time

Compact RideWatch header → “Where are you heading?” → a joined pickup/destination field group. Initially, **Use my location** is the primary action. Explain the location request in one sentence. Destination stays visible but disabled with an adjacent reason. Do not display an empty fare receipt or disabled Start Ride at this stage.

After pickup, bring destination search into focus without forcing a permission prompt or surprise keyboard on initial load. Search occupies the content surface; results stay reachable above the virtual keyboard. After selection, show a stable route-loading surface, then route preview, expected duration/distance, official meter estimate and typical reported fare. An “Estimate details” disclosure holds full source/coverage/confidence information; short “Estimate, not a guaranteed fare” and any night surcharge stay visible.

Offer “Add vehicle number · Optional” as an expandable row after the estimate, before the final action. Preserve and validate an entered value even when collapsed; expand automatically to reveal a blocking error. **Start ride** becomes the primary action only at the review stage. Its disabled explanation names the missing dependency. Quote refresh uses “Updating estimate…”; if it fails, preserve input and offer the existing retry.

### Active: understand first, act second

Order: compact session header → **current monitoring headline and freshness** → expected-route drawing → destination and original expected duration/distance → reachable **End ride** action. Movement and timing are two quiet text rows below the main status; elevate an exception immediately. Vehicle, timestamps and saved fare belong in “Ride details,” available without leaving the session.

Do not call original duration “time remaining,” or use elapsed time as route progress. No arrival prediction is available. The headline may say “On expected route” only when current reliable monitoring supports it. “Monitoring unavailable” must displace green reassurance when readings are unreliable.

End ride opens a compact confirmation: “End this ride?” / “Monitoring will stop.” Actions: **End ride** and **Keep riding**. Keep the watcher active while this confirmation is open. Only invoke the existing ending workflow on confirmation; then show “Ending ride…” in a stable surface without claiming monitoring continues. On failure, retain the active session, restore monitoring and expose retry. This adds deliberate interaction, not new backend behavior.

### Complete: closure before contribution

“Ride completed,” destination and ended time lead. Say monitoring has stopped; never assert “arrived safely” or GPS-confirmed arrival. Show a compact journey summary and the optional fare question with **Submit fare** and a low-emphasis **Skip**. After submit/skip, **Start another ride** takes primary emphasis. Keep the saved estimate accessible; do not imply the reported fare was stored until the request succeeds. Suppress the report form under the same existing eligibility condition.

### Signature detail: the journey line

A slender evergreen line joins the pickup circle and destination endpoint in the field group. Once a route exists, the same visual language carries into its actual geometry. During the ride, a small fixed status dot alongside “On expected route” communicates the latest confirmed observation. It changes state once per meaningful update, not with an endless pulse.

This is a visual connection between preparation and monitoring, **not a progress bar**. The dot does not move along the route: the aggregate API supplies no current coordinate or route-progress fraction. A neutral broken line and explicit wording replace the reassuring state when freshness or confidence is lost. Text carries the meaning; color and line pattern reinforce it. No invented percent, moving vehicle, radar sweep or safety score.

## Small design system

All values below are proposed tokens, not implemented CSS. Prefer these roles over ad hoc Tailwind colors. No additional visual variant without a demonstrated state it must represent.

### 1. Product principles

One purpose per screen; next action before explanation; uncertainty before reassurance; information before decoration; preserve input on failure; all optional work is visibly optional. A snapshot must reveal the purpose within five seconds without relying on animation.

### 2. Visual direction

Warm neutral canvas, white working surface, evergreen actions and route line. Use grouped rows and typography instead of a box around each fact. Restrained spatial depth belongs only to an overlapping sheet. Keep the brand small enough that the journey leads. No hero section in the functional flow.

### 3. Color roles

| Token | Value | Use |
|---|---|---|
| canvas | `#F5F6F2` | Page/route canvas |
| surface | `#FFFFFF` | Form, sheet, dialog |
| ink | `#172E29` | Headings and primary text |
| muted | `#596761` | Supporting text; not disabled-opacity text |
| line | `#D8DFDA` | Quiet separators and field structure, not the sole focus cue |
| accent | `#176354` | Primary action, route, confirmed status, focus |
| accent-soft | `#EAF3EE` | Selected/reassuring contextual wash |
| caution | `#855400` | Uncertainty, possible deviation, stop/delay notices |
| danger | `#B42332` | Confirmed route deviation, blocking failure, destructive actions if introduced |

Use caution/danger text and a small indicator on the normal surface; no extra warning gradients or color palette. End ride is a deliberate normal action, not a red emergency button. A confirmed deviation is a route warning, never proof of danger. Validate rendered contrast before adoption; token selection is not a contrast audit.

### 4. Typography

One family: `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. No remote font dependency. Use 400/600/700 weights only.

| Role | Size / line height |
|---|---|
| Main status or page title | 28 / 34px; desktop maximum 32 / 38px |
| Section title or primary metric | 22 / 28px |
| Body, input, action | 16 / 24px |
| Supporting label | 14 / 20px |
| Timestamp/source metadata only | 12 / 16px |

Sentence case, short headings, no tracked uppercase slogans. Tabular numerals for distance/time/fares. Let long destination names wrap; full label must be accessible if a compact preview is truncated. Do not put instructions, errors or primary status at 12px.

### 5. Spacing

Scale: **4, 8, 12, 16, 24, 32px**. Mobile horizontal padding 16px; sheet padding 20px is not a new token—use 16 or 24. Group related label/value pairs with 4–8px; groups with 16px; sections with 24–32px. Desktop outer gutters can use multiples of this scale. Preserve hierarchy rather than adding space to every element.

### 6. Radius

**8px** for controls, **20px** for the main sheet/dialog, **999px** for route endpoints/status dots only. Surfaces within the main sheet do not get another radius by default. No pill around every label.

### 7. Elevation

Two levels: flat (`none`) and raised (`0 8px 24px rgb(23 46 41 / 10%)`). Raised is for sheet/dialog overlap only. No shadow on each button, metric or form group. Modal backdrop: ink at 32% opacity; no backdrop blur.

### 8. Icons

Small inline SVG set on a 24px grid, 1.75px stroke, rounded ends. Use only for location, search, back, disclosure, close, status and route endpoints where useful. Every icon-only control needs an accessible label and 48px target. Decorative icons are hidden from assistive technology. Avoid emoji and inconsistent Unicode glyphs as UI icons. No icon beside every metric.

### 9. Buttons

Three treatments only: **primary** filled accent; **secondary** neutral surface with accent text and a boundary; **text** low-emphasis disclosure/skip. One primary purpose per stage. Standard height 52px, minimum target 48×48px. Pending preserves width and uses a verb (“Starting ride…”). Disabled must have adjacent explanatory text; opacity is not the explanation. Destructive color is a semantic exception, not a fourth button family.

### 10. Inputs

Visible labels, 52px minimum height, 16px input text, 8px radius. Pickup and destination share a single structured group. Placeholder is an example, never a label. Use accent border/focus ring rather than color-only validation. Associate errors with fields using `aria-describedby` and `aria-invalid`.

Search keeps the existing debounce/cancellation. Implement a proper combobox/listbox interaction with Up/Down, Enter, Escape, active descendant and announced result count; actual results remain selectable by touch. Do not add combobox roles without implementing the keyboard behavior. Keep the selected place identity until the text changes. Fare input retains rupee label, decimal input mode and bounds; vehicle retains normalization and validation.

### 11. Sheets and modals

One main mobile sheet, visually attached to the route area, participates in document flow. It is not a modal and must not trap focus. Expand details with an explicit button; dragging is never the only way. Avoid nested scroll regions and scroll locking for normal review.

Only confirmation/help overlays use a modal dialog: heading, deliberate initial focus, trapped focus, Escape/close, inert background and focus restoration. Cancel is the safe initial focus for ending. A mobile dialog is bottom-aligned; desktop is centered with maximum width 440px. Do not use a modal to hide a required estimate or error.

### 12. Route canvas and future map overlays

The current app has route geometry but **no basemap renderer, tiles, map authorization or persisted current-position response**. The first implementation should use a small code-native SVG drawing of real `route_geometry`, aspect-ratio preserved and fitted with padding. Label it “Expected route · schematic.” Include labeled start/destination endpoints and an equivalent textual summary. Do not draw fake streets, landmarks or a live position. Handle empty/degenerate geometry with a text fallback; estimates remain usable if the drawing fails.

Before a route exists, avoid a decorative fake map. Use the joined fields and a compact neutral placeholder only while calculation is in progress. A genuine interactive basemap is a separately scoped enhancement, not a prerequisite or a hidden backend task. If added later, attribution remains visible, controls stay above sheet/safe-area edges, fit bounds exclude the overlay, gestures never replace form access, and data/provider permissions are verified first.

### 13. Status indicators

One dominant status, timestamp and two subordinate movement/timing rows. State resolution must use actual existing enums and respect freshness before displaying route reassurance.

| Evidence | Headline/treatment |
|---|---|
| Initial WAITING/UNKNOWN | “Waiting for a reliable location” / neutral; never green by default |
| Error, STALE, UNAVAILABLE, or last update older than existing 30s threshold | “Monitoring unavailable” / caution + reason/retry; previous route result, if shown, labeled “Last known” with its timestamp |
| POOR | “Location signal is weak” / caution; no current route reassurance |
| Fresh GOOD + DEVIATED | “Away from expected route” / danger with factual supporting text |
| Fresh GOOD + POSSIBLE_DEVIATION | “Checking a route change” / caution; do not assert deviation confirmed |
| Reliable route plus PROLONGED_STOP or DELAYED | Elevate “Longer stop detected” or “Taking longer than expected” / caution; route fact remains a subordinate line |
| Fresh GOOD + ON_ROUTE, no stop/delay exception | “On expected route” / accent and visible freshness |
| Legacy ride without validated route | “Monitoring unavailable for this ride” / neutral explanation; keep ending available |

If several exceptions coexist, show the most consequential headline and keep all other active exceptions visible below it; do not hide them in details. GPS uncertainty qualifies route/movement; do not discard independently valid timing information. Unknown is different from normal. Use human wording rather than raw ACTIVE/COMPLETED/UNKNOWN badges.

### 14. Warning and danger

Calm factual statements, no siren or flashing screen. Show what was detected, freshness, and what the rider can verify. Example: “Away from expected route. Check the route with your driver when it is safe to do so.” Never label the driver dangerous, promise intervention, or offer a nonfunctional emergency action. Permission failure offers settings guidance and restart; it does not end the ride.

### 15. Loading

Reserve stable geometry/metric space when calculations begin. Use static neutral skeleton blocks for route metrics and a short status sentence; optional single fade, no perpetual shimmer. Do not put fabricated currency or distance in placeholders. Keep destination and entered vehicle visible. Searching, locating, refreshing estimates, starting, ending and submitting each get distinct truthful text. Do not announce every animation or GPS tick.

### 16. Empty states

Before pickup: the location action and its purpose. Before three search characters: short instruction. No results: preserve query and suggest a landmark. No reported fares: “Not enough local reports yet,” not ₹0. Unsupported official fare area: state coverage, preserve route and existing start eligibility. Missing historical snapshot: “Not recorded,” not a recomputed replacement presented as original.

### 17. Errors

Keep the user's context and the relevant retry beside the failed task. Distinguish permission denied, unavailable position, timeout, search/route/fare failure, ride not found, monitoring interruption and submit failure. Do not show developer instructions (“backend running”) or assume memory storage in production. Rewrite client-facing mapping only where existing response semantics support the claim; otherwise use a truthful generic service-unavailable message. Do not expose raw payloads, coordinates, IDs or AWS error details. A global banner is reserved for a problem affecting the whole screen.

### 18. Motion

150ms for hover/focus/selection, 220ms for a sheet/dialog transition; use opacity and small transforms, no spring bounce. Geometry stays still while a rider reads it. The signature dot may acknowledge one successful observation with a brief opacity transition, without moving or repeatedly pulsing. Honor `prefers-reduced-motion`: instant state changes, no travel animation. Motion cannot be the only status cue.

### 19. Mobile navigation and thumb reach

No bottom navigation bar for two task routes. Compact header and explicit session navigation. Main action dock follows the current stage, includes bottom safe-area padding and has matching content clearance. In normal 390×844 review/active states, the primary action and active status must be visible without scrolling. Longer content and enlarged text may scroll naturally.

When the keyboard opens, keep the focused field/results visible; let the dock enter normal flow or collapse nonessential summary rather than cover inputs. Never force a fixed-height screen. Leaving an active session gets a clear confirmation that monitoring pauses when leaving, with “Keep ride open” as the safe choice. It does not complete the ride or claim to prevent operating-system/browser interruptions. Opening details never navigates away.

### 20. Responsive composition

| Width | Composition |
|---|---|
| 360 / 390 / 430px | Single column; 16px gutters; compact route surface and one attached sheet; reachable action. 390 is primary target. |
| 600–1023px | Wider route surface, readable single content column (max 600px); no cramped two-column form at 768px. |
| 1024px+ | Maximum 1280px workspace; route/context on left, 360–420px panel on right, 32px gap. Active headline above route; action stays in side panel. |

Before route selection, desktop left context stays compact and useful (purpose and pickup/destination relationship), not a giant empty map. Completed desktop uses a concise summary next to the fare contribution. Small-height landscape and 200% zoom revert naturally to scrolling; no clipping to preserve a composition.

### 21. Accessibility

Target WCAG 2.2 AA: 4.5:1 body text, 3:1 large text and meaningful control boundaries/graphics. Focus is a 3px accent outline with 3px offset and must remain visible above docks. Minimum 48px touch targets with spacing. Support 200% text zoom and 320 CSS-pixel reflow; test 360/390/430 explicitly. Include safe-area insets.

Use semantic headings, labels, buttons and links; a skip link reaches main content. Summaries do not depend on color or the SVG. Announce meaningful state transitions politely; announce a new actionable warning once, never every poll or timestamp. Scope live regions narrowly. Restore focus after overlays; preserve focused fields through updates. Test keyboard, reduced motion and a screen reader; automated checks alone are insufficient.

### 22. Rules against generic UI

No marketing hero in the task, stock map, random illustration, gradient heading, glass panels, neon glow, radar, fake analytics, invented safety score, progress percentage, card grid, decorative chart, excessive badges or perpetual pulse. No extra accent per metric. Add a container only when it groups a task or overlaps another surface. Copy uses the rider's language; no “dashboard,” “telemetry,” or deployment details. Real route shape, clear fare provenance and honest observation status provide the product's identity.

## UI implementation plan — ordered by user impact

This is the original implementation sequence, subsequently authorized and implemented on 20 September 2026. Read the installed Next.js guides required by `frontend/AGENTS.md` before modifying frontend code.

| Order | Deliverable / existing files | Acceptance |
|---|---|---|
| 1 | Active hierarchy and truthful status in `components/ride-session.tsx`, `components/live-monitoring.tsx`; stale shell/error copy in `app/layout.tsx`, `lib/api.ts`. Establish minimal tokens in `app/globals.css`. | At 390×844, status/freshness and End ride are initially visible; stale/poor GPS never produces current green reassurance. No changed monitoring cadence or server behavior. |
| 2 | Progressive pre-ride stages in `app/page.tsx`, `components/destination-search.tsx`, `components/route-estimate-card.tsx`, `components/fare-summary.tsx`. | Location → selected destination → route/fare review → optional vehicle → start. Empty fare receipt removed; keyboard search works; stale quote refresh and validation preserved. |
| 3 | Shared expected-route drawing and signature line; responsive shell and one mobile sheet / desktop side panel. Add only small presentational primitives for route/status/actions. | Actual geometry only, labeled schematic, textual fallback, no fake live marker or progress. No basemap service introduced. Test 360/390/430/768/1440 and short landscape. |
| 4 | End/leave confirmations, stable pending states, completion/report hierarchy in session and fare form. | Closing details keeps tracking; leaving/ending has honest consequences; failed end remains recoverable; successful end stops watcher; report/skip still works. |
| 5 | Accessibility, error/empty/loading refinement and offline visual regression fixtures in existing Playwright suite. | Keyboard and screen-reader walkthrough, measured contrast, zoom/reflow, reduced motion, network/GPS failures and clean production build. |

Keep stateful business logic in the existing hooks/API/tracking modules. Do not replace a tested request lifecycle just to match a layout. Presentational extraction should make dependencies clearer, not create a general-purpose component framework.

Regression coverage must retain existing six tests' behavior, updating selectors only when intentional copy changes. Add targeted checks for status priority, freshness, no-data/unsupported fares, long destination labels, search keyboard interaction, modal focus, navigation warning, ending failure, no double submits and horizontal overflow. Use synthetic coordinates and API fixtures only. Capture consistent review/active/uncertain/completed screenshots at the target widths; keep fixture data out of production. Run frontend test, lint, typecheck and build when implementation happens; backend tests only if backend code is subsequently changed.

## Five strongest demo states

| State | What the audience sees | Why it matters |
|---|---|---|
| 1. Ready to start, 390px | Real expected-route shape, destination, duration/distance, distinct official/reported fare, optional vehicle and one Start ride action. | Communicates usefulness and visual restraint in one screenshot. |
| 2. Active and reliably on route, 390px | Prominent route observation, freshness, signature journey line, compact destination and reachable End ride. | The clearest expression of RideWatch's purpose. |
| 3. GPS becomes uncertain | Reassuring state yields to an honest weak-signal/stale message; ride stays active, retry stays clear, no panic styling. | Demonstrates trustworthy interaction, not just an ideal-state mockup. |
| 4. Completed, then fare submitted | Quiet completion, optional contribution, clear acknowledgement and next action. | Shows a complete, pleasant product loop without a dead-end receipt. |
| 5. Desktop route review / active | Spacious route context paired with a focused side panel; the same hierarchy adapts rather than stretches. | Demonstrates responsive design craft without a dashboard. |

Use populated reported-fare fixtures only when explicitly presenting a simulated demo; never imply synthetic reports are real users. Show real live-data mode separately. A missing report range is also a deliberate, polished state. Do not put the raw geometry, precise GPS values or sensitive ride IDs in demo logs.

## Original audit scope and validation boundary

This document supplies the audit, final direction, design tokens, interaction rules, implementation order and demo selection. At the audit stage, app files were unchanged. That browser inspection used mocks and demonstrated the pre-redesign layout/flow only; implementation validation is now recorded separately in UI-QA.md. No user research, real-device testing, new map provider, backend work, deployment or framework migration occurred. Those distinctions should remain explicit when presenting the design.
