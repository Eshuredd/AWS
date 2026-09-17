# RideWatch

Booking-independent ride safety companion for India.

## Problem and current MVP
Street-hailed autos, local taxis and directly negotiated rides often happen outside booking apps. RideWatch records a starting point, destination and optional vehicle number before getting in.

This MVP includes browser geolocation with error handling, normalized vehicle numbers, Amazon Location destination search and road estimates, and creating, viewing and completing ride sessions. Monitoring sections are placeholders: no tracking, alerts or emergency response runs. Auto fare estimation displays “Coming next”.

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

Geolocation needs browser permission and a secure context; localhost works. HTTP LAN addresses on phones generally do not. Location is requested only on button press. It is sent to the backend for search bias, routing and ride creation. Search and route requests forward relevant coordinates to Amazon Location Service.

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

Later increments include fares, GPS tracking, deviation/stop/delay detection, OCR, trusted contacts, emergency escalation and actual fare reporting. Authentication and persistence remain future work.

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

Rides now store `destination_lat`, `destination_lng`, `expected_distance_km` and `expected_duration_minutes`. Coordinates must be in range, distance finite and positive, and duration a positive integer. Older API clients may omit all four; partial bundles are rejected. The updated UI always sends the full bundle. These client-submitted values are validated informational snapshots, not signed or independently recalculated during ride creation. The repository and completion flow are unchanged.

## AWS configuration

Backend `.env`:
```dotenv
AWS_REGION=ap-south-1
LOCATION_PROVIDER=aws
CORS_ORIGINS=["http://localhost:3000"]
```

Mumbai is the default region; see [AWS regional endpoints](https://docs.aws.amazon.com/general/latest/gr/location.html). If you change regions, update the IAM ARNs below. Normal runs accept only `LOCATION_PROVIDER=aws`; there is no silent fake fallback.

Supply backend credentials through the standard boto3 credential chain: an existing profile (including SSO), externally supplied temporary credentials, or an attached IAM role. No credentials or AWS SDK belong in the frontend. For an existing SSO profile named `ridewatch`, run in the backend terminal:

```powershell
aws sso login --profile ridewatch
$env:AWS_PROFILE = "ridewatch"
$env:AWS_REGION = "ap-south-1"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

If no profile exists, configure one externally with `aws configure sso --profile ridewatch` using your account's SSO details. Export `AWS_PROFILE` in the shell; it is not an application `.env` setting. Existing default profiles or workload roles need no profile override.

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
