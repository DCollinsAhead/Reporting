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

This is now the active target: it's being rebuilt page-for-page against the
source `Foundry_Project_Tracking_Report.pbix`, so `server/` + `dashboard/`
(Option A) have fallen behind and reflect an earlier, less accurate version.

## Recreating the Power BI report

The dashboard is being rebuilt as a tab-per-page recreation of
`Foundry_Project_Tracking_Report.pbix`, using the report's own
`Report/definition/pages/*/page.json` and `visuals/*/visual.json` (a `.pbix`
is a zip; these are plain, readable JSON in the modern PBIR format) as
ground truth for filters and field bindings - not guessed from what the
charts look like. That caught several real mismatches versus an earlier,
guessed-at recreation (wrong issue-type list, wrong bucket-to-status
mapping, an assignee slicer that isn't actually in the source report).

12 non-draft pages exist in the source file, in this order (3 pages marked
"(Draft)" are excluded):

1. **Opportunity Overview** - built
2. **Engineering Workload** - built
3. Engineering Manager's Workload
4. Engineering Staffing Planning (includes a Gantt chart)
5. Overall Quotation Overview
6. Warehousing Quoting Overview
7. Configuration Quotation
8. Integration Quotation
9. IMS Quotation
10. Operations Workload
11. Program Management Workload
12. R&E Issue Tracking (includes pie charts)

Pages 3-12 render as an honest "not yet built" placeholder listing that
page's real visuals, rather than fake data.

## Status

- [x] Jira aggregation logic - `server/src/jiraClient.js` (Option A, now
      stale) and `standalone/src/jiraClient.js` (Option B, active)
- [x] Tab shell matching the source report's page order
- [x] Opportunity Overview and Engineering Workload built against the
      `.pbix`'s actual filters, verified end-to-end against mocked Jira data
- [ ] Pages 3-12 (see above)
- [ ] Pick one architecture (or keep both for different audiences)
- [ ] Option B: package as a distributable desktop app, if needed beyond
      developers comfortable with `npm start`
