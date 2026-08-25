# Reporting

A live Jira dashboard for the Foundry Project Tracking (FPT) board. Two
architectures have been built while comparing hosting options; neither is
picked as final yet.

## Option A: Roost-hosted (`server/` + `dashboard/`)

Roost only serves static HTML/JS/CSS - there's no server-side execution and
no publish API, so the dashboard can't safely hold a Jira API token or expect
a scheduled job to auto-republish it. Instead:

```
Jira (FPT project)
      ^
      | Basic auth (API token, server-side only)
      |
server/     Node/Express proxy - two read-only GET endpoints,
            short-lived in-memory cache, CORS-restricted
      ^
      | fetch() over HTTPS, every 15 min + manual refresh
      |
dashboard/  static HTML/CSS/JS, uploaded once to Roost
```

- `server/` - the backend proxy. See `server/README.md` for setup and env vars.
- `dashboard/` - the page that gets uploaded to Roost. See `dashboard/README.md`.

Needs: somewhere to host `server/` reachable over HTTPS, and a person to
upload `dashboard/`'s contents to a Roost prototype.

## Option B: standalone (`standalone/`)

Same two Jira queries and the same charts, but Roost is out of the picture
entirely. One process serves the API and the dashboard on the same origin
(`localhost`) and opens your browser to it - no CORS, no separate proxy to
host, no publish step.

```
Jira (FPT project)
      ^
      | Basic auth (API token, from your local .env)
      |
standalone/  Express server + static dashboard, one process, localhost only
      ^
      | fetch() to itself, on open + every 15 min + manual refresh
      |
your browser - opened automatically on start
```

See `standalone/README.md`. Needs: Node installed and `npm start` run by
each person who wants it - the tradeoff against Option A's shareable URL.
If this needs to reach people who won't run npm commands themselves, the
next step is wrapping `standalone/`'s server + static files in a Tauri or
Electron shell so it's a normal double-click app instead.

## Status

- [x] Jira aggregation logic (status summary, assignee workload) - built
      twice, identically, in `server/src/jiraClient.js` and
      `standalone/src/jiraClient.js`
- [x] Dashboard UI - charts, table-view toggle, 15-minute auto-refresh
- [x] Both variants verified end-to-end against a mocked Jira API
- [ ] Pick one architecture (or keep both for different audiences)
- [ ] Option A: deploy `server/`, point `dashboard.js` at it, upload to Roost
- [ ] Option B: package as a distributable desktop app, if needed beyond
      developers comfortable with `npm start`
