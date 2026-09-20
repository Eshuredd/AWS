# RideWatch deployment runbook

Status: **prepared and tested locally; not deployed**. DynamoDB persistence was previously verified manually by the project owner. The commands below are for an operator to run deliberately; the build scripts perform no deployment or AWS resource creation.

## Architecture and decisions

```text
Browser over HTTPS
  → Amplify Hosting (Next.js 15 SSR, Node 22)
  → API Gateway HTTP API ($default route/stage, payload 2.0)
  → Lambda (Python 3.12 / x86_64)
  → Mangum → existing FastAPI app
      → Amazon Location Places/Routes
      → existing DynamoDB table
```

- Handler: `app.lambda_handler.handler`. It imports the same `app.main.app` used by Uvicorn. Mangum lifespan is off because the app has no startup/shutdown resources; SDK clients remain lazy. `/health` never contacts AWS dependencies.
- Lambda ZIP packaging includes pinned runtime dependencies and app modules at ZIP root. Linux CPython 3.12 wheels are selected explicitly, including pydantic-core, even when built on Windows. No Docker is needed. The runtime lock omits Uvicorn, pytest and other local tooling. Keep it aligned with the main dependency lock when upgrading.
- Initial Lambda settings: Python 3.12, x86_64, **512 MB, 25-second timeout**, no VPC, no provisioned concurrency. These are starting values to measure, not performance guarantees. The browser's API deadline is 20 seconds, so unusually slow calls can still time out; inspect duration/error metrics before tuning. Keep storage in DynamoDB; Lambda rejects memory mode to avoid intermittent data loss.
- **FastAPI owns CORS. Leave API Gateway CORS unconfigured.** Its catch-all Lambda route handles OPTIONS as well as application methods. Allow exact origins only; no wildcard. CORS is browser policy, not authentication.
- The browser API URL is compiled into Next.js at build time. This runbook uses the API's origin with a `$default` stage, so no stage path or rewrite is necessary. The client removes trailing slashes before adding `/api/...`.
- Amplify's native Next.js SSR deployment currently supports this project's Next.js 15 build. The frontend emits the standard `.next` output expected by Amplify.

References: [Mangum adapter](https://mangum.fastapiexpert.com/adapter/), [Lambda Python ZIP packaging](https://docs.aws.amazon.com/lambda/latest/dg/python-package.html), [Amplify Next.js support](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-amplify-support.html), [Amplify deployment specification](https://docs.aws.amazon.com/amplify/latest/userguide/ssr-deployment-specification.html).

## 1. Verify the existing table and operator identity

Use AWS CLI v2 and PowerShell 7. Start from `ridewatch/`. The local CLI profile below is the **operator's identity**, not a Lambda environment variable. It needs provisioning permissions beyond the application's runtime policy. Substitute an authorized deployment profile when necessary. These steps do not create or delete DynamoDB tables.

```powershell
cd C:\Users\eshum\OneDrive\Desktop\AWS\ridewatch
$deployProfile = "ridewatch"
$region = "ap-south-1"
$table = "ridewatch" # Or the existing manually verified table, e.g. ridewatch-dev.
$function = "ridewatch-api"
$role = "ridewatch-lambda-role"
$account = aws sts get-caller-identity --query Account --output text --profile $deployProfile
if ($LASTEXITCODE -ne 0) { throw "AWS identity check failed" }
aws dynamodb describe-table --table-name $table --region $region --profile $deployProfile --query 'Table.{Status:TableStatus,Keys:KeySchema}' --no-cli-pager
aws dynamodb describe-time-to-live --table-name $table --region $region --profile $deployProfile --no-cli-pager
```

Confirm ACTIVE, string partition key `pk`, no sort key, and TTL enabled on `ttl`. If the table does not exist, select the verified table or use the separate README table-provisioning instructions later. In the Console, inspect DynamoDB → Tables → table → Overview and Additional settings → TTL.

## 2. Build and inspect the backend package

```powershell
.\scripts\build-lambda.ps1
Get-Content .\dist\lambda-package-report.json
```

The script produces `dist/ridewatch-lambda.zip` and validates ZIP integrity, required modules, Linux CPython 3.12 native ABI, compressed size below 50 MiB and unpacked size below 250 MiB. It excludes local `.env`, `.aws`, credentials files, tests, caches, `.venv` and frontend dependencies. On POSIX, `python3 scripts/build_lambda.py` performs the same build. The package downloads wheels from the package index; it makes no AWS calls.

The Python module lives at `app/lambda_handler.py` directly inside the ZIP, not under `backend/`. Windows cannot execute the Linux native wheel; offline adapter tests run with the local environment, and the package's platform/ABI is inspected separately. A Lambda invocation after upload is still required to verify the target runtime.

## 3. Create the execution role manually

Console: IAM → Roles → Create role → AWS service → Lambda. Attach the standard **AWSLambdaBasicExecutionRole** policy for CloudWatch logs, then add the table/Location policy from `deployment/lambda-policy.template.json`, replacing ACCOUNT_ID and the table/region.

The application actions are exactly:

- `geo-places:SearchText` on `arn:aws:geo-places:ap-south-1::provider/default`
- `geo-routes:CalculateRoutes` on `arn:aws:geo-routes:ap-south-1::provider/default`
- `dynamodb:GetItem`, `PutItem`, `DeleteItem`, `Scan`, `ConditionCheckItem` on `arn:aws:dynamodb:ap-south-1:ACCOUNT_ID:table/ridewatch`

No `UpdateItem` or standalone `TransactWriteItems` IAM permission is needed; transactions authorize their underlying actions. [AWS transaction IAM documentation](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)

The standard basic logging policy grants CreateLogGroup/CreateLogStream/PutLogEvents and uses a wildcard resource to cover Lambda-created log groups. That is the only broad-resource policy used here; the application policy has no wildcards. For tighter logging permissions later, pre-provision the function log group and scope log permissions to it.

CLI equivalent (creates/changes IAM only when **you** run it):

```powershell
$policy = (Get-Content .\deployment\lambda-policy.template.json -Raw).Replace("ACCOUNT_ID", $account).Replace("ap-south-1", $region).Replace("table/ridewatch", "table/$table")
$policy | Set-Content .\dist\lambda-policy.json -Encoding utf8NoBOM
aws iam create-role --role-name $role --assume-role-policy-document file://deployment/lambda-trust-policy.json --profile $deployProfile --no-cli-pager
aws iam attach-role-policy --role-name $role --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole --profile $deployProfile
aws iam put-role-policy --role-name $role --policy-name RideWatchDataAccess --policy-document file://dist/lambda-policy.json --profile $deployProfile
$roleArn = "arn:aws:iam::${account}:role/$role"
```

Allow IAM propagation before creating Lambda. If a role already exists, inspect its trust and policies instead of creating another blindly.

## 4–7. Create Lambda, configure environment, upload ZIP and set handler

Console: Lambda → Create function → Author from scratch → Python 3.12, x86_64 → existing role above. Under Code → Upload from → ZIP, choose the generated ZIP. Runtime settings → Handler: `app.lambda_handler.handler`. Configuration → General: 512 MB, timeout 25 seconds. Leave VPC unset.

Configuration → Environment variables:

```dotenv
LOCATION_PROVIDER=aws
STORAGE_BACKEND=dynamodb
DYNAMODB_TABLE_NAME=ridewatch
ROUTE_ESTIMATE_MAX_AGE_SECONDS=300
CORS_ORIGINS=["http://localhost:3000","https://YOUR_EXACT_AMPLIFY_DOMAIN"]
```

Use the actual table name. Initially, you can allow only localhost until Amplify supplies its domain. `CORS_ORIGINS` is a JSON-array **string**, not comma-separated text. `AWS_REGION` is supplied by Lambda; do not set/override it. Do not configure AWS_PROFILE, AWS_ACCESS_KEY_ID or AWS_SECRET_ACCESS_KEY. The runtime receives temporary execution-role credentials automatically. Lambda settings ignore local dotenv and any developer profile.

CLI equivalent combining creation, upload, handler and settings:

```powershell
$lambdaEnv = @{ Variables = @{
  LOCATION_PROVIDER = "aws"
  STORAGE_BACKEND = "dynamodb"
  DYNAMODB_TABLE_NAME = $table
  ROUTE_ESTIMATE_MAX_AGE_SECONDS = "300"
  CORS_ORIGINS = '["http://localhost:3000"]'
} }
$lambdaEnv | ConvertTo-Json -Depth 5 | Set-Content .\dist\lambda-environment.json -Encoding utf8NoBOM
aws lambda create-function --function-name $function --runtime python3.12 --architectures x86_64 --handler app.lambda_handler.handler --role $roleArn --memory-size 512 --timeout 25 --zip-file fileb://dist/ridewatch-lambda.zip --environment file://dist/lambda-environment.json --region $region --profile $deployProfile --no-cli-pager
aws lambda wait function-active-v2 --function-name $function --region $region --profile $deployProfile
$lambdaArn = "arn:aws:lambda:${region}:${account}:function:$function"
```

For later code uploads, run `aws lambda update-function-code --function-name $function --zip-file fileb://dist/ridewatch-lambda.zip --region $region --profile $deployProfile`, then `aws lambda wait function-updated-v2 --function-name $function --region $region --profile $deployProfile`. Do not run create-function again for updates.

## 8–9. Create API Gateway HTTP API and integrate Lambda

Console: API Gateway → Create API → **HTTP API** → Add Lambda integration → select function. Configure `$default` route, `$default` stage, auto-deploy, Lambda proxy payload format **2.0**. Leave authorizer unset for this prototype. Leave API Gateway CORS **unconfigured**, so OPTIONS reaches FastAPI. Grant API Gateway permission to invoke this function when prompted. No Lambda Function URL or REST API is needed.

CLI equivalent:

```powershell
$apiId = aws apigatewayv2 create-api --name ridewatch-http --protocol-type HTTP --query ApiId --output text --region $region --profile $deployProfile
$integrationId = aws apigatewayv2 create-integration --api-id $apiId --integration-type AWS_PROXY --integration-uri $lambdaArn --payload-format-version 2.0 --timeout-in-millis 29000 --query IntegrationId --output text --region $region --profile $deployProfile
aws apigatewayv2 create-route --api-id $apiId --route-key '$default' --target "integrations/$integrationId" --region $region --profile $deployProfile --no-cli-pager
aws apigatewayv2 create-stage --api-id $apiId --stage-name '$default' --auto-deploy --region $region --profile $deployProfile --no-cli-pager
aws lambda add-permission --function-name $function --statement-id AllowRideWatchHttpApi --action lambda:InvokeFunction --principal apigateway.amazonaws.com --source-arn "arn:aws:execute-api:${region}:${account}:${apiId}/*" --region $region --profile $deployProfile --no-cli-pager
$apiUrl = "https://${apiId}.execute-api.${region}.amazonaws.com"
```

Check each command succeeds before continuing. `$default` must stay single-quoted in PowerShell. The invocation grant is restricted to this API; its trailing wildcard covers the API's routes/stages, not arbitrary AWS resources. [HTTP API CLI examples](https://docs.aws.amazon.com/cli/latest/userguide/cli_apigatewayv2_code_examples.html)

## 10–11. Verify reachability and real routing

```powershell
Invoke-RestMethod "$apiUrl/health"
$routeBody = @{ start_lat=17.44; start_lng=78.49; destination_lat=17.433; destination_lng=78.501 } | ConvertTo-Json
$quote = Invoke-RestMethod "$apiUrl/api/route-estimate" -Method Post -ContentType "application/json" -Body $routeBody
$quote | Select-Object route_estimate_id, distance_km, duration_minutes, traffic_aware, expires_at
```

Expect health `{status: ok, service: ridewatch-api}`, then a traffic-aware quote with positive distance/duration. The second request intentionally uses Amazon Location and DynamoDB and incurs normal AWS costs. Do not print or log the full geometry. A successful health response alone does not prove IAM/table/Location configuration.

## 12–13. Connect Amplify and set build-time API URL

Console: Amplify → Create new app → connect GitHub → `Eshuredd/AWS` → choose the branch containing these changes **after you decide to commit/push them**. No changes have been pushed by this task. Select monorepo and set app root **`ridewatch/frontend`**. The root-level `amplify.yml` is the build specification. Use Hosting compute (`WEB_COMPUTE`) and the default Amazon Linux 2023 build image with Node 22.

Build configuration:

| Setting | Value |
|---|---|
| Repository root | `AWS` Git repository root |
| App root / AMPLIFY_MONOREPO_APP_ROOT | `ridewatch/frontend` |
| Node | 22.x (`nvm install 22`, `nvm use 22`) |
| Install | `npm ci` |
| Build | `npm run build` |
| Artifact directory | `.amplify-hosting` relative to app root |
| NEXT_PUBLIC_API_URL | Exact `$apiUrl` HTTPS origin, no `/api` or stage suffix |

Amplify detects Next.js from package.json, but this build supplies an explicit deployment manifest instead of relying on version-specific automatic packaging. Preserve `.amplify-hosting` as the artifact directory; do not let auto-detection replace it with `.next` or `out`. The bundle contains CDN static assets and a self-contained Node 22 compute server. It preserves dynamic `/ride/{id}` routes, unlike a static export. Public API calls still go directly from the browser to API Gateway; no backend AWS credentials belong in Amplify environment variables.

Amplify runs a fresh Linux build with `npm ci`; a bundle built on Windows is for local smoke testing only and should not be manually uploaded as a Linux compute artifact.

The build script refuses a missing or non-HTTPS public API origin. Public Next.js variables are substituted at **build time**, so changing the URL requires an Amplify rebuild. The project currently uses no Server Actions, ISR, custom image optimization or server-side ride-data fetching; those features would require revisiting the custom adapter. The first actual Amplify deployment is still a required validation step.

For an app already connected through the Console, inspect its platform and set variables with the Console, or use the equivalent CLI after setting `$amplifyAppId` and `$branch`:

```powershell
$amplifyAppId = "YOUR_APP_ID"
$branch = "YOUR_CONNECTED_BRANCH"
# update-app replaces the app-level environment map: include any values you need to preserve.
$amplifyEnv = @{ AMPLIFY_MONOREPO_APP_ROOT="ridewatch/frontend"; NEXT_PUBLIC_API_URL=$apiUrl }
$amplifyEnv | ConvertTo-Json | Set-Content .\dist\amplify-environment.json -Encoding utf8NoBOM
aws amplify update-app --app-id $amplifyAppId --platform WEB_COMPUTE --environment-variables file://dist/amplify-environment.json --region $region --profile $deployProfile --no-cli-pager
aws amplify start-job --app-id $amplifyAppId --branch-name $branch --job-type RELEASE --region $region --profile $deployProfile --no-cli-pager
```

Use the Console for the initial GitHub authorization rather than placing a GitHub token in commands or files. Amplify may request its own hosting service role; that role does not need access to the backend DynamoDB/Location resources. No Amplify app is created automatically by this repository.

## 14–15. Set exact production CORS origin and redeploy as needed

Copy Amplify's **actual HTTPS origin** from its branch page, including a custom domain if used, without a path. Update Lambda's CORS_ORIGINS. Keep localhost only while needed for development.

```powershell
$amplifyOrigin = "https://YOUR_ACTUAL_BRANCH_DOMAIN.amplifyapp.com"
$lambdaEnv.Variables.CORS_ORIGINS = ConvertTo-Json -Compress -InputObject @("http://localhost:3000", $amplifyOrigin)
$lambdaEnv | ConvertTo-Json -Depth 5 | Set-Content .\dist\lambda-environment.json -Encoding utf8NoBOM
aws lambda update-function-configuration --function-name $function --environment file://dist/lambda-environment.json --region $region --profile $deployProfile --no-cli-pager
aws lambda wait function-updated-v2 --function-name $function --region $region --profile $deployProfile
Invoke-WebRequest "$apiUrl/api/rides" -Method Options -Headers @{ Origin=$amplifyOrigin; "Access-Control-Request-Method"="POST"; "Access-Control-Request-Headers"="content-type" }
```

Expect `Access-Control-Allow-Origin` to equal that origin, never `*`. Leave Gateway CORS off; do not add competing Gateway response headers. An unlisted origin should receive no allow-origin header. Updating Lambda configuration is sufficient for CORS; changing frontend API URL requires a new Amplify build. The environment update replaces the whole map, so preserve any additional variables intentionally added later.

## 16. Complete browser/mobile verification

Use the Amplify **HTTPS** address on desktop and mobile, allow browser/device location, and complete:

1. Confirm destination search is disabled before pickup is available.
2. Use my location: initial pickup is network-assisted (`enableHighAccuracy=false`, timeout 25 seconds, maximumAge 60 seconds); retry if denied/unavailable/timed out.
3. Search/select a destination; verify traffic route and separate official/reported fares.
4. START RIDE; verify the snapshot, live GPS, route/movement/timing cards and latest update time.
5. Keep the page open; confirm calls go to the HTTPS API without duplicate slashes or CORS failures. Active monitoring still uses high-accuracy watchPosition with maximumAge=5000 and timeout=10000.
6. Reload the ride URL and confirm DynamoDB-backed state survives across requests/instances.
7. END RIDE; confirm the watcher stops and the existing GPS drop/destination fallback works. Submit or skip the optional fare.
8. Test permission denial/backend failure without losing the active ride; use simulated browser coordinates for deviation/stop checks rather than driving solely for testing.

localhost is a secure-context exception for development; production needs HTTPS. Do not disable browser security. Background tabs or a locked mobile screen may pause monitoring. Signals are informational, not emergency guarantees.

## Logs, operational checks and limitations

Lambda's basic execution role supplies CloudWatch logging. The adapter suppresses raw path access logs and replaces unhandled traceback content with the exception class. Existing Location failures log only operation/type; storage errors remain sanitized. Do not enable SDK debug logs, request-event dumps, full DynamoDB item logging or API Gateway logging of bodies/query strings. If adding HTTP API access logs, use request ID, route key, status and latency only. Local start-backend.ps1 disables Uvicorn access logs because search query strings contain coordinates.

Inspect Lambda Errors/Duration/Throttles and API Gateway 5xx/latency after deployment. `/health` proves reachability only. For a 503, verify role/table/region and Location permissions without printing private payloads. A 502 immediately after deployment commonly calls for checking ZIP root, handler, Linux architecture/runtime and CloudWatch's sanitized error class.

No authentication is added. The API is publicly reachable once you deploy it; exact CORS does not prevent non-browser access. Shared-trip URLs are bearer credentials and can be viewed by anyone who receives them until revocation or expiry. Production access control, consent, retention/deletion policies and monitoring-data safeguards remain necessary. Fare matching still uses a table Scan, and large routes remain subject to DynamoDB's item limit. No cloud deployment or target-Linux execution has been performed by this task.

## Repeatable local validation

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
cd ..\frontend
npm.cmd run test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
# Offline bundle validation uses a placeholder URL intercepted by Playwright.
$env:NEXT_PUBLIC_API_URL = "https://example.execute-api.ap-south-1.amazonaws.com/"
npm.cmd run build
npm.cmd run test
Remove-Item Env:NEXT_PUBLIC_API_URL
cd ..
.\scripts\build-lambda.ps1
```

Tests use fake AWS clients/Stubber, an HTTP API v2 event passed to Mangum, and simulated browser GPS. No automated test contacts AWS. Amplify uses its native Next.js SSR deployment with the `.next` build output.
