# FPT Dashboard (Roost)

Static HTML/CSS/JS - upload this folder's contents as-is to a Roost
prototype. It never talks to Jira directly; it calls the proxy in `../server`.

## Before publishing

1. Deploy `../server` somewhere reachable over HTTPS and note its URL.
2. In `dashboard.js`, set `DEFAULT_API_BASE_URL` to that URL.
3. Set the proxy's `ALLOWED_ORIGIN` env var to this page's Roost URL so CORS
   allows it.

To test against a proxy without editing the file, load the page with
`?api=https://your-proxy-url`.

## What's on the page

- **Issues by status** - every status Jira has configured for FPT, colored by
  workflow stage (To Do -> In Progress -> Done).
- **Open issues by assignee** - non-Done issue count per assignee.

Both charts have a "View as table" toggle for exact values, and refresh
automatically every 15 minutes plus on-demand via "Refresh now".
