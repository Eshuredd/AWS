# RideWatch

Booking-independent ride safety companion for India.

## Problem and current MVP
Street-hailed autos, local taxis and directly negotiated rides often happen outside booking apps. RideWatch records a starting point, destination and optional vehicle number before getting in.

This MVP includes browser geolocation with error handling, normalized vehicle numbers, Amazon Location destination search and road estimates, and creating, viewing and completing ride sessions. Monitoring sections are placeholders: no tracking, alerts or emergency response runs. Auto fare estimation separates the official Telangana meter estimate from aggregated fares reported after completed rides.

## Architecture
Next.js App Router + TypeScript + Tailwind CSS → FastAPI routes → RideService → RideRepository → InMemoryRideRepository.

The application factory owns an isolated repository and an injectable LocationProvider. A future DynamoDB implementation can replace the repository without changing the API layer. Completion is atomic and repeated requests preserve the original end timestamp. Live search and routing require backend AWS credentials; startup, health and automated tests do not.

In-memory sessions disappear on restart and are not shared across processes. Use one backend worker. No authentication is implemented; this is a local prototype.

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
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
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

Geolocation needs browser permission and a secure context; localhost works. HTTP LAN addresses on phones generally do not. Location is requested on the starting-location button and when ending a ride. It is sent to the backend for search bias, routing and ride creation. Search and route requests forward relevant coordinates to Amazon Location Service.

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
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
.\.venv\Scripts\python.exe -m pytest -q
```
Tests cover health, create/fetch, missing rides, completion and repeated completion, invalid destination and coordinates, vehicle normalization/validation, and CORS.

## API
| Method | Path | Result |
|---|---|---|
| GET | `/health` | Service health |
| GET | `/api/places/search?q=station&lat=17.44&lng=78.49` | Up to five resolved Indian destinations |
| POST | `/api/route-estimate` | Distance in km and duration in minutes |
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

Later deployment will add a Lambda ASGI adapter/handler, a DynamoDB repository and environment-specific CORS. In-memory storage is unsuitable for Lambda persistence. No cloud resources or deployment are implemented; Amazon Location is integrated through backend calls.

Later increments include GPS tracking, deviation/stop/delay detection, OCR, trusted contacts and emergency escalation. Authentication and persistence remain future work.

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

Search waits 400 ms after typing at least three characters and returns up to five India-filtered destinations. Selecting a suggestion supplies coordinates; arbitrary text does not trigger routing. Editing clears the selection and estimate. Requests are cancellable, stale responses are ignored, and failures offer retries. The UI requires a successful estimate before starting a ride.

The backend uses current boto3 `geo-places` and `geo-routes` clients. [SearchText](https://docs.aws.amazon.com/boto3/latest/reference/services/geo-places/client/search_text.html) resolves text directly to coordinates; no additional GetPlace or Geocode call is needed. Search uses `IncludeCountries=["IND"]`, optional location bias, and `IntendedUse="Storage"` because selected destination data is retained in ride sessions.

[CalculateRoutes](https://docs.aws.amazon.com/boto3/latest/reference/services/geo-routes/client/calculate_routes.html) uses `TravelMode="Car"`, `OptimizeRoutingFor="FastestRoute"` and no alternatives or extra features. AWS coordinates are longitude first. Summary meters become kilometers; seconds round up to minutes. Zero-length/unusable routes produce a safe error. Car routes may differ from auto-rickshaw routes. Values are estimates, not guarantees.

Rides now store `destination_lat`, `destination_lng`, `expected_distance_km` and `expected_duration_minutes`. Coordinates must be in range, distance finite and positive, and duration a positive integer. Older API clients may omit all four; partial bundles are rejected. The updated UI always sends the full bundle. These client-submitted values are validated informational snapshots, not signed or independently recalculated during ride creation. Completion now also stores a GPS drop or destination fallback, and rides retain a fare snapshot.

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
This loads `backend/.env` and runs the backend virtual environment's `python -m uvicorn app.main:app --reload --port 8000`. Direct Uvicorn startup also loads application settings automatically.

For manual AWS CLI commands, dot-source this once per new PowerShell terminal:
```powershell
. .\scripts\load-env.ps1
$env:AWS_PROFILE
$env:AWS_REGION
$env:AWS_PAGER
```
Expected values: `ridewatch`, `ap-south-1`, and empty. You no longer need the three individual assignments. Python cannot modify its parent terminal, so manual CLI use still needs the helper. It supports blank lines, full-line comments, normal assignments, empty values and matching outer quotes, without executing or expanding values. Older PowerShell/.NET may remove empty variables; use `aws ... --no-cli-pager` if the CLI still enables its configured/default pager.

Copy the example to `.env` if absent; preserve existing customizations. `.env` is ignored by Git. If you change regions, update the IAM ARNs below.

The backend identity needs these permissions, attached through IAM or its SSO permission set:

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
    }
  ]
}
```

These ARNs intentionally have no account ID. Sources: [Places IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-places.html) and [Routes IAM](https://docs.aws.amazon.com/service-authorization/latest/reference/list_geo-routes.html). No place index, route calculator, API Gateway or Lambda resource is required. Live requests incur applicable Amazon Location usage charges.

## Testing without AWS

Run the pytest command above. Tests inject `FakeLocationProvider` through `create_app(location_provider=...)`. Adapter tests use botocore Stubber with dummy credentials to validate SDK request shapes, coordinate ordering, unit conversion and failures. An autouse fixture blocks botocore network transport across the entire suite. No real AWS API requests occur.

Clients initialize lazily, so startup and `/health` work without credentials. Search/route failures return sanitized 503 messages; logs contain only operation and exception class, not credentials, destinations or raw AWS exception text. No fake success response replaces a failed AWS call.

Verified locally: backend tests, frontend lint/typecheck/build, and a mobile Chromium flow with intercepted test API responses covering debounce, selection, stale search cancellation, retries, ride creation and completion. Live search results, route availability/accuracy, account permissions and AWS connectivity have not been verified with real credentials. After setup, allow geolocation at localhost:3000, select a destination, check the estimate, start the ride and end it. Nothing has been deployed.


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

The browser requests fares after Amazon Location supplies the route. Requests are cancellable and stale responses are ignored. Fare failures have their own retry button. Creating a ride passes `fare_estimate_id`; the backend checks it against the exact route and stores the corresponding immutable **nested `fare_estimate` snapshot**, including source, night flag, range, median, count, radius and confidence. New reports arriving between quote and creation do not change it. Active/completed pages render this snapshot without recalculation. Quotes and rides live in the same process; an unknown/mismatched quote returns 409 and needs a refreshed estimate. Older API clients can omit the ID: a snapshot is calculated at creation when route data is available, or null for legacy text-only rides.

`PATCH /api/rides/{ride_id}/end` still accepts no body. Optionally send `{ "drop_lat": 17.4337, "drop_lng": 78.5018, "drop_location_source": "GPS" }`. The UI attempts current GPS with a bounded wait of at most 8 seconds; failure uses the stored destination and marks `DESTINATION_FALLBACK`. Completion remains atomic and repeat calls preserve the original end time, drop and fare snapshot.

After completion, users can submit or skip an optional fare. `POST /api/rides/{ride_id}/fare-report` accepts `{ "fare_paid": 210 }`, using the stored drop, or accepts an explicit GPS coordinate pair and source. Destination fallback is resolved server-side from stored coordinates. Fares must be finite, positive and at most ₹10,000; they need not resemble the official fare. Invalid inputs return 422, missing rides 404, active rides or rides without route/drop data 409. Atomic insert rejects a duplicate with 409. The response is only a receipt (`ride_id`, `fare_paid`, `reported_at`).

### Storage, privacy and future scale

`FareReportRepository` abstracts `save`, `list_all`, and `get_for_ride`. The application factory injects `InMemoryFareReportRepository` by default; tests can inject repositories and providers. All reports, quote IDs and ride snapshots **disappear after a backend restart** and are not shared across workers. Use one worker for this hackathon. DynamoDB will be added later behind the repository interface; it is not implemented here.

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

For production scale, replace full Haversine scans with H3 or another geospatial index: exact coordinates → geospatial cell → pickup cell / destination cell → aggregated fare statistics. H3, DynamoDB, ML, booking-app scraping and deployment are deliberately not included.

Fare tests run fully offline with fixed coordinates and synthetic test fixtures, never seeded into the application. `backend/tests/test_fares.py` covers tariff/timezone boundaries, validation, Haversine, both tiers, distance tolerance, percentiles, IQR, report lifecycle, concurrency and immutable snapshots. Existing AWS fake-provider/Stubber tests remain in place.
