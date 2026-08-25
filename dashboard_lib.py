"""Shared aggregation and rendering logic for the FPT Opportunity dashboard.

Kept separate from generate_dashboard.py so the data-fetch step (live Jira
REST calls) and the aggregate/render step can be tested independently.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

JIRA_BROWSE_URL = "{base}/browse/{key}"

STATUS_ORDER_HINT = [
    "New",
    "Opp Quoting",
    "Opp Pending Account Team",
    "Opp Executing",
    "Opp Logistics",
    "Pending Response - Foundry Internal",
    "Follow-up",
    "On Hold",
    "In Production",
]

RAG_ORDER = ["Red", "Yellow", "Green", "None"]
RAG_STYLE = {
    "Green": {"hex": "#0ca30c", "label": "On track"},
    "Yellow": {"hex": "#fab219", "label": "At risk"},
    "Red": {"hex": "#d03b3b", "label": "Critical"},
    "None": {"hex": "#898781", "label": "Not set"},
}


@dataclass
class Opportunity:
    key: str
    summary: str
    status: str
    assignee: str
    priority: str
    created: datetime
    duedate: date | None
    updated: datetime
    rag: str
    category: str

    @property
    def age_days(self) -> int:
        return (date.today() - self.created.date()).days

    @property
    def is_overdue(self) -> bool:
        return self.duedate is not None and self.duedate < date.today()


def _top_n_with_other(counter: dict[str, int], n: int) -> list[tuple[str, int]]:
    ordered = sorted(counter.items(), key=lambda kv: kv[1], reverse=True)
    if len(ordered) <= n:
        return ordered
    head, tail = ordered[:n], ordered[n:]
    other_total = sum(c for _, c in tail)
    head.append(("Other", other_total))
    return head


def _ordered_counts(counter: dict[str, int], order_hint: list[str]) -> list[tuple[str, int]]:
    known = [(name, counter[name]) for name in order_hint if name in counter]
    unknown = sorted(
        ((name, c) for name, c in counter.items() if name not in order_hint),
        key=lambda kv: kv[1],
        reverse=True,
    )
    return known + unknown


def aggregate(opportunities: list[Opportunity], jira_base_url: str, aging_rows: int = 25) -> dict:
    total = len(opportunities)

    status_counts: dict[str, int] = {}
    rag_counts: dict[str, int] = {"Green": 0, "Yellow": 0, "Red": 0, "None": 0}
    category_counts: dict[str, int] = {}
    assignee_counts: dict[str, int] = {}
    overdue = 0
    unassigned = 0

    for o in opportunities:
        status_counts[o.status] = status_counts.get(o.status, 0) + 1
        rag_counts[o.rag] = rag_counts.get(o.rag, 0) + 1
        category_counts[o.category] = category_counts.get(o.category, 0) + 1
        assignee_counts[o.assignee] = assignee_counts.get(o.assignee, 0) + 1
        if o.is_overdue:
            overdue += 1
        if o.assignee == "Unassigned":
            unassigned += 1

    at_risk = [o for o in opportunities if o.rag in ("Red", "Yellow")]
    at_risk.sort(key=lambda o: (o.rag != "Red", -o.age_days))

    aging = sorted(opportunities, key=lambda o: o.age_days, reverse=True)[:aging_rows]

    max_status = max(status_counts.values()) if status_counts else 1
    max_category = max(category_counts.values()) if category_counts else 1

    assignee_top = _top_n_with_other(assignee_counts, 10)
    max_assignee = max((c for _, c in assignee_top), default=1)

    return {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M %Z").strip(),
        "jira_base_url": jira_base_url,
        "total": total,
        "overdue": overdue,
        "unassigned": unassigned,
        "at_risk_count": rag_counts.get("Red", 0) + rag_counts.get("Yellow", 0),
        "status_counts": _ordered_counts(status_counts, STATUS_ORDER_HINT),
        "max_status": max_status,
        "category_counts": _top_n_with_other(category_counts, 8),
        "max_category": max_category,
        "assignee_counts": assignee_top,
        "max_assignee": max_assignee,
        "rag_counts": [(name, rag_counts.get(name, 0)) for name in RAG_ORDER],
        "rag_style": RAG_STYLE,
        "at_risk": [_row(o, jira_base_url) for o in at_risk],
        "aging": [_row(o, jira_base_url) for o in aging],
    }


def _row(o: Opportunity, jira_base_url: str) -> dict:
    return {
        "key": o.key,
        "url": JIRA_BROWSE_URL.format(base=jira_base_url.rstrip("/"), key=o.key),
        "summary": o.summary.strip(),
        "status": o.status,
        "assignee": o.assignee,
        "priority": o.priority,
        "rag": o.rag,
        "age_days": o.age_days,
        "duedate": o.duedate.isoformat() if o.duedate else "",
        "is_overdue": o.is_overdue,
    }


def render(context: dict, template_dir: Path, template_name: str = "dashboard.html.j2") -> str:
    env = Environment(
        loader=FileSystemLoader(str(template_dir)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template(template_name)
    return template.render(**context)
