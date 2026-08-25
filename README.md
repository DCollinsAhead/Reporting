# Reporting

A live Jira dashboard for the Foundry Project Tracking (FPT) board, hosted as
a static prototype on Roost.

Roost only serves static HTML/JS/CSS - there's no server-side execution and
no publish API, so the dashboard can't safely hold a Jira API token or expect
a scheduled job to auto-republish it. Instead:

```
Jira (FPT project)
      ^
      | Basic auth (API token, server-side only)
      |
server/     Node/Express proxy - two read-only GET endpoints,
            short-lived in-memory cache
      ^
      | fetch() over HTTPS, every 15 min + manual refresh
      |
dashboard/  static HTML/CSS/JS, uploaded once to Roost
```

- `server/` - the backend proxy. See `server/README.md` for setup and env vars.
- `dashboard/` - the page that gets uploaded to Roost. See `dashboard/README.md`.

## Status

- [x] Proxy with `/api/status-summary` and `/api/assignee-workload`
- [x] Dashboard page with charts, table-view toggle, 15-minute auto-refresh
- [ ] Proxy deployed somewhere reachable over HTTPS
- [ ] `dashboard.js`'s `DEFAULT_API_BASE_URL` pointed at that deployment
- [ ] Uploaded to Roost
