# Final UI/UX audit — 20 September 2026

DESIGN.md remained the visual source of truth. This pass changed frontend presentation only: no new product features, backend behavior, libraries or API contracts.

## Screenshot review

The running Next.js UI was captured using Chromium and deterministic GPS/API fixtures. Required sizes were 390×844, 430×932 and 1440×900; the main journey also ran at 768×1024. Both viewport and full-page images were retained. The final archive contains 73 viewport images plus their full-page counterparts at `dist/final-ui-audit/after/index.html`. Baseline images remain in `dist/final-ui-audit/before`.

Five review priorities were applied to each screen family and its viewport variants. Existing treatments that passed were preserved rather than inventing defects to justify changes.

| Screens | Five most noticeable review priorities | Result |
|---|---|---|
| Pickup, search results, empty search | Promotional copy; mobile gutter alignment; title hierarchy; input focus; result wrapping | Replaced promotional copy with short task instructions and aligned context with sheet content. Preserved visible focus and comfortable result targets. |
| Route summary, fare loading, route loading | Vague review title; orphaned fare copy; oversized desktop drawing; heavy route stroke; competing supporting text | Added a direct review title, shortened unavailable-fare copy, reduced desktop drawing height, stabilized stroke weight and tightened supporting copy. Loading remains explicit. |
| Vehicle entry and validation | Disclosure label alignment; optional metadata weight; acceptance terminology; input/error proximity; action visibility | Aligned the label and optional metadata, quieted metadata and used “Number ready.” Preserved nearby errors and normal-flow actions while editing. |
| Starting and initial live session | Repeated waiting text; empty status rows; premature restart action; persistent route context; primary-action clarity | Removed empty/repeated information and deferred restart until a recoverable issue exists. Retained route continuity and disabled pending actions. |
| Reliable, poor-signal, unavailable and deviation states | Long metadata prefix; distant desktop label/value pairs; excessive warning color; route dominance; guidance length | Shortened update metadata, constrained status facts, kept danger emphasis on the deviation heading and shortened guidance. Uncertainty still takes precedence over reassurance. |
| End/leave confirmation, ending | Dialog hierarchy; button distinction; text wrapping; focus containment; continuity during saving | Preserved the already consistent dialog treatment and keyboard behavior. Shortened surrounding action guidance; retained expected-route context while saving. |
| Completed, fare submitted/skipped | Repetitive closure copy; excess desktop top spacing; value hierarchy; optional-form prominence; return-action clarity | Shortened closure copy and tightened desktop spacing. Preserved destination/metrics hierarchy and clear next actions. |

The second screenshot pass exposed remaining noise in the first live reading and too much red in deviation guidance. Those were corrected and the screenshots regenerated. No obvious alignment, horizontal overflow, clipping or inconsistent component styling remained in the inspected states. Longer screens intentionally scroll; fixed actions remain reachable.

## Strongest 60–90-second demo

1. 0–10 seconds: open RideWatch and confirm pickup.
2. 10–25 seconds: type and select a destination using the existing search.
3. 25–40 seconds: review the expected route, distance, duration and distinct fare estimates.
4. 40–50 seconds: optionally enter the vehicle number and show its accepted state.
5. 50–65 seconds: start the ride; show waiting becoming a reliable live reading.
6. 65–80 seconds: in the clearly identified fixture/demo environment, show the existing deviation state and calm guidance.
7. 80–90 seconds: confirm ending and show completion.

## Verification

- Playwright: all 19 tests passed, covering original regressions, keyboard interaction, state transitions, errors and responsive captures.
- Frontend lint, TypeScript checking and production build passed.
- No new animation or dependency was introduced. Existing reduced-motion handling remains covered.
- Actual rendered UI was inspected; GPS and server data in these captures are synthetic. Production AWS integration, physical-device keyboards/GPS and screen-reader software were not exercised.
- The route remains an expected-route schematic by design, without a basemap or invented live position.
