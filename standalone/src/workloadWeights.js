// Transcribed from the Power BI model's "Workload Weight V3" DAX measure.
// Only issue types with an entry here count toward engineering workload -
// everything else (Opportunity, Production Finding, generic Subtask, ...)
// is out of scope for this weighting.
const WORKLOAD_WEIGHTS = {
  'Integration Execution': { '1 - Easy': 3, '2 - Medium': 5, '3 - Hard': 7, '4 - Super Hard': 15 },
  'Meta Integration Review': { '1 - Easy': 1, '2 - Medium': 2, '3 - Hard': 3, '4 - Super Hard': 6 },
  'Configuration Execution': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 3, '4 - Super Hard': 6 },
  'Configuration Sustainment': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2 },
  'Warehouse Execution': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2 },
  'Integration Finalization': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2 },
  'Operations Execution - Configuration': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'Operations Execution - Integration': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'Operations Execution - Warehousing': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'PgM Execution - Configuration': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'PgM Execution - Integration': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'PgM Execution - Warehousing': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
  'PgM Execution - IMS': { '1 - Easy': 0.5, '2 - Medium': 1, '3 - Hard': 2, '4 - Super Hard': 4 },
};

const CHILD_ISSUE_TYPES = Object.keys(WORKLOAD_WEIGHTS);

// Mirrors the DAX SWITCH: an (issue type, complexity) pair with no matching
// branch evaluates to BLANK, which is 0 in a SUM.
function workloadWeight(issueType, complexityLevel) {
  return WORKLOAD_WEIGHTS[issueType]?.[complexityLevel] ?? 0;
}

// Manually excluded from workload/backlog visuals and KPI totals - an
// editorial rule from the source Power BI report, not a technical one.
const EXCLUDED_ASSIGNEES = new Set(['Curt Petty']);

module.exports = { WORKLOAD_WEIGHTS, CHILD_ISSUE_TYPES, workloadWeight, EXCLUDED_ASSIGNEES };
