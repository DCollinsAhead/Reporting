# FPT Dashboard - standalone

The simplest of the three variants explored so far: one local app, no Roost,
no separate proxy to host. Run it, and it starts a tiny local server, serves
the dashboard from that same server, and opens your default browser to it.

```
Jira (FPT project)
      ^
      | Basic auth (API token, from your .env)
      |
this app - Express server + static dashboard, one process,
           listening on localhost only
      ^
      | fetch() to itself (same origin - no CORS needed)
      |
your browser - opened automatically on start
```

## Run it

```
cd standalone
cp .env.example .env   # fill in JIRA_EMAIL / JIRA_API_TOKEN
npm install
npm start
```

Generate the Jira API token at
https://id.atlassian.com/manage-profile/security/api-tokens on an account
that has read access to the FPT project. Never commit `.env`.

This opens `http://localhost:4287` (or whatever `PORT` you set) in your
browser. Leave the terminal running - closing it stops the server. The page
auto-refreshes every 5 minutes and has a manual "Refresh now" button.

## How this compares to `../server` + `../dashboard`

That pair assumes the dashboard is hosted on Roost and viewed by anyone in a
browser, which is why it needs CORS, a shared secret sitting on a server
someone has to keep running, and a plan for how the HTML gets published.
This variant drops all of that by making it a single app each person runs
for themselves - at the cost of needing Node installed and a terminal left
open, which is the next thing to solve if this needs to go to people who
aren't going to run `npm start` themselves (see the Tauri/Electron
discussion - this app's `src/` and `public/` are what that shell would wrap).
