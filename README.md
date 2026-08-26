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

All 12 non-draft pages in the source file are now built (3 pages marked
"(Draft)" are excluded), in the source file's own order:

1. Opportunity Overview
2. Engineering Workload
3. Engineering Manager's Workload - scoped to Curt Petty & Taylor Lewis; two
   independent, overlapping status filters (not a clean active/backlog
   split), so it doesn't reuse the shared workload-aggregation helper
4. Engineering Staffing Planning - "Projected Workload" (Workload Weight V3
   gated by an unstarted Start date) plus a simplified timeline in place of
   the source report's Gantt chart
5. Overall Quotation Overview, 6. Warehousing, 7. Configuration, 8.
   Integration, 9. IMS Quotation - one shared `/api/quotation` dataset,
   filtered per tab client-side; simplified to one monthly-created trend
   (the source has two overlapping date-range charts) and an approximated
   Time To Completion (resolved date minus created date - the exact Power
   BI calculated-column formula wasn't available)
10. Operations Workload, 11. Program Management Workload - same
    shape as Engineering Workload, different issue types/status lists,
    sharing the same backend helper (`standalone/src/workloadAggregation.js`)
12. R&E Issue Tracking - shown as ranked bars instead of the source
    report's pie charts (easier to compare at a glance); the Created-date
    window is an assumed 180 days, not confirmed against the source filter

Every custom Jira field (Complexity Level, Opportunity Type, Start/Due date,
Production Finding Issue Source/Type, Systemic?) is resolved by display name
at runtime (`getFieldId` in `jiraClient.js`) rather than a hardcoded
`customfield_NNNNN`, so field-ID drift across Jira instances doesn't matter.

## Status

- [x] Jira aggregation logic - `server/src/jiraClient.js` (Option A, now
      stale) and `standalone/src/jiraClient.js` (Option B, active)
- [x] Tab shell matching the source report's page order
- [x] All 12 non-draft pages built against the `.pbix`'s actual filters,
      verified end-to-end against mocked Jira data
- [ ] Verify against real Jira data end to end (only exercised against a
      mock so far) - watch especially for the R&E date window, the
      Quotation "Time To Completion" approximation, and any custom field
      that `getFieldId` can't find by the names assumed here
- [ ] Pick one architecture (or keep both for different audiences)
- [ ] Option B: package as a distributable desktop app, if needed beyond
      developers comfortable with `npm start`
