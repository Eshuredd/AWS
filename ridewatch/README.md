# RideWatch

Booking-independent ride safety companion for India.

## Problem and current MVP
Street-hailed autos, local taxis and directly negotiated rides often happen outside booking apps. RideWatch records a starting point, destination and optional vehicle number before getting in.

This MVP includes browser geolocation with error handling, normalized vehicle numbers, clearly marked fixed demo estimates, and creating, viewing and completing ride sessions. Monitoring sections are placeholders: no tracking, alerts or emergency response runs. Demo estimates are unrelated to the entered destination.

## Architecture
Next.js App Router + TypeScript + Tailwind CSS → FastAPI routes → RideService → RideRepository → InMemoryRideRepository.

The application factory owns an isolated repository. A future DynamoDB implementation can replace the repository without changing the API layer. Completion is atomic and repeated requests preserve the original end timestamp. No AWS credentials are needed.

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
│   │   ├── core/config.py
│   │   ├── models/ride.py
│   │   ├── schemas/ride.py
│   │   ├── repositories/ride_repository.py
│   │   └── services/ride_service.py
│   └── tests/test_rides.py
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

Geolocation needs browser permission and a secure context; localhost works. HTTP LAN addresses on phones generally do not. Location is requested only on button press and sent to the backend only when creating a ride.

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
| POST | `/api/rides` | Create ACTIVE ride (201) |
| GET | `/api/rides/{ride_id}` | Fetch ride (404 if missing) |
| PATCH | `/api/rides/{ride_id}/end` | Complete ride (404 if missing) |

Example create body:
```json
{"start_lat":17.0,"start_lng":78.0,"destination":"Secunderabad Railway Station","vehicle_number":"TS09AB1234"}
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

Later deployment will add a Lambda ASGI adapter/handler, a DynamoDB repository and environment-specific CORS. In-memory storage is unsuitable for Lambda persistence. No cloud resources or integrations are implemented.

Later increments include real routing and fares, GPS tracking, deviation/stop/delay detection, OCR, trusted contacts, emergency escalation and actual fare reporting. Authentication and persistence remain future work.
