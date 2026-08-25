# FPT Opportunity Dashboard

A static HTML report of open Foundry Project Tracking (FPT) Opportunities in
Jira, built to be hosted on [Roost](https://roost.ahead.com).

## Why this exists

Roost only serves static HTML/CSS/JS that a person uploads &mdash; there is no
live backend and no connector that lets an agent publish to it automatically
(confirmed with Justin Formella, Aug 2026). So this isn't a hosted web app;
it's a generator that produces one self-contained HTML file, which you then
upload to Roost yourself whenever you want a fresh snapshot.

## What it shows

Pulled from the `FPT` project, `Opportunity` issue type, open (non-Done) items
only:

- KPI tiles: total open, past due, unassigned, at risk (Yellow/Red)
- Health (RAG) breakdown
- Counts by status, category, and owner
- A table of everything currently flagged Yellow/Red
- A table of the oldest open opportunities

## Setup

```
pip install -r requirements.txt
cp .env.example .env   # fill in JIRA_EMAIL and JIRA_API_TOKEN, then `set -a; source .env; set +a`
```

Get a Jira API token at https://id.atlassian.com/manage-profile/security/api-tokens.

## Generate a snapshot

```
python generate_dashboard.py
```

Writes `output/fpt-opportunity-dashboard.html`. Open it locally to check it,
then upload that one file to Roost to publish it.

Options:
- `--output PATH` &mdash; write somewhere else
- `--aging-rows N` &mdash; rows in the "oldest open opportunities" table (default 25)

## Regenerating

There's no schedule baked in. Re-run `generate_dashboard.py` and re-upload to
Roost whenever you want the numbers refreshed &mdash; e.g. weekly, or before a
review. If Roost's write-access ("attribute sets") backend ever lands for the
Foundry Jira instance, this generate-then-upload step could be replaced with
a live view; until then this is the intended workflow.

## Files

- `generate_dashboard.py` &mdash; fetches open Opportunities from Jira and writes the HTML file
- `dashboard_lib.py` &mdash; aggregation (counts, RAG, aging) and template rendering, kept separate from the fetch step
- `templates/dashboard.html.j2` &mdash; the report layout/styling (AHEAD brand colors, Poppins)
