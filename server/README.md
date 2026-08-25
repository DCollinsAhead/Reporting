# Jira Dashboard Proxy

Holds the Jira API token server-side and exposes two narrow, read-only,
GET-only endpoints for the FPT dashboard hosted on Roost. The static HTML
never sees the token - it only calls this proxy.

## Endpoints

- `GET /api/health` - liveness check.
- `GET /api/status-summary` - every status in use on the project, its
  workflow stage (`To Do` / `In Progress` / `Done`), and current issue count.
- `GET /api/assignee-workload` - open (non-Done) issue count per assignee.

Both are cached in memory for `CACHE_TTL_SECONDS` (default 300) so bursts of
page loads or a 15-minute client poll don't hammer Jira.

## Run locally

```
cd server
cp .env.example .env   # fill in JIRA_EMAIL / JIRA_API_TOKEN / ALLOWED_ORIGIN
npm install
npm start
```

Generate the Jira API token at
https://id.atlassian.com/manage-profile/security/api-tokens on an account
that has read access to the FPT project. Never commit `.env`.

## Deploying

This is a plain Express app - `npm start` runs it anywhere Node 18+ is
available (a VM, an App Service, a container). No deployment target was
chosen yet; when one is, the only things that change are how `ALLOWED_ORIGIN`,
`JIRA_API_TOKEN`, etc. get into the environment (e.g. Azure App Settings, AWS
Lambda env vars via a `serverless-http` wrapper) - the route code stays the
same.

Set `ALLOWED_ORIGIN` to the exact origin the dashboard is served from (e.g.
`https://roost.ahead.com`) - the proxy only accepts cross-origin requests
from that origin.
