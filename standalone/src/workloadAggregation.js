const { searchAll } = require('./jiraClient');
const { workloadWeight } = require('./workloadWeights');

// Batch-resolves each referenced parent Opportunity's type and summary.
// Jira's abbreviated `parent` object on a child issue only carries summary/
// status/priority/issuetype, not arbitrary custom fields, so getting the
// parent's Opportunity Type needs a second query keyed on the parent keys
// actually referenced by the issues in hand.
async function enrichWithParentOpportunity(issues, opportunityTypeField) {
  const parentKeys = [...new Set(issues.map((i) => i.fields.parent?.key).filter(Boolean))];
  const parentInfo = new Map();
  if (parentKeys.length > 0) {
    const parents = await searchAll(`key in (${parentKeys.join(',')})`, ['summary', opportunityTypeField]);
    for (const p of parents) {
      parentInfo.set(p.key, {
        summary: p.fields.summary,
        opportunityType: p.fields[opportunityTypeField]?.value ?? p.fields[opportunityTypeField] ?? 'Unknown',
      });
    }
  }
  return parentInfo;
}

function bucketFor(statusName, activeStatuses, backlogStatuses) {
  if (activeStatuses.has(statusName)) return 'active';
  if (backlogStatuses.has(statusName)) return 'backlog';
  return 'other';
}

// Shared shape for every "workload by assignee" page (Engineering Workload,
// Engineering Manager's Workload, Operations Workload, Program Management
// Workload): per-issue weight via Workload Weight V3, bucketed into
// active/backlog/other by that page's own status lists (these differ
// page-to-page in the source report - not a bug, just how each page's
// filters were authored), aggregated per assignee for the bullet charts.
function aggregateWorkload(
  issues,
  complexityField,
  {
    activeStatuses,
    backlogStatuses,
    excludedFromActiveChart = new Set(),
    excludedFromBacklogChart = new Set(),
    parentInfo = new Map(),
  }
) {
  const workloadByAssignee = new Map();
  const workItems = [];
  let activeCount = 0;
  let backlogCount = 0;

  const ensureEntry = (displayName) => {
    if (!workloadByAssignee.has(displayName)) {
      workloadByAssignee.set(displayName, { displayName, activeWeight: 0, backlogWeight: 0 });
    }
    return workloadByAssignee.get(displayName);
  };

  for (const issue of issues) {
    const displayName = issue.fields.assignee?.displayName || 'Unassigned';
    const issueType = issue.fields.issuetype?.name;
    const statusName = issue.fields.status?.name;
    const complexityValue = issue.fields[complexityField]?.value ?? issue.fields[complexityField] ?? null;
    const weight = workloadWeight(issueType, complexityValue);
    const bucket = bucketFor(statusName, activeStatuses, backlogStatuses);
    const parentKey = issue.fields.parent?.key;
    const parent = parentKey ? parentInfo.get(parentKey) : null;

    // The two bullet charts can exclude different assignees (e.g. a manager
    // left out of the active-workload view but still shown in backlog) -
    // each bucket checks its own exclusion set independently.
    if (bucket === 'active') {
      activeCount += 1;
      if (!excludedFromActiveChart.has(displayName)) ensureEntry(displayName).activeWeight += weight;
    } else if (bucket === 'backlog') {
      backlogCount += 1;
      if (!excludedFromBacklogChart.has(displayName)) ensureEntry(displayName).backlogWeight += weight;
    }

    workItems.push({
      key: issue.key,
      opportunitySummary: parent?.summary || '—',
      opportunityType: parent?.opportunityType || 'Unknown',
      issueType,
      status: statusName,
      bucket,
      complexity: complexityValue || '—',
      assignee: displayName,
    });
  }

  return {
    kpis: { activeCount, backlogCount },
    workload: [...workloadByAssignee.values()].map((w) => ({
      displayName: w.displayName,
      activeWeight: Math.round(w.activeWeight * 100) / 100,
      backlogWeight: Math.round(w.backlogWeight * 100) / 100,
    })),
    workItems,
  };
}

module.exports = { enrichWithParentOpportunity, aggregateWorkload };
