#!/usr/bin/env python3
"""Generate a static HTML snapshot of open FPT Opportunities for Roost.

Roost (roost.ahead.com) only serves static files uploaded by a person - there
is no live backend and no auto-publish connector. This script is the
"regenerate" half of that workflow: run it whenever you want a fresh
snapshot, then upload the resulting HTML file to Roost yourself.

Usage:
    export JIRA_EMAIL="you@ahead.com"
    export JIRA_API_TOKEN="..."          # https://id.atlassian.com/manage-profile/security/api-tokens
    python generate_dashboard.py

Optional env vars:
    JIRA_BASE_URL   default: https://ahd-foundry.atlassian.net
    JIRA_PROJECT    default: FPT
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import date, datetime
from pathlib import Path

import requests

from dashboard_lib import Opportunity, aggregate, render

# Custom field IDs are specific to the ahd-foundry Jira site/FPT project schema.
RAG_FIELD = "customfield_13537"
CATEGORY_FIELD = "customfield_11433"

FIELDS = [
    "summary",
    "status",
    "assignee",
    "priority",
    "created",
    "duedate",
    "updated",
    RAG_FIELD,
    CATEGORY_FIELD,
]


def parse_jira_datetime(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%dT%H:%M:%S.%f%z")


def fetch_open_opportunities(base_url: str, email: str, token: str, project: str) -> list[Opportunity]:
    jql = f"project = {project} AND issuetype = Opportunity AND statusCategory != Done ORDER BY created ASC"
    session = requests.Session()
    session.auth = (email, token)
    session.headers["Accept"] = "application/json"

    opportunities: list[Opportunity] = []
    next_page_token: str | None = None
    while True:
        params = {
            "jql": jql,
            "fields": ",".join(FIELDS),
            "maxResults": 100,
        }
        if next_page_token:
            params["nextPageToken"] = next_page_token

        resp = session.get(f"{base_url.rstrip('/')}/rest/api/3/search/jql", params=params, timeout=30)
        resp.raise_for_status()
        payload = resp.json()

        for issue in payload.get("issues", []):
            opportunities.append(_to_opportunity(issue))

        if not payload.get("nextPageToken"):
            break
        next_page_token = payload["nextPageToken"]

    return opportunities


def _to_opportunity(issue: dict) -> Opportunity:
    fields = issue["fields"]
    assignee = fields.get("assignee")
    rag = fields.get(RAG_FIELD)
    category = fields.get(CATEGORY_FIELD)
    duedate_raw = fields.get("duedate")

    return Opportunity(
        key=issue["key"],
        summary=fields.get("summary") or "",
        status=fields["status"]["name"],
        assignee=assignee["displayName"] if assignee else "Unassigned",
        priority=fields["priority"]["name"] if fields.get("priority") else "None",
        created=parse_jira_datetime(fields["created"]),
        duedate=date.fromisoformat(duedate_raw) if duedate_raw else None,
        updated=parse_jira_datetime(fields["updated"]),
        rag=rag["value"] if rag else "None",
        category=category["value"] if category else "Uncategorized",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        default="output/fpt-opportunity-dashboard.html",
        help="Path to write the generated HTML file (default: %(default)s)",
    )
    parser.add_argument("--aging-rows", type=int, default=25, help="Rows to show in the aging table")
    args = parser.parse_args()

    base_url = os.environ.get("JIRA_BASE_URL", "https://ahd-foundry.atlassian.net")
    project = os.environ.get("JIRA_PROJECT", "FPT")
    email = os.environ.get("JIRA_EMAIL")
    token = os.environ.get("JIRA_API_TOKEN")

    if not email or not token:
        print("JIRA_EMAIL and JIRA_API_TOKEN must be set.", file=sys.stderr)
        return 1

    opportunities = fetch_open_opportunities(base_url, email, token, project)
    context = aggregate(opportunities, jira_base_url=base_url, aging_rows=args.aging_rows)

    html = render(context, template_dir=Path(__file__).parent / "templates")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")
    print(f"Wrote {output_path} ({len(opportunities)} open opportunities)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
