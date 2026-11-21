# DepthDesk

An independent community app for commissioning liquidity and inspecting tokenized-equity quotes on Metric.

## Run locally

Requires Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. Local development uses a loopback-only identity and SQLite at `.local/depthdesk.db`. Market prices come from the real upstream APIs. A new database starts without campaigns.

```sh
npm test
npm run build
npm start
```

The built application runs at `http://127.0.0.1:8787`. `DEPTHDESK_PORT`, `DEPTHDESK_DB`, and `EXTRA_MARKET_CLOSURES` are optional local runtime settings. The last value is a comma-separated list of additional U.S. exchange closure dates in `YYYY-MM-DD` format.

## Deployment

The build emits a self-contained Worker at `dist/server/index.js`. On Sites, connect the `DB` D1 binding, apply the SQL migrations under `drizzle/`, and preserve the Sites identity gateway. The gateway must strip visitor-supplied `oai-authenticated-user-*` headers before it adds verified identity headers. The loopback development server uses a fixed local identity.

Configure a Worker Cron Trigger every minute to run the exported `scheduled` handler for unattended measurements. If the host provides an external job runner, set `DEPTHDESK_JOB_TOKEN` as a runtime secret and send a bearer-authenticated `POST` to `/api/jobs/sample` every minute. A private Site also requires platform service access. The local runtime starts the collector automatically. Multiple invocations are safe because each campaign has a unique five-minute measurement slot.

Public Metric catalog and quote reads do not require a Metric API key. Equity comparisons use Robinhood's stock quotes and the issuer's shares-per-token multiplier. Metric provides the USD conversion for the quote currency. Confirm the reference-data display terms for your audience before granting public access.

Campaigns score both directions at the requested size versus the campaign benchmark. The final-bin fill is a conservative proportional estimate based on quoted depth. The schedule includes missed observations in the denominator. Sponsors and curators arrange payment privately.

### Railway

Use Node.js 22.13 or newer, build with npm run build, and start with npm start. On Railway, the server listens at 0.0.0.0 on the injected PORT. Use /api/health for the health check. Attach a persistent volume at /data and set DEPTHDESK_DB=/data/depthdesk.db.

Railway serves the public pages and read APIs. Campaign writes require an identity provider integrated with the Railway runtime.

### Separate frontend and API

For a static frontend on a different origin, set the API's public origin as a frontend build variable. Set the frontend origin in the API service's runtime variables.

- Frontend build — VITE_API_URL=https://depthdesk-api.example.com
- API runtime — DEPTHDESK_ALLOWED_ORIGINS=https://depthdesk.example.com

Use full origins including the scheme, and separate multiple exact frontend origins with commas. Rebuild the frontend after changing the API URL. Leave these variables unset for same-origin requests. The API supports credentialed CORS for configured origins, and campaign writes still require an authenticated user. Authenticated campaign writes outside Sites require an identity provider.

## Commits

Use Conventional Commits in English. Favor one intent per commit.

- `feat(requests): add proposal acceptance`
- `fix(quotes): hide spreads for stale references`
- `refactor(server): share pool lookup logic`
- `test(campaigns): cover concurrent acceptance`
- `docs: update deployment instructions`

## Credits

- The landing page uses [Lightning by React Bits](https://reactbits.dev/backgrounds/lightning). The upstream license is retained in [src/vendor/react-bits/LICENSE.md](src/vendor/react-bits/LICENSE.md).
- The visual references were the [Awesome Design MD](https://github.com/VoltAgent/awesome-design-md) dark UI analyses for Linear and Kraken.
