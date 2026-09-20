# RideWatch

Booking-independent ride safety companion for India.

## Local development and deployment readiness

The deployment files are prepared, but **no Lambda/API Gateway/Amplify deployment has been performed**. Real DynamoDB persistence has been manually verified by the project owner. Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the ordered Console/CLI runbook, IAM templates, packaging, production CORS and verification.

| Local | Production target |
|---|---|
| Next.js on localhost | Amplify Hosting over HTTPS |
| FastAPI through Uvicorn | API Gateway HTTP API → Lambda → Mangum → same FastAPI app |
| Optional AWS_PROFILE from backend/.env | IAM execution role; no configured AWS_PROFILE/access keys |
| Memory by default, or DynamoDB | DynamoDB required |
| localhost CORS origin | Exact Amplify HTTPS origin in CORS_ORIGINS |

FastAPI is the single CORS owner; API Gateway CORS should remain unconfigured. `NEXT_PUBLIC_API_URL` must be supplied at Amplify build time. Lambda provides AWS_REGION automatically and ignores local dotenv/profile settings. `/health` stays independent of AWS services.

Build a Linux/Python 3.12/x86_64 ZIP locally with `.\scripts\build-lambda.ps1`; the handler is `app.lambda_handler.handler`. No Docker or deployment is performed by the build. The ZIP excludes local configuration, credentials, tests and caches. The frontend keeps Next.js 16 and uses standalone output plus Amplify's explicit deployment specification; see the compatibility notes in the runbook before the first real deployment.

Initial pickup now uses network-assisted geolocation (`enableHighAccuracy=false`, 25-second timeout, 60-second maximum cached age) to improve desktop acquisition. Live monitoring retains high-accuracy watchPosition, and GPS drop capture retains its existing behavior. Production browser location requires HTTPS; localhost remains supported for development.

## Problem and current MVP
Street-hailed autos, local taxis and directly negotiated rides often happen outside booking apps. RideWatch records a starting point, destination and optional vehicle number before getting in.

This MVP includes browser geolocation with error handling, normalized vehicle numbers, Amazon Location destination search and traffic-aware road estimates, and creating, viewing and completing ride sessions. Active rides with validated route quotes include live GPS monitoring for deviation, prolonged stops and excessive delay. These are informational signals, not emergency response. Auto fare estimation separates the official Telangana meter estimate from aggregated fares reported after completed rides.

## Architecture
Next.js App Router + TypeScript + Tailwind CSS → FastAPI routes → domain services → repository interfaces → memory or DynamoDB.

The application factory makes one storage decision from `STORAGE_BACKEND`, defaulting to `memory`. Rides, fare reports, route quotes, fare quotes and minimal monitoring state have injectable repositories. DynamoDB mode shares durable state between restarts and instances; memory mode remains isolated to one process. Completion is atomic and repeated requests preserve the original end timestamp and drop. AWS clients initialize lazily; startup, health and automated tests do not make AWS calls.

In-memory sessions disappear on restart and are not shared across processes. Use one backend worker in memory mode. DynamoDB mode supports shared state but still has no authentication; this remains a development prototype.

## Project structure
```text
ridewatch/
├── README.md
├── .gitignore
├── backend/
│   ├── .env.example
│   ├── requirements.txt
│   ├── requirements-lock.txt
│   ├── pytest.ini
│   ├── app/
│   │   ├── main.py
│   │   ├── api/rides.py
│   │   ├── api/location.py
│   │   ├── location/base.py
│   │   ├── location/amazon_location.py
│   │   ├── schemas/location.py
│   │   ├── core/config.py
│   │   ├── models/ride.py
│   │   ├── schemas/ride.py
│   │   ├── repositories/ride_repository.py
│   │   └── services/ride_service.py
│   └── tests/
│       ├── conftest.py
│       ├── test_rides.py
│       └── test_location.py
└── frontend/
    ├── .env.example
    ├── package.json
    ├── package-lock.json
    ├── app/
    │   ├── globals.css
    │   ├── layout.tsx
    │   ├── page.tsx
    │   └── ride/[rideId]/page.tsx
    ├── components/ride-session.tsx
    ├── components/destination-search.tsx
    ├── components/route-estimate-card.tsx
    ├── lib/use-route-estimate.ts
    ├── lib/api.ts
    ├── eslint.config.mjs
    ├── next.config.ts
    ├── postcss.config.mjs
    └── tsconfig.json
```
Python package markers and generated framework files are omitted above.

## Local setup
Requires Node.js 20.9+ and Python 3.11+. Run these from the workspace in two PowerShell terminals.

Backend:
```powershell
cd C:\Users\eshum\OneDrive\Desktop\AWS\ridewatch\backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --no-access-log
```
The virtual environment is already installed in this workspace. Use `requirements-lock.txt` instead for the exact tested dependency versions.

Frontend:
```powershell
cd C:\Users\eshum\OneDrive\Desktop\AWS\ridewatch\frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```
Open http://localhost:3000. API docs: http://localhost:8000/docs. Environment copies are optional with default local settings; preserve existing customized files.

On macOS/Linux use `python3`, `.venv/bin/python`, `cp`, and `npm` for their Windows equivalents.

Geolocation needs browser permission and a secure context; localhost works. HTTP LAN addresses on phones generally do not. Location is requested on the starting-location button, via watchPosition while a monitored active ride page is open, and when ending a ride. It is sent to the backend for search bias, routing and ride creation. Search and route requests forward relevant coordinates to Amazon Location Service.

`NEXT_PUBLIC_API_URL` configures the browser API URL; restart/rebuild after changing it. `CORS_ORIGINS` is a JSON array of frontend origins, defaulting to localhost:3000. Never put secrets in public frontend variables.

## Frontend commands
From `frontend`:
```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd run start
```
`start` serves the production build. Lint is separate from build, as described in the [Next.js installation guide](https://nextjs.org/docs/app/getting-started/installation).

## Backend commands and tests
From `backend`:
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000 --no-access-log
.\.venv\Scripts\python.exe -m pytest -q
```
Tests cover health, create/fetch, missing rides, completion and repeated completion, invalid destination and coordinates, vehicle normalization/validation, and CORS.

## API
| Method | Path | Result |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/api/places/search?q=station&lat=17.44&lng=78.49` | Up to five resolved Indian destinations |
| POST | `/api/route-estimate` | Traffic-aware quote, geometry, duration and expiry |
| POST | `/api/rides/{ride_id}/locations` | Accept GPS sample and return aggregate monitoring |
| GET | `/api/rides/{ride_id}/monitoring` | Current aggregate state, no GPS trail |
| POST | `/api/rides/{ride_id}/share` | Create a temporary private-link bearer token |
| GET | `/api/share/{token}` | Read-only shared trip status and latest location |
| DELETE | `/api/share/{token}` | Revoke a shared trip link |
| POST | `/api/fare-estimate` | Official and optional aggregated reported fares |
| POST | `/api/rides/{ride_id}/fare-report` | Optional completed-ride fare report (201; duplicate 409) |
| POST | `/api/rides` | Create ACTIVE ride (201) |
| GET | `/api/rides/{ride_id}` | Fetch ride (404 if missing) |
| PATCH | `/api/rides/{ride_id}/end` | Complete ride (404 if missing) |

Example create body:
```json
{"start_lat":17.0,"start_lng":78.0,"destination":"Secunderabad Railway Station","destination_lat":17.433,"destination_lng":78.501,"expected_distance_km":9.2,"expected_duration_minutes":31,"vehicle_number":"TS09AB1234"}
```
Vehicle number may be omitted or null. Format checks accept conventional and Bharat-series registrations and do not verify registration ownership. Invalid input returns 422. Responses include `id`, input fields, `status`, UTC `started_at` and nullable `ended_at`.

## Planned AWS architecture
- Frontend → AWS Amplify Hosting
- API → Amazon API Gateway
- Compute → AWS Lambda
- Ride sessions → Amazon DynamoDB
- Images / vehicle scans → Amazon S3
- Async safety events → Amazon EventBridge
- AI features later → Amazon Bedrock where appropriate

The Lambda ASGI adapter, ZIP builder, Amplify build configuration and configurable CORS are now prepared. DynamoDB repositories are implemented; memory storage is unsuitable for Lambda and is rejected there. Cloud resources still require deliberate manual provisioning and deployment using the deployment runbook.

Later increments include authentication, OCR, provider-backed emergency escalation and deployment.

## Emergency assistance and private live sharing

Active rides offer a user-initiated emergency panel with `tel:112`, Web Share/copy fallback, one-tap SMS broadcasting, and manual WhatsApp handoff for up to three trusted contacts. Calls remain manual. Trusted-contact names and phone numbers stay in versioned browser `localStorage` until the user confirms **Send SOS**. That request sends only the phone numbers needed for the current dispatch; the backend does not persist or log them.

Automatic SMS is off by default. Set `SMS_PROVIDER=aws`, `PUBLIC_APP_URL` to the exact HTTPS Amplify origin, and configure the AWS End User Messaging origination identity or other account-level sending setup required for the destination countries. `SMS_DRY_RUN=true` passes AWS dry-run mode through without changing application behavior. `SMS_ORIGINATION_IDENTITY` and `SMS_CONFIGURATION_SET` are optional. For India, configure `SMS_INDIA_ENTITY_ID` and `SMS_INDIA_TEMPLATE_ID` together; startup rejects an incomplete pair. The runtime role needs only `sms-voice:SendTextMessage` for SMS delivery in addition to the existing permissions.

`POST /api/rides/{ride_id}/sos` accepts one client-generated UUID and one to three unique E.164 phone numbers. Each request creates a live-share link and sends a transactional message independently to every number. A five-minute `SOS_DISPATCH` idempotency record stores only the request ID, ride ID, counts, creation time, and DynamoDB TTL. It never stores phone numbers, contact names, or message bodies. Repeating the UUID does not send the messages again. Responses report requested, sent, and failed counts so partial delivery remains visible.

Live sharing creates a random 256-bit bearer token. DynamoDB stores only its SHA-256 hash in `pk=share#<hash>`, the ride ID, creation/expiry/revocation timestamps, entity type, and `ttl`; links expire within 24 hours and completed rides have a one-hour grace period. The monitoring item stores only the latest accepted latitude, longitude, accuracy, and receipt time, replacing it on each accepted update. Completion deletes monitoring state, so no GPS trail or post-ride live location is retained.

The public `/share/<token>` page polls only `GET /api/share/{token}` while active. It never requests viewer geolocation, posts monitoring samples, ends rides, or exposes rider controls. Anyone holding the bearer URL can view its limited trip data until revocation or expiry; this MVP still has no rider authentication, so protect the link and stop sharing when it is no longer needed.

## Real route estimation

```text
Browser
   ↓
Next.js
   ↓
FastAPI
   ↓
LocationProvider (injectable)
   ↓
Amazon Location Service
   ├── Places: SearchText
   └── Routes: CalculateRoutes
```

Search requires the user's starting location: the destination field is disabled until it is available, with an explanatory message. It then waits 400 ms after typing at least three characters and returns up to five India-filtered destinations. Selecting a suggestion supplies coordinates; arbitrary text does not trigger routing. Editing clears the selection and estimate. Requests are cancellable, stale responses are ignored, and failures offer retries. The UI requires a successful estimate before starting a ride.

The backend uses current boto3 `geo-places` and `geo-routes` clients. [SearchText](https://docs.aws.amazon.com/boto3/latest/reference/services/geo-places/client/search_text.html) resolves text directly to coordinates; no additional GetPlace or Geocode call is needed. `GET /api/places/search` requires both `lat` and `lng`, returning 422 if either or both are missing. The adapter always supplies `BiasPosition=[lng, lat]`, alongside `IncludeCountries=["IND"]` and `IntendedUse="Storage"`. There is no hard-coded fallback coordinate.

[CalculateRoutes](https://docs.aws.amazon.com/boto3/latest/reference/services/geo-routes/client/calculate_routes.html) uses `TravelMode="Car"`, `OptimizeRoutingFor="FastestRoute"`, `MaxAlternatives=0`, `DepartNow=True`, `Traffic={"Usage": "UseTrafficData"}` and `LegGeometryFormat="Simple"`. AWS coordinates are longitude first. Summary meters become kilometers; seconds round up to minutes. Exact seconds and road geometry are preserved for monitoring. Zero-length/unusable routes produce a safe error. Car routes may differ from auto-rickshaw routes. Values are estimates, not guarantees.

Rides store `destination_lat`, `destination_lng`, `expected_distance_km` and `expected_duration_minutes`. Coordinates must be in range, distance finite and positive, and duration a positive integer. Older API clients may omit all four; partial bundles are rejected. The updated UI sends the full bundle and `route_estimate_id`, validated against the exact server quote. Legacy rides without a quote retain informational route fields but cannot enable monitoring. Completion stores a GPS drop or destination fallback, and rides retain an immutable fare snapshot.

## AWS configuration

Configuration lives in `backend/.env`; a safe sample is in `backend/.env.example`:
```dotenv
CORS_ORIGINS=["http://localhost:3000"]
AWS_PROFILE=ridewatch
AWS_REGION=ap-south-1
AWS_PAGER=
LOCATION_PROVIDER=aws
```
Pydantic Settings loads this file automatically regardless of working directory. Process variables take precedence. The lazy boto3 session explicitly uses the configured profile and region. Omit `AWS_PROFILE` to use the normal credential chain; omit `AWS_REGION` to use SDK region resolution. Only `LOCATION_PROVIDER=aws` is supported.

Keep credentials in standard AWS files (`$HOME/.aws/credentials` and `$HOME/.aws/config`), SSO, or workload credentials. Never add access keys, secret keys or session tokens to `.env`. If using SSO, configure your profile externally and refresh with `aws sso login --profile ridewatch` when required.

From the project root, start the backend:
```powershell
.\scripts\start-backend.ps1
```
This loads `backend/.env` and runs the backend virtual environment's `python -m uvicorn app.main:app --reload --port 8000 --no-access-log`. Direct Uvicorn startup also loads application settings automatically.

For manual AWS CLI commands, dot-source this once per new PowerShell terminal:
```powershell
. .\scripts\load-env.ps1
$env:AWS_PROFILE
$env:AWS_REGION
$env:AWS_PAGER
```
Expected values: `ridewatch`, `ap-south-1`, and empty. You no longer need the three individual assignments. Python cannot modify its parent terminal, so manual CLI use still needs the helper. It supports blank lines, full-line comments, normal assignments, empty values and matching outer quotes, without executing or expanding values. Older PowerShell/.NET may remove empty variables; use `aws ... --no-cli-pager` if the CLI still enables its configured/default pager.

Copy the example to `.env` if absent; preserve existing customizations. `.env` is ignored by Git. If you change regions, update the IAM ARNs below.

The backend identity needs the two Location permissions below. DynamoDB mode additionally needs the table-scoped statement. Replace `ACCOUNT_ID` and the table name/region to match your configuration; this is a combined example, not a policy applied by the application:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "geo-places:SearchText",
      "Resource": "arn:aws:geo-places:ap-south-1::provider/default"
    },
    {
      "Effect": "Allow",
      "Action": "geo-routes:CalculateRoutes",
      "Resource": "arn:aws:geo-routes:ap-south-1::provider/default"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
        "dynamodb:Scan",
        "dynamodb:ConditionCheckItem"
      ],
      "Resource": "arn:aws:dynamodb:ap-south-1:ACCOUNT_ID:table/ridewatch-dev"
    }
  ]
}
```

The Location ARNs intentionally have no account ID; the DynamoDB ARN must include your account ID. Sources: [Places IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-places.html), [Routes IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-routes.html) and [DynamoDB transactional IAM](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html). Transactions authorize their underlying Put/Delete/ConditionCheck operations: there is no separate `dynamodb:TransactWriteItems` IAM permission to add. `UpdateItem` is not used. Table creation/TTL administration require separate provisioning permissions, not runtime permissions. No place index, route calculator, API Gateway or Lambda resource is required. Live AWS requests incur applicable usage charges.

## Testing without AWS

Run the pytest command above. Tests inject `FakeLocationProvider` through `create_app(location_provider=...)`. Adapter tests use botocore Stubber with dummy credentials to validate SDK request shapes, coordinate ordering, unit conversion and failures. An autouse fixture blocks botocore network transport across the entire suite. No real AWS API requests occur.

Clients initialize lazily, so startup and `/health` work without credentials. Search/route failures return sanitized 503 messages; logs contain only operation and exception class, not credentials, destinations or raw AWS exception text. No fake success response replaces a failed AWS call.

Verified locally: backend tests, frontend lint/typecheck/build, and a mobile Chromium flow with intercepted test API responses covering debounce, selection, stale search cancellation, retries, ride creation and completion. Places and Routes were previously manually verified with real credentials by the project owner. This increment is verified offline; the new traffic/geometry request should also be manually checked with the existing profile. After setup, allow geolocation at localhost:3000, select a destination, check the estimate, start the ride and end it. Nothing has been deployed.


## Fare estimation

**Official meter estimate** → deterministic Telangana tariff. **Typical reported fare** → aggregated fares from completed RideWatch journeys. These are separate values; crowdsourced fares are not official or guaranteed quotes. Estimates improve as more completed rides are reported. A fresh backend has **zero fare reports**, so typical fares initially show “Not enough local data yet”. No seeded pricing or city-wide fare buckets are used.

### Official tariff and coverage

The [Telangana Transport fare chart](https://transport.telangana.gov.in/html/permits-contractcarriage-autorickshaw-farechart.html) links [G.O.Ms.No.20, dated 14 February 2014](https://www.transport.telangana.gov.in/html/pdf/go-ms-no-20-dated-14-02-2014.PDF). This is the published rule used here; proposed revisions are not activated. `TelanganaAutoRule` in `backend/app/fares/telangana.py` holds the tariff, effective date and source. Replace or inject this rule/provider when a newer official notification is adopted.

The estimate uses ₹20 for the first 1.6 km, then ₹11/km. At 9.2 km this is ₹103.60, rounded half-up to ₹104. A 1.5× multiplier applies from 23:00 inclusive to 05:00 exclusive in **Asia/Kolkata**, independent of the server timezone. The provider accepts an aware timestamp for deterministic tests; API estimates use current time. Waiting is configured at ₹0.50/minute but excluded because route duration is not waiting time. Luggage is also excluded. This is a continuous-distance estimate rounded once, not an emulation of the physical meter's distance ticks.

This increment covers Hyderabad / Secunderabad only. `SupportedArea` conservatively limits both endpoints to latitude 17.2–17.6 and longitude 78.2–78.7. This configurable rectangle is an MVP coverage boundary, not a city/legal boundary; journeys outside it receive `supported: false` and null fare values, while existing routing and ride creation still work. No other state tariffs are implemented.

### Matching and robust aggregation

`FareService` delegates official calculations to `FareProvider` and matching to `fares/matching.py`. `MatchingRules` contains all matching thresholds:

- Primary: pickup within **200 m**, drop within **200 m**, and route distance within **±15%** of the new expected distance (inclusive).
- Fallback: expand both radii to **500 m** with the same distance filter if the primary tier has too few usable samples. The wider tier includes the narrower tier; samples are not duplicated.
- Both endpoints use Haversine great-circle distances. Pickup and drop are directional; reverse trips do not automatically match.
- Require **5 samples after filtering**. Otherwise `typical_reported` is null, with no fabricated fallback.
- With at least 8 candidates in a tier, remove values outside Q1 − 1.5×IQR to Q3 + 1.5×IQR. With fewer candidates, use them directly. A zero IQR keeps values in the identical central range. Recheck the minimum after filtering, then try the wider tier if necessary.
- Calculate P25, median and P75 with linear interpolation at `(n - 1) × percentile`; round half-up to whole rupees. Show P25–P75 as the typical range. `sample_count` is the retained count.
- Confidence is MEDIUM for 5–9 samples within 200 m, HIGH for 10+ within 200 m, and LOW for any 500 m fallback. Confidence describes matching relevance, not a guaranteed fare.

MVP reports use the ride's **original expected route distance and duration**; GPS drop capture does not trigger another AWS route request or measure actual travelled distance. Matching does not yet stratify by time of day, vehicle type or report age. These limitations can affect relevance.

### API, snapshots and completion

`POST /api/fare-estimate` accepts `distance_km`, `duration_minutes`, `start_lat`, `start_lng`, `destination_lat`, and `destination_lng`. It returns INR, `official_meter`, nullable `typical_reported`, `supported`, and an opaque `estimate_id`. No historical coordinates are returned by estimation or reporting endpoints.

The browser requests fares after Amazon Location supplies the route. Requests are cancellable and stale responses are ignored. Fare failures have their own retry button. Creating a ride passes `fare_estimate_id`; the backend checks it against the exact route and stores the corresponding immutable **nested `fare_estimate` snapshot**, including source, night flag, range, median, count, radius and confidence. New reports arriving between quote and creation do not change it. Active/completed pages render this snapshot without recalculation. Quotes and rides use the configured repositories; an unknown, expired or mismatched quote returns 409 and needs a refreshed estimate. Older API clients can omit the ID: a snapshot is calculated at creation when route data is available, or null for legacy text-only rides.

`PATCH /api/rides/{ride_id}/end` still accepts no body. Optionally send `{ "drop_lat": 17.4337, "drop_lng": 78.5018, "drop_location_source": "GPS" }`. The UI attempts current GPS with a bounded wait of at most 8 seconds; failure uses the stored destination and marks `DESTINATION_FALLBACK`. Completion remains atomic and repeat calls preserve the original end time, drop and fare snapshot.

After completion, users can submit or skip an optional fare. `POST /api/rides/{ride_id}/fare-report` accepts `{ "fare_paid": 210 }`, using the stored drop, or accepts an explicit GPS coordinate pair and source. Destination fallback is resolved server-side from stored coordinates. Fares must be finite, positive and at most ₹10,000; they need not resemble the official fare. Invalid inputs return 422, missing rides 404, active rides or rides without route/drop data 409. Atomic insert rejects a duplicate with 409. The response is only a receipt (`ride_id`, `fare_paid`, `reported_at`).

### Storage, privacy and future scale

`FareReportRepository` abstracts `save`, `list_all`, and `get_for_ride`. The application factory selects `InMemoryFareReportRepository` by default or `DynamoDBFareReportRepository` in DynamoDB mode; tests can inject repositories and providers. Memory-mode reports, quote IDs and ride snapshots disappear after a backend restart; use one worker in that mode. DynamoDB mode retains them and supports multiple backend instances. Its paginated, entity-filtered Scan preserves the existing 200 m / 500 m matching algorithm and is an MVP scaling limitation.

Historical matching coordinates stay internal to the report repository; there is no report listing API or UI showing individual riders or their precise pickup/drop history. Only aggregate statistics are shown to other journeys. Existing ride-detail endpoints remain unauthenticated and accessible by ride ID in this local prototype; do not treat this as production access control. Production should add access controls, retention limits, aggregation and geospatial bucketing/anonymization to reduce precise-coordinate storage and disclosure.

```text
Completed ride
      ↓
User optionally reports fare
      ↓
Fare sample stored
      ↓
Pickup/drop proximity matching
      ↓
Robust aggregation
      ↓
Better typical fare estimate
```

For production scale, replace full Haversine scans with H3 or another geospatial aggregation strategy: exact coordinates → geospatial cell → pickup cell / destination cell → aggregated fare statistics. H3, ML, booking-app scraping and deployment are deliberately not included.

Fare tests run fully offline with fixed coordinates and synthetic test fixtures, never seeded into the application. `backend/tests/test_fares.py` covers tariff/timezone boundaries, validation, Haversine, both tiers, distance tolerance, percentiles, IQR, report lifecycle, concurrency and immutable snapshots. Existing AWS fake-provider/Stubber tests remain in place.

## Traffic-aware live monitoring

Amazon Simple LineStrings are converted from **[longitude, latitude]** into named latitude/longitude objects. Adjoining legs share one endpoint, which is not duplicated. Empty, invalid, degenerate or disconnected geometry returns a sanitized 503 instead of inventing a road segment.

Route quotes contain `route_estimate_id`, `calculated_at`, `expires_at`, `traffic_aware`, `route_geometry`, `distance_km`, `duration_minutes`, and `duration_seconds`. They use the configured repository and are copied into the ride as `expected_route`. Ride creation validates the opaque ID against both endpoints and displayed distance/duration. Forged geometry or other unexpected create fields return 422. Expired, missing or mismatched quotes return 409 with a refresh message. The browser automatically refreshes quotes within 10 seconds of expiry before starting and refreshes the fare quote alongside them. Fare snapshots remain immutable; route duration is never charged as waiting time. Old clients can create rides without a quote, but live monitoring is unavailable for them.

`ROUTE_ESTIMATE_MAX_AGE_SECONDS=300` configures quote freshness in `backend/.env`. Expiry is inclusive at 300 seconds. Existing rides keep their baseline even after the quote expires; AWS is not called continuously during rides. Current traffic can change after departure, and legitimate detours, congestion and GPS errors can produce misleading signals.

### Sampling and thresholds

`backend/app/services/monitoring_service.py` defines the injectable `MonitoringRules` dataclass:

| Rule | Default |
|---|---|
| Browser and server accepted-update interval | At least 5 seconds; first sample immediately |
| Input accuracy | Finite, greater than 0 and at most 10,000 m |
| Good GPS | Accuracy ≤100 m |
| Off-route threshold | Minimum segment distance >150 m + reported accuracy |
| Deviation confirmation | 3 consecutive good off-route samples |
| Recovery from deviation | 2 consecutive good on-route samples |
| Stop movement radius | Less than 30 m from a stationary anchor |
| Prolonged stop | At least 180 seconds of reliable stationary readings |
| Stop-specific accuracy | ≤30 m; worse readings cannot prove lack of movement |
| Maximum reliable sample gap | 30 seconds; longer gaps reset accumulated evidence |
| Excessive delay | Elapsed seconds > exact traffic duration ×1.5 +300 seconds |
| GPS history buffer | None; only the current stop anchor is retained |

Route distance is the minimum distance to **segments**, not vertices, of the actual Amazon road polyline, using a local equirectangular projection centered on the GPS sample. This approximation is intended for city-scale routes, not polar or worldwide paths. A first off-route point produces POSSIBLE_DEVIATION, not DEVIATED. Poor GPS resets consecutive evidence and reports POOR/UNKNOWN, not a safety incident. Movement of at least 30 m resets the stop anchor and clears a stop; missing or imprecise samples cannot count toward the stop timer. MOVING means no prolonged stop has been established, not proof of continuous movement.

`POST /api/rides/{id}/locations` accepts only `{ "latitude": 17.44, "longitude": 78.50, "accuracy_m": 10 }`. The backend assigns receipt time; client timestamps are rejected. Samples arriving faster than 5 seconds return the current aggregate without changing evidence. Unknown rides return 404; completed rides and legacy rides without validated geometry return 409. Malformed/nonfinite/out-of-range fields return 422. The response contains only `ride_id`, `gps_status`, `route_status`, `distance_from_route_m`, `stop_status`, `delay_status`, and `last_updated_at`. There is no trail endpoint. `GET /api/rides/{id}/monitoring` recalculates elapsed delay and marks old GPS STALE; completed rides return 409.

The UI uses one `navigator.geolocation.watchPosition` with high accuracy, maximumAge=5000 and timeout=10000, and permits only one location request in flight. It polls aggregate monitoring every 10 seconds so delay and stale readings remain visible when GPS is silent; this does not call AWS. Permission denial, unsupported browsers, timeout, poor signal and backend errors leave the ride active and offer restart. Ending a ride first unmounts the watcher and aborts pending sends; completion failure restarts monitoring. Existing bounded GPS drop capture, destination fallback and optional fare reporting remain intact. Navigating away also clears the watcher.

Keep the active page open, with location permission enabled, over localhost or HTTPS. Mobile browsers may suspend GPS in the background or when the screen locks. This is not background tracking and not an emergency guarantee. SOS SMS delivery depends on the configured AWS End User Messaging account and destination rules; calling and WhatsApp remain manual. There is no push notification or automatic rerouting. A map visualization is future work; geometry is available for it.

### Privacy and storage

Quotes, ride snapshots and minimal monitoring state use the selected storage backend. Memory mode loses all data on restart. DynamoDB mode persists ride endpoints/expected geometry, fare reports, quotes and one stop anchor plus aggregate monitoring/counters/timestamps. The unused recent-sample buffer has been removed. There is no GPS trail, per-sample item or history endpoint. Monitoring is deleted on completion and inaccessible for completed rides. Coordinates are not logged; DynamoDB receives only the documented persistent records, and Amazon Location receives necessary search/routing coordinates. The existing ride-detail API still exposes pickup/destination to anyone with a ride ID: this unauthenticated prototype is not production access control.

Production requires authentication/authorization, explicit consent, retention rules, encryption, access controls and deletion policies. Configure AWS End User Messaging registrations, origination identity and the exact public Amplify origin before enabling automatic SMS.

### Repeatable offline verification

From `backend`, run `.\.venv\Scripts\python.exe -m pytest -q`. The test clock advances directly, without sleeping or real AWS calls. Stubber verifies AWS traffic/geometry parameters and coordinate ordering; monitoring tests cover segment distance, confirmation/recovery, uncertainty, stop/resume/gaps, delay boundaries, quote attachment/expiry/mismatch, tampering, validation and completion cleanup. `tzdata` supplies Kolkata timezone data on Windows for the existing fare tests.

From `frontend`:

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

Playwright starts an isolated frontend on port 3100, intercepts API calls and simulates browser GPS. Tests cover stale quote refresh, destination search → fare → start → GPS state → end → fare report, poor GPS, permission denial, restart/unmount cleanup, send throttling, network failure and late-response cancellation. No physical driving or AWS credentials are needed. Test reports contain synthetic fixtures only.

### Manual check with the existing AWS profile

Preserve the existing `backend/.env` (`AWS_PROFILE=ridewatch`). In two PowerShell terminals:

```powershell
cd C:\Users\eshum\OneDrive\Desktop\AWS\ridewatch
.\backend\.venv\Scripts\python.exe -m pip install -r .\backend\requirements.txt
.\scripts\start-backend.ps1
```

```powershell
cd C:\Users\eshum\OneDrive\Desktop\AWS\ridewatch\frontend
npm.cmd ci
npm.cmd run dev
```

Open http://localhost:3000, allow location, select a destination, check traffic-aware distance/duration and fare, then START RIDE. Keep the page open and check GPS/route/movement/timing and the latest update time. Browser developer tools can simulate a location on the returned route or three off-route readings separated by at least five seconds; no driving is required. END RIDE and submit or skip the fare. Denying location should show monitoring unavailable without ending the ride. For an SSO profile only, refresh its session separately using `aws sso login --profile ridewatch` if necessary. The new traffic/geometry request has been tested offline and should also be manually checked with the existing profile. No deployment, commit or push is part of this increment.

## Persistence: memory or DynamoDB

`STORAGE_BACKEND=memory` remains the recommended default until a table has been provisioned manually. No table is created, inspected or contacted on application import or `/health`. DynamoDB clients are initialized on first storage operation using the configured `AWS_REGION` and optional `AWS_PROFILE`. When the profile is absent, boto3 uses its normal credential chain; a future Lambda deployment can use its execution role without local profile files. No access-key settings are added.

`app/repositories/storage.py` makes the storage choice once. Existing `RideRepository` and `FareReportRepository` contracts remain; new `RouteQuoteRepository`, `FareQuoteRepository` and `MonitoringStateRepository` abstractions have memory and DynamoDB implementations. `create_app` accepts individual repository overrides, settings, a fake DynamoDB client, providers and a clock for deterministic tests. A custom ride repository can be paired with its own monitoring repository when it requires different concurrency semantics.

Fare quotes are persisted in addition to route quotes because the existing start-ride flow submits `fare_estimate_id`: keeping that ID process-local would still break when estimate and start requests reach different instances. Both quote types expire after `ROUTE_ESTIMATE_MAX_AGE_SECONDS` (300 by default). Fare snapshots already attached to rides remain immutable and do not expire.

### Single-table schema and retained data

The configured table has **one string partition key `pk`, no sort key and no indexes**. Billing mode is PAY_PER_REQUEST. Every item contains `entity_type` and a nested `data` map. Storage attributes are never added to API responses.

| pk | entity_type | data and additional attributes |
|---|---|---|
| `ride#{ride_id}` | `RIDE` | Complete ride: UUID, pickup/destination, vehicle, status, start/end timestamps, expected distance/duration, route ID, expected geometry/traffic baseline, immutable fare snapshot and drop information |
| `fare-report#{ride_id}` | `FARE_REPORT` | One completed-ride report with pickup/drop, route distance/duration, amount and report time |
| `route-quote#{route_estimate_id}` | `ROUTE_QUOTE` | Original route request and complete route estimate, including geometry, exact seconds, calculation/expiry timestamps; numeric `ttl` |
| `fare-quote#{fare_estimate_id}` | `FARE_QUOTE` | Original fare request, exact returned estimate and expiry; numeric `ttl` |
| `monitoring#{ride_id}` | `MONITORING` | Latest aggregate response, off/on-route counters, one stop anchor, stopped_since, last_good_at; numeric `version` for compare-and-swap |

There is **no latest-point list, recent GPS buffer, full trail or per-update item**. One hundred accepted samples update the same monitoring item 100 times. Apart from temporary quotes and an optional completed fare report, the journey occupies one ride item and at most one monitoring item. The stop anchor is still a precise coordinate and must be treated as sensitive. Monitoring state is deleted on completion. Abandoned active rides retain their minimal state until future retention/deletion policies are implemented.

`dynamodb.py` uses the low-level boto3 client with explicit TypeSerializer/TypeDeserializer conversion. UUIDs, enums and UTC datetimes become strings; nested models become inspectable maps/lists, null values remain DynamoDB NULL, and JSON numeric values pass through Decimal before encoding as DynamoDB Numbers. Deserialization validates through the Pydantic schemas, including strict integer fields. No pickle, opaque binary payload or raw AWS response is stored.

### Quote TTL and expiry

Both temporary quote entities store `ttl = int(expires_at.timestamp())`, a numeric epoch-seconds value. Enable TTL on `ttl` using the manual command below. DynamoDB deletion is asynchronous, so services always enforce `now >= expires_at` themselves. An expired route quote returns **409** with `Route estimate expired or unavailable. Refresh route and fare estimates.` even if the item still exists. The existing frontend refreshes route and fare quotes near route expiry. TTL does not remove the expected route or fare snapshot copied into a ride.

### Distributed correctness

- Reads use `ConsistentRead=True`. Ride creation and fare-report insertion use `attribute_not_exists(pk)`; duplicate fare reports remain 409 without a read-before-write race.
- Completion reads the immutable ACTIVE ride, then uses **one TransactWriteItems** to conditionally replace it only if `data.status` is ACTIVE and delete `monitoring#{id}`. Competing completions re-read the winning completed record, preserving its original ended_at, drop and fare snapshot. The initial read is never followed by an unconditional overwrite.
- A monitoring write uses **one TransactWriteItems** containing a ConditionCheck on the ride's ACTIVE status and a version-conditional Put of the monitoring item. New state requires an absent key; subsequent writes require the previously read version and increment it. A completion that wins first makes the check fail; a location update that wins first is removed by completion. A GPS update cannot recreate monitoring for a completed ride.
- Monitoring conflicts re-read and recalculate, with at most **3 attempts**. A fixed server receipt timestamp is used throughout an update, so retrying an older sample cannot overwrite a newer sample. Completion also has at most 3 transaction attempts. Exhausted contention or storage failures return a sanitized 503; completed-ride monitoring returns 409. AWS messages and coordinate-bearing records are not logged or exposed in errors.
- Transaction client tokens protect identical SDK retries. Python locks protect memory mode and lazy client initialization only; DynamoDB correctness comes from conditions/transactions, not process-local locks. This targets instances using the same regional table, not multi-region global-table conflict resolution.

### Manual table setup — commands for you to run later

These commands are documentation only and have **not** been run. Use a provisioning-authorized identity: the current Location-only profile and the runtime policy above do not grant table creation or TTL administration. The example uses `ridewatch`; use your administrator/provisioning profile instead if appropriate. Provisioning needs CreateTable, DescribeTable, UpdateTimeToLive and DescribeTimeToLive, separately from runtime permissions. No IAM policy is modified automatically.

PowerShell-compatible AWS CLI commands:

```powershell
aws dynamodb create-table `
  --table-name ridewatch-dev `
  --attribute-definitions AttributeName=pk,AttributeType=S `
  --key-schema AttributeName=pk,KeyType=HASH `
  --billing-mode PAY_PER_REQUEST `
  --region ap-south-1 --profile ridewatch --no-cli-pager

aws dynamodb wait table-exists `
  --table-name ridewatch-dev `
  --region ap-south-1 --profile ridewatch

aws dynamodb describe-table `
  --table-name ridewatch-dev --query Table.TableStatus --output text `
  --region ap-south-1 --profile ridewatch --no-cli-pager

aws dynamodb update-time-to-live `
  --table-name ridewatch-dev `
  --time-to-live-specification Enabled=true,AttributeName=ttl `
  --region ap-south-1 --profile ridewatch --no-cli-pager

aws dynamodb describe-time-to-live `
  --table-name ridewatch-dev `
  --region ap-south-1 --profile ridewatch --no-cli-pager
```

Wait for table status ACTIVE. TTL can remain ENABLING temporarily; do not repeatedly toggle it. See [AWS TTL CLI documentation](https://docs.aws.amazon.com/cli/latest/reference/dynamodb/update-time-to-live.html). Change `ridewatch-dev` and the region consistently across commands, configuration and the table ARN if you choose different values.

### Switch modes and verify locally

After provisioning the table and granting the runtime policy, edit `backend/.env`:

```dotenv
CORS_ORIGINS=["http://localhost:3000"]
AWS_PROFILE=ridewatch
AWS_REGION=ap-south-1
AWS_PAGER=
LOCATION_PROVIDER=aws
ROUTE_ESTIMATE_MAX_AGE_SECONDS=300
STORAGE_BACKEND=dynamodb
DYNAMODB_TABLE_NAME=ridewatch-dev
```

Restart the backend. Process environment variables override `.env`, so clear any stale STORAGE_BACKEND override in your terminal when switching. For role-based credentials later, omit AWS_PROFILE. To return to the default, set `STORAGE_BACKEND=memory` and restart; the table name may remain configured. Switching modes does not migrate records or delete DynamoDB data. Memory-mode IDs are not available in DynamoDB mode and vice versa.

Start the existing backend and frontend using the commands above. Obtain current location before destination search, create a ride, send GPS updates, restart the backend, reload the same ride URL and verify monitoring continues. End the ride and submit a fare. Two instances configured for the same table can use the same route/fare quote IDs and monitoring state. Real DynamoDB persistence has now been manually verified by the project owner; deployment validation is separate and still pending.

Automated tests default explicitly to memory even if your local `.env` selects DynamoDB; the network-blocking fixture covers DynamoDB and Location. DynamoDB tests use a deterministic atomic fake plus botocore Stubber, with no local DynamoDB server. They check nested round trips, conditional inserts, concurrent completers, multi-instance quotes/monitoring, TTL application expiry, filtered Scan pagination, optimistic conflict retries, both completion/GPS race orders, safe failures and absence of GPS-history items. Frontend tests include the no-location search gate and the existing complete ride/fare flow.

### Remaining limitations

- No authentication/authorization or live deployment is added. The Lambda handler and deployment configuration are prepared, but no API Gateway/Amplify/Lambda resources have been created. DynamoDB durability does not make this unauthenticated API suitable for production.
- Precise ride endpoints, expected route geometry, fare-report endpoints and a stop anchor are sensitive. Full GPS trails are not persisted. Production still needs consent, retention/deletion policies, access control and an encryption policy.
- Fare matching performs a paginated filtered Scan over this table. Filtering does not avoid reading other entities or guarantee a single snapshot across scan pages. The unchanged 200 m / 500 m algorithm is appropriate only for this MVP; production needs geospatial aggregation/indexing.
- DynamoDB's [400 KB per-item limit](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Constraints.html) applies to route quotes and rides containing geometry. Oversized records fail safely with 503; route splitting/compression is not implemented.
- Transactions and frequent state reads/writes incur cost. Heavy contention can return 503 after bounded retries. Application servers need synchronized clocks. There is no migration of existing memory data, automatic archival of abandoned rides, multi-region conflict strategy or full background GPS tracking.
