# RideWatch

**A booking-independent ride safety companion for India.**

RideWatch helps riders check the expected route and fare before a ride, monitor the journey while travelling, and quickly share trip details with trusted contacts if something goes wrong.

It is especially useful for street-hailed autos, local taxis and directly negotiated rides where there may be no booking platform actively monitoring the trip.

## Live Project

**Live App:**  
https://master.diuv8kprvmkrc.amplifyapp.com

**Demo Video:**  
https://www.youtube.com/watch?v=mg4T-3vF5SA

---

## AI Tools Used

AI coding tool such as Codex was used during the development of RideWatch


---

## Built for First Commit

RideWatch was built during the **WeMakeDevs × AWS First Commit** hackathon.

Development of the submitted RideWatch project started after the hackathon build period opened. Planning, learning and experimentation done before the event were not submitted as an existing project.

---

## The Problem

A large number of rides in India still happen outside apps like Uber, Ola or Rapido.

For a street-hailed auto or local cab, riders may not have:

- an expected route
- a traffic-aware ETA
- a fare reference
- live trip monitoring
- an easy way to share the trip during an emergency

RideWatch adds this layer independently of the booking platform.

It does not need to book the ride itself.

---

## What RideWatch Does

### Before the ride

RideWatch helps the rider understand the journey before getting in.

It provides:

- current-location based pickup
- destination search
- expected road route
- traffic-aware travel time
- expected distance
- Telangana auto fare benchmark
- community-reported fare information when enough reports are available
- optional vehicle number
- trusted contacts
- handoff to ride-booking apps

### During the ride

Once the ride starts, RideWatch uses the rider's live location to monitor the journey.

It can detect:

- route deviation
- prolonged stops
- unusual delays
- poor or stale GPS readings

RideWatch does not immediately flag one unusual GPS point as a deviation.

It waits for multiple reliable off-route readings before confirming the route change, which helps reduce false alerts caused by GPS noise.

### If something goes wrong

The rider can open the emergency panel and:

- send an SOS to trusted contacts
- create a private live-trip sharing link
- call India's emergency number, 112
- copy emergency details
- share details through WhatsApp

RideWatch does not automatically call emergency services.

### After the ride

The rider can optionally report the actual fare paid.

These reports are used to build community fare intelligence for similar journeys.

# AWS Architecture

```text
                    GitHub
                       │
                       ▼
              AWS Amplify Hosting
                       │
                       ▼
                Next.js Frontend
                       │
                       ▼
              Amazon API Gateway
                       │
                       ▼
                  AWS Lambda
              FastAPI + Mangum
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   Amazon Location  DynamoDB   AWS End User
      Service                   Messaging SMS
          │                         │
          └────────────┬────────────┘
                       ▼
                Amazon CloudWatch
```

RideWatch uses a serverless AWS architecture, so there is no application server that needs to be manually maintained.

---

# How AWS Is Used

## AWS Amplify Hosting

The Next.js frontend is deployed using **AWS Amplify Hosting**.

Amplify is connected to the GitHub repository and can automatically build and deploy frontend changes when updates are pushed.

It also provides the HTTPS deployment required for browser geolocation features.

---

## AWS Lambda

The RideWatch backend is built with FastAPI and runs on **AWS Lambda**.

**Mangum** is used as the ASGI adapter between FastAPI and Lambda.

This allows RideWatch to run its backend serverlessly rather than maintaining a permanently running application server.

---

## Amazon API Gateway

**Amazon API Gateway** exposes the FastAPI backend to the frontend.

The browser communicates with the backend through API Gateway for operations including:

- destination search
- route estimation
- fare estimation
- ride creation
- live location monitoring
- ride completion
- fare reporting
- live-trip sharing
- SOS requests

---

## Amazon Location Service

**Amazon Location Service** powers the location and routing features of RideWatch.

### Destination Search

Amazon Location Places is used to search for destinations.

The rider's current location is supplied as a search bias so that nearby and relevant results can be returned.

### Traffic-Aware Routing

Amazon Location Routes calculates:

- road distance
- traffic-aware journey duration
- expected route geometry

The returned route geometry also becomes the baseline used for live route-deviation monitoring.

---

## Amazon DynamoDB

**Amazon DynamoDB** provides persistent storage for the backend.

RideWatch stores information such as:

- rides
- route estimates
- fare estimates
- monitoring state
- fare reports
- temporary live-share sessions
- SOS idempotency records

Temporary records use DynamoDB TTL where appropriate.

RideWatch uses a serverless DynamoDB table with on-demand billing.

---

## AWS End User Messaging SMS

RideWatch integrates **AWS End User Messaging SMS** for trusted-contact emergency alerts.

When the rider explicitly confirms an SOS request, RideWatch can send trip information and a temporary live-trip link to the selected trusted contacts.

The user can configure up to three trusted contacts.

SMS delivery depends on AWS messaging permissions, sandbox/production status and destination-country requirements.

---

## Amazon CloudWatch

**Amazon CloudWatch** is used for monitoring and debugging the deployed backend.

It helps inspect:

- Lambda execution
- backend errors
- application logs
- SMS delivery events
- SMS failure events

CloudWatch was particularly useful while integrating the serverless backend and emergency messaging flow.

---

## AWS IAM

**AWS Identity and Access Management (IAM)** controls permissions between RideWatch and AWS services.

The Lambda execution role is granted the permissions required to work with services such as:

- Amazon DynamoDB
- Amazon Location Service
- AWS End User Messaging SMS
- Amazon CloudWatch

AWS credentials are never exposed to the browser frontend.

---

# Tech Stack

## Frontend

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS
- MapLibre GL JS

## Backend

- Python
- FastAPI
- Mangum
- boto3
- Pydantic

## AWS

- AWS Amplify Hosting
- AWS Lambda
- Amazon API Gateway
- Amazon Location Service
- Amazon DynamoDB
- AWS End User Messaging SMS
- Amazon CloudWatch
- AWS IAM

## Maps

- MapLibre GL JS
- OpenFreeMap
- OpenMapTiles
- OpenStreetMap data

---

# How a Ride Works

```text
1. Rider allows location access
        │
        ▼
2. Rider selects a destination
        │
        ▼
3. Amazon Location calculates the route
        │
        ▼
4. RideWatch shows distance, ETA and fare benchmark
        │
        ▼
5. Rider can add vehicle number and trusted contacts
        │
        ▼
6. Rider starts the ride
        │
        ▼
7. Browser sends live GPS samples
        │
        ▼
8. Backend compares the location with the expected route
        │
        ▼
9. RideWatch checks deviation, stops and delays
        │
        ▼
10. Rider can trigger SOS if required
        │
        ▼
11. Rider ends the ride
        │
        ▼
12. Rider can optionally report the actual fare
```

---

# Live Ride Monitoring

The browser uses the Geolocation API while an active RideWatch trip is open.

GPS samples are sent to the backend, where they are compared with the expected route returned by Amazon Location Service.

RideWatch currently monitors three main conditions.

---

## Route Deviation

A single inaccurate GPS point should not trigger an emergency-style warning.

RideWatch therefore waits for repeated reliable off-route readings.

Current monitoring rules include:

- good GPS accuracy: **100 m or better**
- deviation threshold: **more than 150 m plus reported GPS uncertainty**
- deviation confirmation: **3 consecutive reliable off-route readings**
- recovery: **2 consecutive reliable on-route readings**
- minimum accepted update interval: **5 seconds**
- stale GPS threshold: **30 seconds**

This helps reduce false deviation alerts caused by GPS noise.

---

## Prolonged Stops

RideWatch can identify when the rider appears to remain within a small area for an extended period.

The current rules use:

- approximately 30 m movement radius
- sufficiently accurate GPS readings
- approximately 3 minutes of stationary readings

This appears as an informational warning to the rider.

---

## Excessive Delay

RideWatch also compares the elapsed ride time against the original traffic-aware duration returned by Amazon Location Service.

A significant delay can be shown when the ride is taking substantially longer than expected.

---

# Fare Information

RideWatch deliberately separates official fare information from community-reported fares.

## Official Fare Benchmark

RideWatch calculates an informational auto-rickshaw meter benchmark based on the Telangana tariff configured in the application.

This gives the rider a reference point before starting the journey.

It is not presented as a guaranteed final fare.

---

## Community Fare Intelligence

After finishing a ride, users can optionally report the actual amount they paid.

When enough similar reports exist, RideWatch can show aggregated fare information for future riders.

The system does not simply expose individual historical ride records.

---

# Ride-App Handoff

RideWatch can also help the rider continue the selected journey inside a ride-booking application.

## Uber

RideWatch can open Uber and pass the selected pickup and destination into the Uber flow.

## Ola

RideWatch can open the Ola application.

Route prefill depends on the appropriate Ola partner/deep-link access.

## Rapido

RideWatch can open the Rapido application.

The rider currently re-enters the route inside Rapido.

RideWatch does **not** book the ride itself and does not claim to provide live Uber, Ola or Rapido pricing.

---

# Trusted Contacts and SOS

Users can configure up to three trusted contacts.

Trusted contacts are stored locally in the user's browser.

When the rider presses **SEND SOS**, RideWatch:

1. asks for confirmation
2. creates a temporary live-share link
3. sends the selected phone numbers to the backend
4. attempts delivery through AWS End User Messaging SMS
5. reports how many messages were successfully sent or failed

Contact phone numbers are used for the current SOS dispatch and are not stored as part of the ride record.

---

# Live Trip Sharing

RideWatch can create a temporary private link that a trusted contact can open in their browser.

The shared page is read-only.

It can show limited trip information such as:

- trip status
- destination
- vehicle number when supplied
- monitoring state
- latest available ride location

The shared viewer cannot:

- modify the ride
- send monitoring samples
- end the ride
- control the rider's application

Live-share links expire and can also be revoked.

---

# Privacy

RideWatch was designed to avoid retaining unnecessary location history.

## No Full GPS Trail

RideWatch does **not** store a complete GPS trail.

During an active ride, the backend keeps only the location and monitoring state required for the current monitoring process.

The monitoring state is removed when the ride is completed.

---

## Trusted Contacts

Trusted-contact information is stored in the user's browser.

Contact phone numbers are sent to the backend only when the rider explicitly confirms an SOS request.

---

## Live-Share Tokens

RideWatch generates a random private sharing token for each live-share session.

The backend stores a hash of that token rather than storing the raw token itself.

Anyone with the live-share URL can view its limited information until it expires or is revoked, so users should treat the link as private.

---

# Project Structure

```text
AWS/
├── README.md
├── amplify.yml
│
└── ridewatch/
    ├── README.md
    ├── DEPLOYMENT.md
    ├── DESIGN.md
    ├── FINAL-UI-AUDIT.md
    ├── UI-QA.md
    │
    ├── backend/
    │   ├── app/
    │   ├── tests/
    │   ├── requirements.txt
    │   └── requirements-lock.txt
    │
    ├── frontend/
    │   ├── app/
    │   ├── components/
    │   ├── lib/
    │   ├── tests/
    │   └── package.json
    │
    └── scripts/
```

This root README provides the hackathon/project overview.

More detailed technical documentation is available inside:

```text
ridewatch/README.md
```

---

# Running RideWatch Locally

## Requirements

Recommended development environment:

- Node.js 22
- Python 3.12
- Git
- AWS CLI
- AWS credentials/profile with the required permissions

Clone the repository:

```bash
git clone https://github.com/Eshuredd/AWS.git
cd AWS/ridewatch
```

---

## Backend

On Windows PowerShell:

```powershell
cd backend

python -m venv .venv

.\.venv\Scripts\python.exe -m pip install -r requirements.txt

Copy-Item .env.example .env

.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

The local backend will run at:

```text
http://localhost:8000
```

FastAPI documentation:

```text
http://localhost:8000/docs
```

---

## Frontend

Open another terminal:

```powershell
cd frontend

npm.cmd ci

Copy-Item .env.example .env.local

npm.cmd run dev
```

Set the local API URL inside `.env.local`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

Then open:

```text
http://localhost:3000
```

---

# Frontend Validation

From:

```text
ridewatch/frontend
```

run:

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
```

---

# Backend Tests

From:

```text
ridewatch/backend
```

run:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

The automated tests use fake or mocked integrations where appropriate so that testing does not require real AWS calls for every test.

---

# Production Deployment

The deployed system follows this flow:

```text
GitHub
  │
  ▼
AWS Amplify
  │
  ▼
Next.js Frontend


Browser
  │
  ▼
Amazon API Gateway
  │
  ▼
AWS Lambda
  │
  ▼
FastAPI
  │
  ├── Amazon Location Service
  ├── Amazon DynamoDB
  ├── AWS End User Messaging SMS
  └── Amazon CloudWatch
```

Detailed deployment notes are available in:

```text
ridewatch/DEPLOYMENT.md
```

---

# Environment Configuration

Important backend environment variables include:

```env
AWS_REGION=ap-south-1

LOCATION_PROVIDER=aws

STORAGE_BACKEND=dynamodb

DYNAMODB_TABLE_NAME=ridewatch

ROUTE_ESTIMATE_MAX_AGE_SECONDS=300

SMS_PROVIDER=aws

SMS_CONFIGURATION_SET=ridewatch-sms
```

The production frontend requires:

```env
NEXT_PUBLIC_API_URL=<API_GATEWAY_URL>
```

Optional ride-provider integration variables can also be configured where appropriate access is available.

AWS secrets and credentials should never be committed to this repository or exposed through `NEXT_PUBLIC_*` variables.

---

# Deployment Region

The main AWS resources used by RideWatch are deployed in:

```text
Asia Pacific (Mumbai)
ap-south-1
```

---

# Open Source and Credits

RideWatch uses open-source frameworks, libraries and map data.

## Next.js

Repository:  
https://github.com/vercel/next.js

License: MIT

---

## React

Repository:  
https://github.com/facebook/react

License: MIT

---

## FastAPI

Repository:  
https://github.com/fastapi/fastapi

License: MIT

---

## Mangum

Repository:  
https://github.com/Kludex/mangum

License: MIT

---

## MapLibre GL JS

Repository:  
https://github.com/maplibre/maplibre-gl-js

License: BSD 3-Clause

---

## OpenFreeMap

https://openfreemap.org/

Used for the map style and map tiles displayed by RideWatch.

---

## OpenMapTiles

https://openmaptiles.org/

Used as part of the open map stack.

---

## OpenStreetMap

https://www.openstreetmap.org/

Map data © OpenStreetMap contributors.

---

# Current Limitations

RideWatch is a hackathon prototype and is not a replacement for official emergency services.

Current limitations include:

- no complete user-account/authentication system
- live GPS monitoring requires the active ride page to remain running
- browsers may suspend geolocation when the application is in the background
- GPS readings can sometimes be inaccurate or unavailable
- fare values are informational estimates
- community fare intelligence depends on enough reports being available
- SMS delivery depends on AWS messaging permissions and country-specific requirements
- RideWatch does not automatically call police or emergency services
- Ola route prefill depends on partner access
- Rapido currently opens the application without route prefill
- RideWatch does not fetch live prices from Uber, Ola or Rapido

For an emergency in India, users should contact **112** directly.

---

# What I Learned

Building RideWatch helped me understand how several AWS services can be combined into one real application rather than being used separately.

Some of the main things I learned during the project were:

- deploying a Next.js frontend with AWS Amplify
- running FastAPI serverlessly on Lambda using Mangum
- exposing Lambda through API Gateway
- using Amazon Location for real destination search and traffic-aware routing
- designing DynamoDB storage for temporary and persistent application state
- using IAM execution roles rather than application credentials
- integrating AWS End User Messaging SMS
- sending SMS delivery events into CloudWatch
- debugging a distributed serverless application
- handling browser geolocation and unreliable GPS readings
- designing location monitoring without storing a complete GPS history

The project also taught me that getting different AWS services to work together is often more important than using any one service individually.

---

# Why RideWatch?

Most ride-safety systems are tied to the company that booked the ride.

RideWatch takes a different approach.

The safety layer belongs to the rider rather than the booking platform.

Whether the journey starts from a street-hailed auto, a local taxi, a direct negotiation or a ride-booking app, the goal is the same:

> **Know the route. Know the fare. Stay connected during the ride.**
